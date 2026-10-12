import type { Device, Scene, SceneAction } from '../../store/useHomeStore';

type SceneTarget = { device: Device; patch: Partial<Device>; togglesPower: boolean };
const POSITION_KINDS: readonly Device['kind'][] = ['gate', 'garage', 'door', 'window', 'blinds'];
export type SceneOutcome = {
  summary: string;
  effects: string[];
  importantEffects: string[];
  impact: string | null;
  deviceCount: number;
  simulationOnly: boolean;
};

/** Merge sequential desired settings without treating a live reading as a promised scene outcome. */
function sceneTargets(actions: readonly SceneAction[], devices: readonly Device[]) {
  const directory = new Map(devices.map((device) => [device.id, device]));
  const targets = new Map<string, SceneTarget>();
  let unavailable = false;
  for (const action of actions) {
    const device = directory.get(action.deviceId);
    if (!device) { unavailable = true; continue; }
    const target = targets.get(device.id) ?? { device, patch: {}, togglesPower: false };
    // A later power action can change an opening; do not retain a stale earlier position promise.
    if (POSITION_KINDS.includes(device.kind) && (action.type === 'toggle' || typeof action.patch.isOn === 'boolean')) {
      delete target.patch.openPercent;
    }
    if (action.type === 'patch') {
      Object.assign(target.patch, action.patch);
      if (typeof action.patch.isOn === 'boolean') target.togglesPower = false;
    } else if (typeof action.on === 'boolean') {
      target.patch.isOn = action.on;
      target.togglesPower = false;
    } else if (typeof target.patch.isOn === 'boolean') {
      target.patch.isOn = !target.patch.isOn;
    } else {
      target.togglesPower = true;
    }
    // Virtual camera power and arming are the same capability in the scene reducer.
    // Physical camera patches retain both independent requests and must show both.
    if (device.kind === 'camera' && device.simulationOnly) {
      if (action.type === 'patch' && typeof action.patch.armed === 'boolean') {
        target.patch.isOn = action.patch.armed;
        target.togglesPower = false;
      } else if (action.type === 'toggle' || typeof action.patch.isOn === 'boolean') {
        if (typeof target.patch.isOn === 'boolean') target.patch.armed = target.patch.isOn;
        else delete target.patch.armed;
      }
    }
    targets.set(device.id, target);
  }
  return { targets: [...targets.values()], unavailable };
}

/** State only explicit power intent; an unspecified toggle cannot promise on or off. */
function powerIntent(target: SceneTarget): string | null {
  if (target.togglesPower) return 'toggles';
  return typeof target.patch.isOn === 'boolean' ? (target.patch.isOn ? 'on' : 'off') : null;
}

/** Format desired positions without presenting a closed door as a verified lock. */
function positionIntent(value: number): string {
  if (value === 0) return 'closed';
  if (value === 100) return 'open';
  return `${Math.round(value)}% open`;
}

/** Expose protection changes even when the same action turns an appliance off. */
export function sceneSafetyEffects(device: Device, patch: Partial<Device>): string[] {
  const fields: Partial<Record<Device['kind'], readonly (readonly [keyof Device, string])[]>> = {
    stove: [['stoveLock', 'child lock']],
    water: [['waterAutoShutoff', 'automatic water shutoff'], ['waterLeakAlerts', 'water leak alerts'], ['waterPressureAlerts', 'pressure alerts']],
    'gas-leak': [['gasAutoShutoff', 'automatic gas shutoff'], ['gasLeakAlerts', 'gas leak alerts']],
    'gas-meter': [['gasUsageAlerts', 'gas usage alerts'], ['gasRefillAlerts', 'gas refill alerts']],
    gate: [['autoOpenEnabled', 'auto-open preference']],
  };
  return (fields[device.kind] ?? []).flatMap(([field, label]) =>
    typeof patch[field] === 'boolean' ? [`${label} ${patch[field] ? 'on' : 'off'}`] : []);
}

/** Describe each affected device from the command fields, with power ahead of saved setpoints. */
function targetEffect(target: SceneTarget): string {
  const { device, patch } = target;
  const parts: string[] = [];
  if (POSITION_KINDS.includes(device.kind) && Number.isFinite(patch.openPercent)) {
    parts.push(positionIntent(patch.openPercent!));
  } else if (!(device.kind === 'camera' && typeof patch.armed === 'boolean' && patch.isOn === patch.armed && !target.togglesPower)) {
    const power = powerIntent(target);
    if (power) parts.push(power);
  }
  if (patch.isOn !== false && Number.isFinite(patch.brightness)) parts.push(`${Math.round(patch.brightness!)}% brightness`);
  if (patch.isOn !== false && Number.isFinite(patch.tempC)) parts.push(`${patch.tempC}°C`);
  if (device.kind === 'camera') {
    if (typeof patch.armed === 'boolean') parts.push(patch.armed ? 'armed' : 'disarmed');
    if (typeof patch.recording === 'boolean') parts.push(patch.recording ? 'recording on' : 'recording off');
  }
  if (typeof patch.gasValveOpen === 'boolean') parts.push(patch.gasValveOpen ? 'gas valve open' : 'gas valve closed');
  if (device.kind === 'stove' && patch.isOn !== false && Number.isFinite(patch.burnerLevel)) parts.push(`burner level ${patch.burnerLevel}`);
  parts.push(...sceneSafetyEffects(device, patch));
  return `${device.name}: ${parts.join(', ') || 'saved settings'}`;
}

/** Compress light targets into an outcome, retaining off lights instead of counting their stored brightness. */
function lightEffect(targets: readonly SceneTarget[]): string | null {
  if (!targets.length) return null;
  if (targets.length === 1) return targetEffect(targets[0]);
  const on = targets.filter((target) => target.patch.isOn === true && !target.togglesPower);
  const off = targets.filter((target) => target.patch.isOn === false && !target.togglesPower);
  const other = targets.length - on.length - off.length;
  const label = `${targets.length} lights`;
  if (off.length === targets.length) return `${label} off`;
  if (on.length === targets.length) {
    const levels = on.map((target) => target.patch.brightness);
    if (levels.every((level): level is number => typeof level === 'number' && Number.isFinite(level))) {
      const min = Math.min(...levels);
      const max = Math.max(...levels);
      return `${label} on at ${min === max ? min : `${min}–${max}`}%`;
    }
    return `${label} on`;
  }
  const parts = [on.length ? `${on.length} on` : '', off.length ? `${off.length} off` : '', other ? `${other} ${other === 1 ? 'setting' : 'settings'}` : ''].filter(Boolean);
  return `Lights: ${parts.join(' / ')}`;
}

/** Group equivalent climate/media targets, while preserving different explicit setpoints. */
function groupedEffects(targets: readonly SceneTarget[], label: string): string[] {
  if (!targets.length) return [];
  const intents = new Map<string, SceneTarget[]>();
  for (const target of targets) {
    const intent = targetEffect(target).slice(target.device.name.length + 2);
    intents.set(intent, [...(intents.get(intent) ?? []), target]);
  }
  return [...intents.entries()].map(([intent, group]) => group.length === 1
    ? targetEffect(group[0]) : `${group.length} ${label}: ${intent}`);
}

/** Explain actual saved actions, not editable scene names or assumed physical completion. */
export function sceneOutcome(scene: Pick<Scene, 'actions'>, devices: readonly Device[], modelHome = false): SceneOutcome {
  const { targets, unavailable } = sceneTargets(scene.actions, devices);
  const lights = targets.filter(({ device }) => device.kind === 'light');
  const televisions = targets.filter(({ device }) => device.kind === 'tv');
  const climate = targets.filter(({ device }) => device.kind === 'ac');
  const blinds = targets.filter(({ device }) => device.kind === 'blinds');
  const entries = targets.filter(({ device }) => ['gate', 'garage', 'door', 'window'].includes(device.kind));
  const cameras = targets.filter(({ device }) => device.kind === 'camera');
  const safety = targets.filter(({ device }) => ['gas-meter', 'gas-leak', 'smoke', 'stove', 'water'].includes(device.kind));
  const important = [...entries, ...cameras, ...safety];
  const categories = [entries.length ? 'entry' : '', cameras.length ? 'camera' : '', safety.length ? 'safety' : ''].filter(Boolean);
  const primaryEffects = [lightEffect(lights), ...groupedEffects(televisions, 'TVs'), ...groupedEffects(climate, 'AC units'), ...groupedEffects(blinds, 'blinds')].filter((effect): effect is string => effect !== null);
  const effects = primaryEffects.length ? primaryEffects : targets.map(targetEffect);
  if (unavailable) effects.push('Unavailable device actions');
  return {
    summary: effects.slice(0, 3).join(' · ') || 'No device actions yet',
    effects,
    importantEffects: important.map(targetEffect),
    impact: categories.length ? `${categories.join(', ').replace(/^./, (letter) => letter.toUpperCase())} settings` : null,
    deviceCount: new Set(scene.actions.map((action) => action.deviceId)).size,
    simulationOnly: targets.length > 0 && !unavailable && (modelHome || targets.every(({ device }) => device.simulationOnly === true)),
  };
}
