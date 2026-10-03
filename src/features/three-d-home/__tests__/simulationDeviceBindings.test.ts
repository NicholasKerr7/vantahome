import { useHomeStore, type HomeState } from '../../../store/useHomeStore';
import { selectSimulationDeviceBindings } from '../simulationDeviceBindings';

/** Use cloud identities distinct from model IDs, with one assigned and one private room. */
function fixture(): HomeState {
  return { ...useHomeStore.getState(), accountUserId: 'guest', authenticatedUserId: 'guest',
    accountHomeId: 'home', activeHomeId: 'home', membershipReady: true, activeMemberId: 'guest',
    household: [{ id: 'guest', name: 'Guest', role: 'Guest', status: 'home' }],
    roomMembers: [{ memberId: 'guest', roomIds: ['bedroom'] }], memberPermissionOverrides: [],
    rooms: [{ id: 'bedroom', name: 'Bedroom', modelRoomId: 'master' }, { id: 'private', name: 'Family', modelRoomId: 'family' }],
    devices: [
      { id: 'virtual-light', name: 'Light', kind: 'light', roomId: 'bedroom', simulationOnly: true, modelDeviceId: 'master-light', isOn: false },
      { id: 'physical-ac', name: 'AC', kind: 'ac', roomId: 'bedroom', modelDeviceId: 'master-ac', isOn: false },
      { id: 'private-tv', name: 'TV', kind: 'tv', roomId: 'private', simulationOnly: true, modelDeviceId: 'family-tv', isOn: false },
    ],
  };
}

test('maps only permitted virtual entries, never physical observations or another room', () => {
  expect(selectSimulationDeviceBindings(fixture(), 'production')).toEqual({ 'virtual-light': 'master-light' });
});

test.each(['wrong-kind', 'wrong-room', 'no-binding', 'revoked', 'identity-change'])(
  'rejects an invalid virtual mapping: %s', (reason) => {
    const state = fixture();
    if (reason === 'wrong-kind') state.devices[0].kind = 'tv';
    if (reason === 'wrong-room') state.devices[0].modelDeviceId = 'family-light';
    if (reason === 'no-binding') state.devices[0].modelDeviceId = null;
    if (reason === 'revoked') state.roomMembers = [];
    if (reason === 'identity-change') state.authenticatedUserId = 'other';
    expect(selectSimulationDeviceBindings(state, 'production')).toEqual({});
  },
);
