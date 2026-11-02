import { getDevice } from '../../../packages/home-scene/src/data';
import { readDeviceSetting } from '../../../packages/home-scene/src/deviceCapabilities';
import type { SimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { runtimePolicy, type RuntimeMode } from '../../config/runtimeMode';
import { hasCurrentMembershipAccess } from '../../security/guestAccess';
import { roleHasPermission } from '../../security/permissions';
import { selectVisibleDevices, type Device, type DeviceKind, type HomeState } from '../../store/useHomeStore';
import { selectSimulationDeviceBindings } from '../three-d-home/simulationDeviceBindings';

export type HealthIssueKind = 'connection' | 'freshness' | 'battery' | 'maintenance';
export interface DeviceHealthIssue { kind: HealthIssueKind; title: string; detail: string }
/** Only scoped presentation data reaches health cards; no transport address or secret is copied. */
export interface DeviceHealthEntry {
  id: string; name: string; roomName: string; kind: DeviceKind; modelDeviceId?: string;
  source: 'simulation' | 'unconnected' | 'sample'; status: 'attention' | 'unreported' | 'preview';
  headline: string; detail: string; issues: readonly DeviceHealthIssue[];
  battery: number | null; maintenance?: string;
}
export interface DeviceHealthAccess {
  canView: boolean; devices: Device[]; bindings: Record<string, string>; identityKey: string;
}

/** Validate identity and expiry before collecting any labels, readings, examples or totals. */
export function getDeviceHealthAccess(state: HomeState, mode: RuntimeMode = runtimePolicy.mode, now = Date.now()): DeviceHealthAccess {
  const member = state.household.find((item) => item.id === state.activeMemberId);
  const demo = mode === 'demo' && !state.accountUserId && !state.authenticatedUserId
    && !state.accountHomeId && !state.activeHomeId && !state.realtime.enabled && !state.realtime.useMqtt;
  const verified = !state.authTaskBlockingHome && hasCurrentMembershipAccess(member, now)
    && (demo || Boolean(state.membershipReady && state.authenticatedUserId
      && state.accountUserId === state.authenticatedUserId && (member?.userId ?? member?.id) === state.authenticatedUserId
      && state.activeHomeId && state.accountHomeId === state.activeHomeId));
  const overrides = state.memberPermissionOverrides.filter((item) => item.memberId === member?.id);
  const canView = Boolean(verified && member && roleHasPermission(member.role, 'device.view', overrides));
  const devices = canView ? selectVisibleDevices(state) : [];
  const visible = new Set(devices.map((device) => device.id));
  const bindings = canView ? Object.fromEntries(Object.entries(selectSimulationDeviceBindings(state, mode)).filter(([id]) => visible.has(id))) : {};
  const scope = devices.map((device) => [device.id, device.roomId, bindings[device.id] ?? null]).sort(([a], [b]) => String(a).localeCompare(String(b)));
  return { canView, devices, bindings, identityKey: JSON.stringify([state.accountUserId, state.authenticatedUserId,
    state.accountHomeId, state.activeHomeId, state.activeMemberId, state.sessionEpoch, member?.role, canView, scope]) };
}

/** Invalid or absent quantities stay unknown rather than becoming plausible healthy defaults. */
function percentage(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

const BATTERY_FIELDS: Partial<Record<DeviceKind, string>> = {
  vacuum: 'battery', door: 'battery', garage: 'battery', smoke: 'smokeBattery', 'gas-leak': 'gasBatteryPercent',
};
const FILTER_FIELDS: Partial<Record<DeviceKind, string>> = {
  vacuum: 'vacuumFilterLife', fridge: 'fridgeFilterLife', ac: 'acFilterLife', air: 'airFilterLife',
};

/** Project model simulation samples only; energy-storage charge is not a sensor maintenance battery. */
function sampleCondition(kind: DeviceKind, read: (field: string) => unknown): Pick<DeviceHealthEntry, 'battery' | 'maintenance' | 'issues'> {
  const field = BATTERY_FIELDS[kind];
  const battery = field ? percentage(read(field)) : null;
  const issues: DeviceHealthIssue[] = [];
  if (battery !== null && battery <= 20) issues.push({ kind: 'battery', title: 'Low battery sample', detail: `${battery}% in the saved simulation. The preview attention threshold is 20%; this is not a physical battery measurement.` });
  const filterField = FILTER_FIELDS[kind];
  const filter = filterField ? percentage(read(filterField)) : null;
  let maintenance = filter === null ? undefined : `Filter sample ${filter}%`;
  if (filter !== null && filter <= 20) issues.push({ kind: 'maintenance', title: 'Filter care sample', detail: `${filter}% filter life in the saved simulation. Review the actual appliance guidance before maintenance.` });
  const flags: Array<[boolean, string]> = [
    [kind === 'vacuum' && read('vacuumBinFull') === true, 'Bin needs emptying'],
    [kind === 'vacuum' && read('vacuumBrushDirty') === true, 'Brush needs cleaning'],
    [kind === 'coffee' && read('coffeeDescaleNeeded') === true, 'Descaling needed'],
    [kind === 'dryer' && read('lintFilterOk') === false, 'Lint filter needs checking'],
  ];
  for (const [flag, title] of flags) if (flag) {
    maintenance = 'Care indicated in sample';
    issues.push({ kind: 'maintenance', title: `${title} · sample`, detail: 'A saved simulation flag, not a physical inspection. Follow the manufacturer’s maintenance instructions for real equipment.' });
  }
  return { battery, maintenance, issues };
}

/** Build local illustrative alerts after filtering access; no hidden or unsupported device is invented. */
function withExampleAlerts(entries: DeviceHealthEntry[]): DeviceHealthEntry[] {
  const available = entries.filter((entry) => entry.source === 'simulation' && entry.status !== 'unreported');
  const taken = new Set<string>();
  const examples = new Map<string, DeviceHealthIssue>();
  const take = (kind: HealthIssueKind, predicate: (entry: DeviceHealthEntry) => boolean, title: string, detail: string) => {
    const entry = available.find((candidate) => !taken.has(candidate.id) && predicate(candidate));
    if (entry) { taken.add(entry.id); examples.set(entry.id, { kind, title, detail }); }
  };
  take('battery', (entry) => Boolean(BATTERY_FIELDS[entry.kind]), 'Sample: low battery', 'Example battery level: 12%. This alert changes only this view; the device’s saved battery sample is untouched.');
  take('maintenance', (entry) => Boolean(FILTER_FIELDS[entry.kind]) || entry.kind === 'coffee' || entry.kind === 'dryer', 'Sample: care needed', 'Example maintenance reminder. For real equipment, follow the device maker’s guidance before cleaning or replacing parts.');
  take('connection', () => true, 'Sample: device offline', 'Example loss of connection. In a connected home, check the device and hub before retrying. Device power alone cannot establish connectivity.');
  take('freshness', () => true, 'Sample: report delayed', 'The device has not reported recently in this example. In a connected home, check the hub connection and wait for a fresh device report.');
  return entries.map((entry) => {
    const issue = examples.get(entry.id);
    return issue ? { ...entry, source: 'sample', status: 'attention', headline: issue.title, detail: issue.detail,
      battery: issue.kind === 'battery' ? 12 : entry.battery, maintenance: issue.kind === 'maintenance' ? 'Example reminder' : entry.maintenance,
      issues: [issue] } : entry;
  });
}

/** Never infer connectivity or freshness from power, local timestamps or a configured transport. */
export function buildDeviceHealthEntries(access: DeviceHealthAccess, rooms: readonly { id: string; name: string }[],
  simulation: SimulationSnapshot | null, sampleAlerts = false): DeviceHealthEntry[] {
  if (!access.canView) return [];
  const names = new Map(rooms.map((room) => [room.id, room.name]));
  const entries = access.devices.map((device): DeviceHealthEntry => {
    const modelDeviceId = access.bindings[device.id];
    const saved = modelDeviceId ? simulation?.deviceStates[modelDeviceId] : undefined;
    const definition = modelDeviceId ? getDevice(modelDeviceId) : undefined;
    const base = { id: device.id, name: device.name, kind: device.kind, roomName: names.get(device.roomId) ?? 'Assigned room',
      ...(modelDeviceId ? { modelDeviceId } : {}) };
    if (!modelDeviceId || !saved || !definition) return { ...base, source: modelDeviceId || device.simulationOnly ? 'simulation' : 'unconnected', status: 'unreported',
      headline: modelDeviceId || device.simulationOnly ? 'Preview unavailable' : 'Health not connected',
      detail: modelDeviceId || device.simulationOnly ? 'No accessible saved model sample is available. Your existing settings are kept.' : 'No verified health feed is connected. Power and saved settings cannot confirm connection, battery or maintenance status.',
      issues: [], battery: null };
    // Reuse authored samples only within an explicit, hydrated simulation binding.
    // An explicitly malformed value stays unknown rather than recovering to a healthy seed.
    const condition = sampleCondition(device.kind, (field) => Object.hasOwn(saved.settings ?? {}, field)
      ? saved.settings?.[field] : readDeviceSetting(definition, saved, field));
    return { ...base, ...condition, source: 'simulation', status: condition.issues.length ? 'attention' : 'preview',
      headline: condition.issues[0]?.title ?? 'Model preview', detail: condition.issues.length
        ? 'Attention indicated by model simulation values. No physical device report.'
        : 'No physical health report. Any battery or care values below are model simulation samples.' };
  });
  const projected = sampleAlerts ? withExampleAlerts(entries) : entries;
  return projected.sort((a, b) => Number(b.status === 'attention') - Number(a.status === 'attention') || a.roomName.localeCompare(b.roomName) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
