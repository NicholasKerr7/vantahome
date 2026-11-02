import { getDeviceHealthAccess, buildDeviceHealthEntries } from '../deviceHealthModel';
import { healthFixture, healthSnapshot } from './healthFixtures';

/** Resolve the same scoped pipeline used by the screen, with no transport or persistence. */
function project(state = healthFixture(), snapshot = healthSnapshot(), examples = false) {
  return buildDeviceHealthEntries(getDeviceHealthAccess(state, 'production'), state.rooms, snapshot, examples);
}

test('power, transport configuration and observed timestamps never establish connectivity', () => {
  const state = healthFixture();
  state.devices.push({ id: 'physical', name: 'Physical', roomId: state.rooms[0].id, kind: 'vacuum', isOn: true, observedAt: Date.now(), battery: 9 });
  expect(project(state).find((entry) => entry.id === 'physical')).toMatchObject({ source: 'unconnected', status: 'unreported', battery: null, issues: [] });
  const before = project(state);
  state.devices = state.devices.map((device) => ({ ...device, isOn: !device.isOn, lastSeenAt: Date.now() + 1000, airLastUpdatedAt: Date.now() }));
  expect(project(state)).toEqual(before);
});

test('missing hydration does not borrow registry values or invent healthy simulation readings', () => {
  const state = healthFixture();
  state.devices[1].battery = 100;
  const entries = buildDeviceHealthEntries(getDeviceHealthAccess(state, 'production'), state.rooms, null, true);
  expect(entries).toHaveLength(state.devices.length);
  expect(entries.every((entry) => entry.status === 'unreported' && entry.battery === null && !entry.issues.length && entry.source !== 'sample')).toBe(true);
});

test.each([NaN, Infinity, -1, 101, '12', null, undefined])('malformed explicit sample %s stays unknown without healthy fallback', (value) => {
  const state = healthFixture(); const snapshot = healthSnapshot();
  const id = state.devices.find((device) => device.kind === 'vacuum')!.modelDeviceId!;
  snapshot.deviceStates[id].settings = { battery: value, vacuumFilterLife: value } as never;
  const vacuum = project(state, snapshot).find((entry) => entry.kind === 'vacuum')!;
  expect(vacuum.battery).toBeNull(); expect(vacuum.maintenance).toBeUndefined(); expect(vacuum.issues).toEqual([]);
});

test('bounded model samples agree with declared values and low/care indications do not clear on power off', () => {
  const state = healthFixture(); const snapshot = healthSnapshot(); const id = state.devices[1].modelDeviceId!;
  snapshot.deviceStates[id] = { on: false, level: 0, settings: { battery: 12, vacuumFilterLife: 15, vacuumBinFull: true, vacuumBrushDirty: true } };
  const entry = project(state, snapshot).find((item) => item.kind === 'vacuum')!;
  expect(entry).toMatchObject({ battery: 12, status: 'attention', source: 'simulation' });
  expect(entry.issues.map((issue) => issue.kind)).toEqual(['battery', 'maintenance', 'maintenance', 'maintenance']);
  expect(entry.headline).toMatch(/sample/);
});

test('energy storage charge is not classified as a low sensor battery', () => {
  const state = healthFixture(); const snapshot = healthSnapshot(); const id = state.devices[5].modelDeviceId!;
  snapshot.deviceStates[id] = { on: false, level: 0, settings: { battery: 1, chargePercent: 1 } };
  expect(project(state, snapshot).find((entry) => entry.kind === 'battery')).toMatchObject({ battery: null, issues: [] });
});

test('example alerts are deterministic, capability-aware, isolated and reset without touching saved data', () => {
  const state = healthFixture(); const snapshot = healthSnapshot(); const before = JSON.stringify({ state, snapshot });
  const original = project(state, snapshot); const examples = project(state, snapshot, true);
  expect(examples.filter((entry) => entry.source === 'sample')).toHaveLength(4);
  expect(examples.filter((entry) => entry.source === 'sample').every((entry) => entry.headline.startsWith('Sample:'))).toBe(true);
  expect(examples.find((entry) => entry.issues[0]?.kind === 'battery')?.kind).toBe('vacuum');
  expect(examples.find((entry) => entry.issues[0]?.kind === 'maintenance')?.kind).toBe('ac');
  expect(project(state, snapshot, true)).toEqual(examples); expect(project(state, snapshot)).toEqual(original);
  expect(JSON.stringify({ state, snapshot })).toBe(before);
});

test.each(['Guest', 'Tenant'] as const)('%s sees only assigned devices and no camera data without camera permission', (role) => {
  const state = healthFixture(role);
  const light = state.devices[0]; state.roomMembers = [{ memberId: 'person', roomIds: [light.roomId] }];
  state.devices = state.devices.map((device) => device.kind === 'camera' ? { ...device, roomId: light.roomId } : device);
  state.devices.push({ id: 'private-light', name: 'Private fixture', kind: 'light', roomId: state.rooms.find((room) => room.id !== light.roomId)!.id, isOn: false });
  const entries = project(state, healthSnapshot(), true);
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.every((entry) => state.devices.find((device) => device.id === entry.id)!.roomId === light.roomId)).toBe(true);
  expect(entries.some((entry) => entry.kind === 'camera')).toBe(false);
  expect(entries.some((entry) => entry.name === 'Private fixture')).toBe(false);
});

test.each([
  { membershipReady: false }, { authTaskBlockingHome: true }, { authenticatedUserId: null },
  { accountUserId: 'other' }, { activeHomeId: 'other' }, { activeMemberId: 'missing' },
])('invalid scope %j contains no names, bindings or counts', (patch) => {
  const state = { ...healthFixture(), ...patch };
  const access = getDeviceHealthAccess(state, 'production');
  expect(access).toMatchObject({ canView: false, devices: [], bindings: {} }); expect(buildDeviceHealthEntries(access, state.rooms, healthSnapshot(), true)).toEqual([]);
});

test('Guest expiry and effective device.view denial block access independently of a rendered screen', () => {
  const state = healthFixture('Guest'); const now = Date.now();
  state.household[0].accessExpiresAt = new Date(now + 1000).toISOString();
  expect(getDeviceHealthAccess(state, 'production', now + 1001).canView).toBe(false);
  state.household[0].accessExpiresAt = new Date(now + 10000).toISOString();
  state.memberPermissionOverrides = [{ memberId: 'person', permission: 'device.view', allowed: false }];
  expect(getDeviceHealthAccess(state, 'production', now).canView).toBe(false);
});

test('scope identity changes for account, home, role and visibility but not power readings', () => {
  const state = healthFixture(); const key = getDeviceHealthAccess(state, 'production').identityKey;
  state.devices[0].isOn = true; expect(getDeviceHealthAccess(state, 'production').identityKey).toBe(key);
  state.sessionEpoch++; expect(getDeviceHealthAccess(state, 'production').identityKey).not.toBe(key);
});
