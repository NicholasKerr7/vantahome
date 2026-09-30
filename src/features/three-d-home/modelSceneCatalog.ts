import { DEVICES, type PresetId } from "../../../packages/home-scene/src/data";
import {
  applyModelPreset,
  MODEL_SCENE_PRESETS,
  isModelPreset,
} from "../../../packages/home-scene/src/modelScenePresets";
import { createDefaultSimulationSnapshot } from "../../../packages/home-scene/src/simulationBridgeProtocol";
import {
  MAX_SCENE_CATALOG_ITEMS,
  SCENE_CATALOG_CHANNEL,
  type SceneCatalog,
  type SceneCatalogMessage,
} from "../../../packages/home-scene/src/sceneCatalogProtocol";
import { runtimePolicy, type RuntimeMode } from "../../config/runtimeMode";
import { sceneIsVisible, sceneScopeLabel } from "../scenes/sceneScope";
import type { HomeState, Scene } from "../../store/useHomeStore";
import { isModelHome } from "./modelHomeScope";
import { HOST_CONTROL_FIELDS, projectModelSnapshot } from "./modelHomeCatalog";

export const MODEL_SCENE_CATALOG_VERSION = 1;

/** Seed readable native actions from the exact shared preset reducer, omitting untouched gas devices. */
export function createModelScenes(): Scene[] {
  return MODEL_SCENE_PRESETS.map((preset) => {
    const snapshot = applyModelPreset(
      createDefaultSimulationSnapshot(),
      preset.id,
    );
    const devices = projectModelSnapshot(
      DEVICES.map((device) => ({
        id: device.id,
        name: device.name,
        kind: device.kind,
        roomId: device.roomId,
        isOn: true,
      })),
      snapshot,
    );
    return {
      id: preset.sceneId,
      name: preset.name,
      scope: "home",
      roomId: "",
      modelPreset: preset.id,
      actions: devices
        .filter(
          (device) => device.kind !== "gas-meter" && device.kind !== "gas-leak",
        )
        .map((device) => {
          // Readings and sample observations are never commands, including after a default is edited.
          const patch: Partial<typeof device> = { isOn: device.isOn };
          for (const field of HOST_CONTROL_FIELDS) {
            const value = device[field];
            if (value !== undefined) Object.assign(patch, { [field]: value });
          }
          return { type: "patch" as const, deviceId: device.id, patch };
        }),
    };
  });
}

/** Add defaults once; never overwrite user scenes, resurrect deleted defaults, or mutate account homes. */
export function upgradeModelSceneCatalog(
  state: HomeState,
  mode: RuntimeMode = runtimePolicy.mode,
): Partial<HomeState> {
  if (
    !isModelHome(state, mode) ||
    state.modelSceneCatalogVersion === MODEL_SCENE_CATALOG_VERSION
  )
    return {};
  const ids = new Set(state.scenes.map((scene) => scene.id));
  return {
    modelSceneCatalogVersion: MODEL_SCENE_CATALOG_VERSION,
    scenes: [
      ...state.scenes,
      ...createModelScenes().filter((scene) => !ids.has(scene.id)),
    ],
  };
}

/** Recheck local Owner scope for every catalog publication and execution, including stale callbacks. */
export function canShareModelScenes(
  state: HomeState,
  mode: RuntimeMode = runtimePolicy.mode,
): boolean {
  return (
    isModelHome(state, mode) &&
    state.household.some(
      (member) => member.id === state.activeMemberId && member.role === "Owner",
    )
  );
}

/** A known preset and its canonical ID must agree; names and arbitrary metadata never select semantics. */
export function modelPresetForScene(
  state: HomeState,
  scene: Scene,
  mode: RuntimeMode = runtimePolicy.mode,
): PresetId | null {
  if (
    !canShareModelScenes(state, mode) ||
    !isModelPreset(scene.modelPreset) ||
    !MODEL_SCENE_PRESETS.some(
      (preset) =>
        preset.id === scene.modelPreset && preset.sceneId === scene.id,
    )
  )
    return null;
  return scene.modelPreset;
}

/** Publish only scene metadata from the same visible native collection; actions and private fields stay local. */
export function modelSceneCatalog(
  state: HomeState,
  mode: RuntimeMode = runtimePolicy.mode,
): SceneCatalog {
  if (!canShareModelScenes(state, mode))
    return { scenes: [], activeSceneId: null };
  const scenes = state.scenes
    .filter((scene) => sceneIsVisible(scene, state.rooms, state.devices))
    .slice(0, MAX_SCENE_CATALOG_ITEMS)
    .map((scene) => ({
      id: scene.id,
      name:
        scene.name.replace(/[\u0000-\u001f]/gu, "").slice(0, 120) || "Scene",
      scope:
        sceneScopeLabel(scene, state.rooms)
          .replace(/[\u0000-\u001f]/gu, "")
          .slice(0, 120) || "Home",
      deviceCount: new Set(scene.actions.map((action) => action.deviceId)).size,
    }));
  return {
    scenes,
    activeSceneId:
      state.activeSceneId &&
      scenes.some((scene) => scene.id === state.activeSceneId)
        ? state.activeSceneId
        : null,
  };
}

/** Renderers receive a data literal through their dedicated catalog event, never injected executable content. */
export function nativeSceneCatalogScript(message: SceneCatalogMessage): string {
  const payload = JSON.stringify(message)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `window.dispatchEvent(new CustomEvent('${SCENE_CATALOG_CHANNEL}',{detail:${payload}}));true;`;
}
