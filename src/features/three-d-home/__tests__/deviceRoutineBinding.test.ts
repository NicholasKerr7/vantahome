import { useHomeStore, type HomeState, type HouseholdMember } from '../../../store/useHomeStore';
import { resolveRoutineDeviceId } from '../deviceRoutineBinding';
import { DEVICES } from '../../../../packages/home-scene/src/data';

/** Construct an isolated offline owner scope without changing the application store. */
function demoState(overrides: Partial<HomeState> = {}): HomeState {
  return {
    ...useHomeStore.getState(), accountUserId: null, authenticatedUserId: null,
    accountHomeId: null, activeHomeId: null, sessionEpoch: 0,
    realtime: { enabled: false, useMqtt: false, wsUrl: '' },
    household: [{ id: 'owner', name: 'Demo owner', role: 'Owner', status: 'home' }], activeMemberId: 'owner',
    devices: [
      { id: 'd2', name: 'Pendant', kind: 'light', roomId: 'living', isOn: true },
      { id: 'd26', name: 'Front gate', kind: 'gate', roomId: 'grounds', isOn: false },
      { id: 'd40', name: 'Gas meter', kind: 'gas-meter', roomId: 'utility', isOn: true },
    ],
    ...overrides,
  };
}

test('resolves only exact curated preview identities and kinds', () => {
  const state = demoState();
  expect(resolveRoutineDeviceId(state, 'living-light', 'demo')).toBe('d2');
  expect(resolveRoutineDeviceId(state, 'entry-gate', 'demo')).toBe('d26');
  expect(resolveRoutineDeviceId(state, 'utility-gas-meter', 'demo')).toBe('d40');
  expect(resolveRoutineDeviceId(state, 'master-blinds', 'demo')).toBeNull();
  expect(resolveRoutineDeviceId(state, 'd2', 'demo')).toBeNull();
  expect(resolveRoutineDeviceId(state, 'Living-light', 'demo')).toBeNull();
});

test('all canonical model devices can open their own routine selector', () => {
  const state = demoState({ devices: DEVICES.map((device) => ({ ...device, isOn: device.defaultOn })) });
  for (const device of DEVICES) expect(resolveRoutineDeviceId(state, device.id, 'demo')).toBe(device.id);
  expect(resolveRoutineDeviceId(state, 'master-blinds', 'production')).toBeNull();
});

test('does not guess a mapping from names or accept a reused ID with a different kind', () => {
  const state = demoState({ devices: [
    { id: 'user-light', name: 'living-light', kind: 'light', roomId: 'living', isOn: true },
    { id: 'd2', name: 'Pendant', kind: 'camera', roomId: 'living', isOn: true },
  ] });
  expect(resolveRoutineDeviceId(state, 'living-light', 'demo')).toBeNull();
  expect(resolveRoutineDeviceId(demoState({ devices: [] }), 'living-light', 'demo')).toBeNull();
});

test.each([
  { accountUserId: 'account' }, { authenticatedUserId: 'account' },
  { accountHomeId: 'house' }, { activeHomeId: 'house' },
  { realtime: { enabled: true, useMqtt: false, wsUrl: '' } },
  { realtime: { enabled: false, useMqtt: true, wsUrl: '' } },
  { activeMemberId: 'missing-member' },
] satisfies Partial<HomeState>[])('rejects account, household, transport or missing-member scope %#', (overrides) => {
  expect(resolveRoutineDeviceId(demoState(overrides), 'living-light', 'demo')).toBeNull();
});

test.each(['Admin', 'Member', 'Guest', 'Tenant'] satisfies HouseholdMember['role'][])('does not share demo mappings for a %s membership', (role) => {
  const state = demoState({ household: [{ id: 'owner', name: 'Member', role, status: 'home' }] });
  expect(resolveRoutineDeviceId(state, 'living-light', 'demo')).toBeNull();
});

test.each(['development', 'alpha', 'production'] as const)('never maps a simulated device into a %s runtime', (mode) => {
  expect(resolveRoutineDeviceId(demoState(), 'living-light', mode)).toBeNull();
});
