import { useHomeStore, type HomeState, type HouseholdMember } from '../../store/useHomeStore';
import { selectHomeNavigationAccess } from './homeNavigationAccess';

const seed = useHomeStore.getState();

/** Build a complete, current membership with one assigned room and a private room. */
function householdState(role: HouseholdMember['role'], patch: Partial<HomeState> = {}): HomeState {
  return {
    ...seed,
    accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home', membershipReady: true,
    activeMemberId: 'person', household: [{ id: 'person', userId: 'person', name: 'Person', role, status: 'home' }],
    rooms: [{ id: 'bedroom', name: 'Bedroom' }, { id: 'private', name: 'Private' }],
    roomMembers: [{ memberId: 'person', roomIds: ['bedroom'] }], memberPermissionOverrides: [],
    devices: [
      { id: 'lamp', roomId: 'bedroom', kind: 'light', name: 'Lamp', isOn: false },
      { id: 'camera', roomId: 'private', kind: 'camera', name: 'Private camera', isOn: true },
    ],
    ...patch,
  };
}

test.each(['Guest', 'Tenant'] as const)('%s navigation keeps assigned spaces and personal account tools', (role) => {
  const access = selectHomeNavigationAccess(householdState(role), 'alpha');
  expect(access).toMatchObject({ ready: true, rooms: true, devices: true, home: true, more: true, household: true, settings: true,
    admin: false, cameras: false, scenes: false, automations: false, renderer: false, integrations: false, audit: false });
});

test('a member retains routine tools but cannot enter administrative or full-property preview routes', () => {
  expect(selectHomeNavigationAccess(householdState('Member'), 'alpha')).toMatchObject({
    rooms: true, cameras: true, scenes: true, automations: true, integrations: false, renderer: false, audit: false,
  });
});

test('camera access needs a permitted camera within the assigned room, as well as the effective grant', () => {
  const state = householdState('Tenant', { memberPermissionOverrides: [{ memberId: 'person', permission: 'camera.live', allowed: true }] });
  expect(selectHomeNavigationAccess(state, 'alpha').cameras).toBe(false);
  state.devices[1] = { ...state.devices[1], roomId: 'bedroom' };
  expect(selectHomeNavigationAccess(state, 'alpha').cameras).toBe(true);
  state.memberPermissionOverrides.push({ memberId: 'person', permission: 'device.view', allowed: false });
  expect(selectHomeNavigationAccess(state, 'alpha').cameras).toBe(false);
});

test('effective overrides revoke routine/scene destinations and permit explicitly delegated routines', () => {
  const denied = householdState('Member', { memberPermissionOverrides: [{ memberId: 'person', permission: 'automation.manage', allowed: false }] });
  expect(selectHomeNavigationAccess(denied, 'alpha')).toMatchObject({ automations: false, scenes: false });
  const delegated = householdState('Tenant', { memberPermissionOverrides: [{ memberId: 'person', permission: 'automation.manage', allowed: true }] });
  expect(selectHomeNavigationAccess(delegated, 'alpha')).toMatchObject({ automations: true, scenes: true, renderer: false });
});

test.each([
  { membershipReady: false }, { authenticatedUserId: 'other' }, { activeHomeId: 'other' },
  { activeMemberId: 'missing' }, { accountUserId: null },
])('cached owner roles cannot bypass an incomplete or changed membership: %j', (patch) => {
  const access = selectHomeNavigationAccess(householdState('Owner', patch), 'alpha');
  expect(access).toMatchObject({ ready: false, admin: false, devices: false, rooms: false, cameras: false,
    automations: false, renderer: false, integrations: false, audit: false, household: true, settings: true });
});

test('expired guests lose private destinations but keep their profile and invite inbox', () => {
  const state = householdState('Guest');
  state.household[0] = { ...state.household[0], accessExpiresAt: new Date(Date.now() - 1).toISOString() };
  expect(selectHomeNavigationAccess(state, 'alpha')).toMatchObject({ ready: false, devices: false, rooms: false, household: true, settings: true });
});

test('renderer comparison is limited to verified administrators or the offline demo owner', () => {
  expect(selectHomeNavigationAccess(householdState('Owner'), 'alpha').renderer).toBe(true);
  expect(selectHomeNavigationAccess(householdState('Admin'), 'alpha').renderer).toBe(true);
  const offline = householdState('Owner', { accountUserId: null, authenticatedUserId: null, accountHomeId: null, activeHomeId: null, membershipReady: false,
    realtime: { ...seed.realtime, enabled: false, useMqtt: false } });
  expect(selectHomeNavigationAccess(offline, 'demo').renderer).toBe(true);
  expect(selectHomeNavigationAccess(offline, 'alpha').renderer).toBe(false);
  expect(selectHomeNavigationAccess({ ...offline, realtime: { ...offline.realtime, enabled: true } }, 'demo').renderer).toBe(false);
  expect(selectHomeNavigationAccess({ ...offline, household: [{ ...offline.household[0], role: 'Admin' }] }, 'demo').renderer).toBe(false);
});
