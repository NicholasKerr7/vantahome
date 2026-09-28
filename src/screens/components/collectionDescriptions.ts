import type { AutomationFlow, Device, FlowAction, FlowCondition, FlowTrigger, HouseholdMember, Scene, SceneAction } from '../../store/useHomeStore';

export type CollectionDirectory = {
  devices: readonly Device[];
  scenes: readonly Scene[];
  household: readonly HouseholdMember[];
};
export type SceneIdentity = 'light' | 'rest' | 'off' | 'climate' | 'media' | 'security' | 'home';

/** Resolve only the visible data provided by the caller; never expose an inaccessible device ID. */
function deviceName(id: string, directory: CollectionDirectory) {
  return directory.devices.find((device) => device.id === id)?.name ?? 'Unavailable device';
}

/** Format stored daily times without inventing a timezone or changing their schedule. */
export function collectionTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Describe the actual trigger represented by a flow's first entry. */
export function describeTrigger(trigger: FlowTrigger, directory: CollectionDirectory): string {
  switch (trigger.type) {
    case 'time': return `At ${collectionTime(trigger.hour, trigger.minute)}`;
    case 'device': return `${deviceName(trigger.deviceId, directory)} turns ${trigger.state}`;
    case 'scene': return `${directory.scenes.find((scene) => scene.id === trigger.sceneId)?.name ?? 'Unavailable scene'} runs`;
    case 'presence': return `${directory.household.find((member) => member.id === trigger.memberId)?.name ?? 'Household member'} ${trigger.status === 'home' ? 'arrives home' : 'leaves home'}`;
  }
}

/** Keep card conditions faithful to the stored rule while leaving editing in its existing screen. */
export function describeCondition(condition: FlowCondition, directory: CollectionDirectory): string {
  switch (condition.type) {
    case 'time-range': return `${collectionTime(condition.startHour, condition.startMinute)}–${collectionTime(condition.endHour, condition.endMinute)}`;
    case 'device': return `${deviceName(condition.deviceId, directory)} is ${condition.state}`;
    case 'day': return condition.days.length ? condition.days.join(', ') : 'No days selected';
  }
}

/** Summarize an existing action without implying that it has already executed. */
export function describeAction(action: FlowAction, directory: CollectionDirectory): string {
  switch (action.type) {
    case 'toggle': return `${deviceName(action.deviceId, directory)} ${action.on ? 'on' : 'off'}`;
    case 'set-ac': return `${deviceName(action.deviceId, directory)} → ${action.tempC}°C`;
    case 'set-brightness': return `${deviceName(action.deviceId, directory)} → ${action.brightness}%`;
    case 'run-scene': return `Run ${directory.scenes.find((scene) => scene.id === action.sceneId)?.name ?? 'unavailable scene'}`;
    case 'delay': return `Wait ${action.seconds} seconds`;
    case 'notify': return `Notify: ${action.message}`;
  }
}

/** Show the first meaningful item and explicitly account for the remaining configured entries. */
function firstWithCount<T>(items: readonly T[], describe: (item: T) => string, empty: string) {
  return items.length ? `${describe(items[0])}${items.length > 1 ? ` + ${items.length - 1} more` : ''}` : empty;
}

/** Build a compact trigger/condition/action preview from the flow's source data. */
export function describeFlow(flow: AutomationFlow, directory: CollectionDirectory) {
  return {
    when: firstWithCount(flow.triggers, (trigger) => describeTrigger(trigger, directory), 'No trigger configured'),
    condition: flow.conditions.length ? firstWithCount(flow.conditions, (condition) => describeCondition(condition, directory), '') : null,
    then: firstWithCount(flow.actions, (action) => describeAction(action, directory), 'No action configured'),
  };
}

/** Derive the card's visual identity from its actual controlled devices, not guesses from its title. */
export function sceneIdentity(scene: Scene, directory: CollectionDirectory): SceneIdentity {
  const entries = scene.actions.map((action) => ({ action, kind: directory.devices.find((device) => device.id === action.deviceId)?.kind }));
  if (entries.length && entries.every(({ action }) => action.type === 'toggle' ? action.on === false : action.patch.isOn === false)) return 'off';
  if (entries.some(({ action }) => action.type === 'patch' && action.patch.armed === true)) return 'security';
  if (entries.some(({ action, kind }) => (kind === 'tv' || kind === 'speaker') && (action.type === 'toggle' ? action.on === true : action.patch.isOn === true))) return 'media';
  const lights = entries.filter(({ kind }) => kind === 'light');
  if (lights.length && lights.every(({ action }) => action.type === 'patch' && typeof action.patch.brightness === 'number' && action.patch.brightness <= 30)) return 'rest';
  if (lights.length) return 'light';
  if (entries.some(({ kind }) => kind === 'speaker' || kind === 'tv')) return 'media';
  if (entries.some(({ kind }) => kind === 'ac' || kind === 'fan')) return 'climate';
  if (entries.some(({ kind }) => kind === 'gate' || kind === 'door' || kind === 'camera')) return 'security';
  return 'home';
}

/** Name unique affected devices, retaining an honest fallback for removed or restricted entries. */
export function sceneDeviceSummary(actions: readonly SceneAction[], directory: CollectionDirectory) {
  const ids = [...new Set(actions.map((action) => action.deviceId))];
  if (!ids.length) return 'No device actions yet';
  const names = ids.slice(0, 2).map((id) => deviceName(id, directory));
  return `${names.join(' · ')}${ids.length > 2 ? ` + ${ids.length - 2} more` : ''}`;
}
