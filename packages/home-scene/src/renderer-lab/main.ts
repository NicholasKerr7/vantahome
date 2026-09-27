import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, Mesh,
  MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, PointLight,
  Raycaster, Scene, Vector2, Vector3, WebGLRenderer, type Group, type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { INITIAL_STATE, parseLabState, postLabMessage, type LabDevice, type ModelName } from './contracts';
import { FrameMetrics } from './frameMetrics';
import { disposeModels, loadEmbeddedModel, modelsForView } from './models';
import { createSolarLights, setSolarNight, type SolarLamp } from './solarLights';
import { createStormEffects, type StormEffects } from './stormEffects';
import { BEDROOM_LIGHT_COLOR, BEDROOM_LIGHT_INTENSITY, BEDROOM_LIGHT_RADIUS, BEDROOM_LIGHT_RIG, bedroomLightAppearance, type BedroomLightRig } from './bedroomLighting';
import presets from './presets.json';
import './renderer-lab.css';

const statusElement = document.getElementById('status');

/** Surface rendering failures to both the native error UI and standalone browser preview. */
function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : 'The comparison scene could not render.';
  if (statusElement) { statusElement.textContent = message; statusElement.hidden = false; }
  postLabMessage({ type: 'error', message });
}

/** Construct a bounded Three.js baseline using the same assets and inputs as Filament. */
async function startLab(): Promise<void> {
  const container = document.getElementById('scene');
  if (!container) throw new Error('The comparison scene container is missing.');
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Renderer comparison. Drag to orbit, pinch to zoom, or tap a light, blind, or gate to select its controls.');
  container.append(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(presets.camera.fov, 1, presets.camera.near, presets.camera.far);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minPolarAngle = 0.08;
  controls.listenToKeyEvents(canvas);
  const ambient = new HemisphereLight('#e8f3ff', '#60715e', 1.9);
  const sun = new DirectionalLight('#fff2d9', 3.1);
  sun.position.set(-15, 32, -18);
  sun.target.position.set(10, 0, -7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 110;
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.0003;
  scene.add(ambient, sun, sun.target);

  let state = { ...INITIAL_STATE };
  if (window.__VANTA_LAB_INITIAL_VIEW__ === 'property') state.view = 'property';
  let models: Partial<Record<ModelName, Group>> = {};
  let loadedRoots: Group[] = [];
  let disposed = false;
  let loadGeneration = 0;
  let frameId = 0;
  let previousFrame = 0;
  let stormEffects: StormEffects | null = null;
  let currentBlinds = state.blinds;
  let currentGate = state.gate;
  let cameraFit = 1;
  const pointLights: { light: PointLight; id: BedroomLightRig['id'] }[] = [];
  let solarLamps: SolarLamp[] = [];
  const emissiveMaterials = new Map<MeshStandardMaterial, { original: Color; id: BedroomLightRig['id'] }>();
  const metrics = new FrameMetrics();
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const activePointers = new Set<number>();
  let tap: { id: number; x: number; y: number; time: number } | null = null;

  // Shader compilation errors do not throw from Three.js. Route them through the
  // same visible error boundary, releasing the scene after the current draw returns.
  renderer.debug.onShaderError = () => {
    if (disposed) return;
    reportError(new Error('The scene shaders could not render on this device. Reopen the comparison to retry.'));
    queueMicrotask(dispose);
  };

  /** Reset framing deterministically when switching test cases or using Reset view. */
  function resetCamera(): void {
    const preset = presets[state.view];
    controls.enableDamping = false;
    controls.update();
    camera.position.fromArray(preset.eye);
    controls.target.fromArray(preset.target);
    cameraFit = Math.max(1, 0.8 / camera.aspect);
    camera.position.sub(controls.target).multiplyScalar(cameraFit).add(controls.target);
    controls.minDistance = preset.minDistance;
    controls.maxDistance = preset.maxDistance;
    camera.lookAt(controls.target);
    controls.update();
    controls.saveState();
    controls.enableDamping = state.motion;
  }

  /** Reapply appearance and visibility without rebuilding geometry or GPU resources. */
  function applyState(): void {
    const bedroom = state.view === 'bedroom';
    for (const name of ['upper', 'fixtures'] as const) if (models[name]) models[name].visible = bedroom;
    for (const name of ['exterior', 'landscape', 'gate', 'solar'] as const) if (models[name]) models[name].visible = !bedroom;
    // The weather asset also owns replacement rooted foliage, including on clear days.
    if (models.rain) models.rain.visible = !bedroom;
    scene.background = new Color(state.night ? '#101d2d' : '#d9e6e5');
    ambient.intensity = state.night ? 0.6 : 1.9;
    sun.intensity = state.night ? 0.32 : 3.1;
    sun.color.set(state.night ? '#a5bdff' : '#fff2d9');
    controls.enableDamping = state.motion;
    for (const { light, id } of pointLights) {
      const appearance = bedroomLightAppearance(id, state.lights, state.lightStates);
      light.intensity = bedroom ? BEDROOM_LIGHT_INTENSITY * appearance.gain : 0;
      light.color.set(appearance.color);
    }
    setSolarNight(solarLamps, !bedroom && state.night);
    for (const [material, { original, id }] of emissiveMaterials) {
      const appearance = bedroomLightAppearance(id, state.lights, state.lightStates);
      if (appearance.customized) material.emissive.set(appearance.color);
      else material.emissive.copy(original);
      material.emissiveIntensity = appearance.gain * 1.5;
    }
    stormEffects?.apply(state);
  }

  /** Keep the render target matched to the host viewport without inline authored styling. */
  function resize(): void {
    const width = Math.max(container!.clientWidth, 1);
    const height = Math.max(container!.clientHeight, 1);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height, false);
    stormEffects?.resize(height);
    camera.aspect = width / height;
    const nextFit = Math.max(1, 0.8 / camera.aspect);
    camera.position.sub(controls.target).multiplyScalar(nextFit / cameraFit).add(controls.target);
    cameraFit = nextFit;
    camera.updateProjectionMatrix();
    metrics.reset();
  }

  /** Apply the shared deterministic pose law; reduced motion makes device changes immediate. */
  function animate(delta: number): void {
    const blend = state.motion ? 1 - Math.exp(-presets.animationResponse * delta) : 1;
    currentBlinds += (state.blinds - currentBlinds) * blend;
    currentGate += (state.gate - currentGate) * blend;
    const blind = models.fixtures?.getObjectByName('lab-blind-fabric');
    if (blind) {
      blind.scale.y = 1 - presets.blindScaleTravel * currentBlinds / 100;
      blind.position.y = presets.blindOrigin[1] + presets.blindLift * currentBlinds / 100;
    }
    if (models.gate) {
      models.gate.position.set(presets.gateOrigin[0] + presets.gateTravel * currentGate / 100, presets.gateOrigin[1], presets.gateOrigin[2]);
    }
    stormEffects?.update(delta);
  }

  /** Record callback cadence independently of GPU timing, while pausing hidden pages. */
  function render(now: number): void {
    if (disposed || document.hidden) return;
    const delta = previousFrame ? Math.min((now - previousFrame) / 1000, 0.08) : 0;
    previousFrame = now;
    animate(delta);
    controls.update();
    try { renderer.render(scene, camera); }
    catch (error) { reportError(error); dispose(); return; }
    metrics.record(now);
    frameId = requestAnimationFrame(render);
  }

  /** Cancel work in the background and exclude resume latency from the metrics window. */
  function syncVisibility(): void {
    cancelAnimationFrame(frameId);
    previousFrame = 0;
    metrics.reset();
    if (!document.hidden && !disposed && loadedRoots.length) frameId = requestAnimationFrame(render);
  }

  /** Track tap candidates separately from orbit drags and two-finger gestures. */
  function pointerDown(event: PointerEvent): void {
    activePointers.add(event.pointerId);
    tap = activePointers.size === 1 ? { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() } : null;
  }

  /** Invalidate a tap as soon as the visitor drags or pinches the scene. */
  function pointerMove(event: PointerEvent): void {
    if (tap && tap.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) tap = null;
  }

  /** Select a mapped simulation control by raycasting the nearest visible model surface. */
  function pointerUp(event: PointerEvent): void {
    activePointers.delete(event.pointerId);
    if (!tap || tap.id !== event.pointerId || performance.now() - tap.time > 600) { tap = null; return; }
    tap = null;
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const candidates = loadedRoots.filter((root) => root.visible && root !== models.rain);
    const hit = raycaster.intersectObjects(candidates, true).find((entry) => isVisible(entry.object));
    let object: Object3D | null = hit?.object ?? null;
    while (object) {
      const device = object.userData.labDevice as LabDevice | undefined;
      if (device) { postLabMessage({ type: 'select', device }); return; }
      object = object.parent;
    }
    // Fixture bodies belong to the original merged floor mesh. A nearby visible hit
    // should still select the light when its small emissive underside is occluded.
    if (state.view === 'bedroom' && hit && pointLights.some(({ light }) => light.position.distanceTo(hit.point) < 0.5)) {
      postLabMessage({ type: 'select', device: 'lights' });
    }
  }

  /** Clear a cancelled pointer without interpreting interrupted gestures as taps. */
  function pointerCancel(event: PointerEvent): void {
    activePointers.delete(event.pointerId);
    tap = null;
  }

  /** Handle graphics process/context failures explicitly instead of leaving a frozen scene. */
  function contextLost(event: Event): void {
    event.preventDefault();
    reportError(new Error('The graphics context was interrupted. Reopen the renderer comparison to retry.'));
    dispose();
  }

  /** Accept settings only from the same-origin containing preview, never unrelated frames. */
  function hostMessage(event: MessageEvent): void {
    if (event.source !== window.parent || event.origin !== window.location.origin) return;
    if (!event.data || typeof event.data !== 'object' || event.data.type !== 'lab-settings') return;
    window.__VANTA_LAB_UPDATE__?.(event.data.settings);
  }

  /** Release listeners, animation callbacks, model allocations, and the WebGL context. */
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frameId);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pagehide', dispose);
    window.removeEventListener('message', hostMessage);
    document.removeEventListener('visibilitychange', syncVisibility);
    canvas.removeEventListener('pointerdown', pointerDown);
    canvas.removeEventListener('pointermove', pointerMove);
    canvas.removeEventListener('pointerup', pointerUp);
    canvas.removeEventListener('pointercancel', pointerCancel);
    canvas.removeEventListener('webglcontextlost', contextLost);
    window.__VANTA_LAB_UPDATE__ = undefined;
    controls.dispose();
    stormEffects?.dispose();
    for (const { light } of solarLamps) light.dispose();
    disposeModels(loadedRoots);
    sun.shadow.map?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  /** Load only the chosen case, discarding the previous scene's decoded GPU resources. */
  async function loadView(): Promise<void> {
    const generation = ++loadGeneration;
    cancelAnimationFrame(frameId);
    stormEffects?.dispose();
    stormEffects = null;
    for (const root of loadedRoots) scene.remove(root);
    for (const { light } of pointLights) scene.remove(light);
    for (const { light } of solarLamps) light.dispose();
    disposeModels(loadedRoots);
    loadedRoots = [];
    models = {};
    pointLights.length = 0;
    solarLamps = [];
    emissiveMaterials.clear();
    if (statusElement) { statusElement.textContent = 'Preparing house comparison…'; statusElement.hidden = false; }
    const names = modelsForView(state.view);
    // Wait for siblings to settle so a failed asset cannot strand their GPU resources.
    const results = await Promise.allSettled(names.map(loadEmbeddedModel));
    const roots = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    const failure = results.find((result) => result.status === 'rejected');
    if (disposed || generation !== loadGeneration || failure?.status === 'rejected') {
      disposeModels(roots);
      if (!disposed && generation === loadGeneration && failure?.status === 'rejected') {
        dispose();
        throw failure.reason;
      }
      return;
    }
    loadedRoots = roots;
    models = Object.fromEntries(names.map((name, index) => [name, roots[index]]));
    for (const model of loadedRoots) scene.add(model);
    if (models.gate) models.gate.userData.labDevice = 'gate';
    if (models.solar) solarLamps = createSolarLights(models.solar);
    if (models.rain && models.landscape && models.exterior) {
      try {
        stormEffects = createStormEffects({ scene, weatherModel: models.rain, landscape: models.landscape, exterior: models.exterior, ambient, sun });
        stormEffects.resize(container!.clientHeight);
      } catch (error) {
        dispose();
        throw error;
      }
    }
    const blind = models.fixtures?.getObjectByName('lab-blind-fabric');
    if (blind) blind.userData.labDevice = 'blinds';
    for (const rig of BEDROOM_LIGHT_RIG) {
      const fixture = models.fixtures?.getObjectByName(`lab-light-${rig.id}`);
      if (!fixture) continue;
      fixture.userData.labDevice = 'lights';
      fixture.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          if (material instanceof MeshStandardMaterial) emissiveMaterials.set(material, { original: material.emissive.clone(), id: rig.id });
        }
      });
      const lamp = new PointLight(BEDROOM_LIGHT_COLOR, BEDROOM_LIGHT_INTENSITY, BEDROOM_LIGHT_RADIUS, 2);
      lamp.position.fromArray(rig.position);
      scene.add(lamp);
      pointLights.push({ light: lamp, id: rig.id });
    }
    applyState();
    animate(0);
    if (statusElement) statusElement.hidden = true;
    postLabMessage({ type: 'ready' });
    syncVisibility();
  }

  window.__VANTA_LAB_UPDATE__ = (value) => {
    const next = parseLabState(value);
    if (!next || disposed) return;
    const viewChanged = next.view !== state.view;
    const shouldReset = next.view !== state.view || next.resetKey !== state.resetKey;
    state = next;
    if (shouldReset) { stormEffects?.reset(); resetCamera(); }
    applyState();
    metrics.reset();
    if (viewChanged) void loadView().catch(reportError);
  };
  window.addEventListener('resize', resize);
  window.addEventListener('pagehide', dispose);
  window.addEventListener('message', hostMessage);
  document.addEventListener('visibilitychange', syncVisibility);
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerCancel);
  canvas.addEventListener('webglcontextlost', contextLost);
  resize();
  resetCamera();

  await loadView();
}

/** Raycasting does not automatically exclude objects hidden by an ancestor group. */
function isVisible(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) { if (!current.visible) return false; current = current.parent; }
  return true;
}

void startLab().catch(reportError);
