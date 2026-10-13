import React from 'react';
import { Text } from 'react-native';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHomeStore, type HomeState } from '../../../store/useHomeStore';
import { createDefaultSimulationSnapshot, type SimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import type { CommandActivityProgress } from '../../../components/command-feedback/useCommandActivity';
import ActivityInboxProvider, { getActivityInboxScope, hasMeaningfulSimulationChange, presentInboxEvents, useActivityInbox } from '../ActivityInboxProvider';
import { activityInboxJournal, inboxRevision, type InboxEvent } from '../activityInboxJournal';
import { simulationPersistence } from '../../three-d-home/simulationPersistence';

const mockSimulationListeners = new Set<(state: SimulationSnapshot) => void>();
jest.mock('../../three-d-home/simulationPersistence', () => ({ simulationPersistence: {
  load: jest.fn(async () => require('../../../../packages/home-scene/src/simulationBridgeProtocol').createDefaultSimulationSnapshot()),
  subscribeState: jest.fn((_scope: string, callback: (state: SimulationSnapshot) => void) => {
    mockSimulationListeners.add(callback);
    return () => mockSimulationListeners.delete(callback);
  }),
} }));
jest.mock('../../../config/runtimeMode', () => ({ runtimePolicy: { mode: 'production', allowMockTelemetry: false } }));

/** Keep fixtures disjoint so the production journal singleton never shares test identities. */
function home(user: string): HomeState {
  return { ...useHomeStore.getState(), accountUserId: user, authenticatedUserId: user,
    accountHomeId: `${user}-home`, activeHomeId: `${user}-home`, membershipReady: true,
    sessionEpoch: 1, activeMemberId: user,
    household: [{ id: user, name: 'Guest', role: 'Guest', status: 'home' }],
    roomMembers: [{ memberId: user, roomIds: ['living'] }], memberPermissionOverrides: [],
    rooms: [{ id: 'living', name: 'Living', modelRoomId: 'living' }, { id: 'family', name: 'Family', modelRoomId: 'family' }],
    devices: [
      { id: 'light', name: 'Living light', kind: 'light', roomId: 'living', isOn: false, modelDeviceId: 'living-light', simulationOnly: true },
      { id: 'private', name: 'Private television', kind: 'tv', roomId: 'family', isOn: false, modelDeviceId: 'family-tv', simulationOnly: true },
    ] };
}

/** Render only the context exposed to the Notifications screen. */
function Reader() {
  const inbox = useActivityInbox();
  return <Text testID="rows">{JSON.stringify(inbox?.items ?? [])}</Text>;
}

/** Admit one valid app command; the provider must not request pre-existing client history. */
function command(deviceId = 'light'): CommandActivityProgress {
  return { commandId: 'request', deviceId, createdAt: 100, updatedAt: 110, expiresAt: 1000,
    status: 'submitted', attempts: 1, admissionSequence: 1 };
}

beforeEach(async () => { await AsyncStorage.clear(); mockSimulationListeners.clear(); });

test('retry rechecks account identity and session before touching stored activity', async () => {
  useHomeStore.setState(home('retry-scope'));
  const retry = jest.spyOn(activityInboxJournal, 'retry').mockResolvedValue();
  const { result } = renderHook(() => useActivityInbox(), {
    wrapper: ({ children }) => <ActivityInboxProvider enabled commands={[]}>{children}</ActivityInboxProvider>,
  });
  try {
    const staleRetry = result.current!.retry;
    await act(async () => { await staleRetry(); });
    expect(retry).toHaveBeenCalledWith(getActivityInboxScope(useHomeStore.getState()));
    retry.mockClear();
    act(() => { useHomeStore.setState({ sessionEpoch: 2 }); });
    await act(async () => { await staleRetry(); });
    expect(retry).not.toHaveBeenCalled();
    act(() => { useHomeStore.setState(home('retry-other')); });
    await act(async () => { await staleRetry(); });
    expect(retry).not.toHaveBeenCalled();
  } finally { retry.mockRestore(); }
});

test('scope rejects an unverified or switched account/home', () => {
  const state = home('scope');
  expect(getActivityInboxScope(state)).toBe(JSON.stringify(['account', 'scope', 'scope-home', 'scope']));
  expect(getActivityInboxScope({ ...state, membershipReady: false })).toBeNull();
  expect(getActivityInboxScope({ ...state, authenticatedUserId: 'other' })).toBeNull();
  expect(getActivityInboxScope({ ...state, activeHomeId: 'other-home' })).toBeNull();
});

test('restored rows recheck current room grants and never treat old pending delivery as active', () => {
  const state = home('presentation');
  const event: InboxEvent = { id: 'one', deviceId: 'light', source: 'delivery', status: 'sending',
    attempts: 1, createdAt: 100, updatedAt: 110, simulated: false };
  expect(presentInboxEvents([event], state)[0]).toMatchObject({ status: 'Outcome unknown', category: 'alert', timestamp: 110 });
  expect(presentInboxEvents([event], state, new Set(['one']))[0].status).toBe('Sending command');
  expect(presentInboxEvents([event, { ...event, id: 'private-row', deviceId: 'private' }], state)).toHaveLength(1);
  expect(presentInboxEvents([event], { ...state, roomMembers: [] })).toEqual([]);
  expect(presentInboxEvents([{ ...event, dismissedRevision: inboxRevision(event) }], state)).toEqual([]);
});

test('persists admitted visible commands, restores after remount, and hides another identity immediately', async () => {
  useHomeStore.setState(home('alice-persist'));
  const screen = render(<ActivityInboxProvider enabled commands={[command(), command('private')]}><Reader /></ActivityInboxProvider>);
  await waitFor(() => expect(screen.getByTestId('rows').props.children).toContain('Living light'));
  expect(screen.getByTestId('rows').props.children).not.toContain('Private television');
  expect(screen.getByTestId('rows').props.children).toContain('Demo: Submitted');
  screen.unmount();
  const restored = render(<ActivityInboxProvider enabled commands={[]}><Reader /></ActivityInboxProvider>);
  await waitFor(() => expect(restored.getByTestId('rows').props.children).toContain('Living light'));
  act(() => { useHomeStore.setState(home('bob-empty')); });
  expect(restored.getByTestId('rows').props.children).toBe('[]');
  await waitFor(() => expect(restored.getByTestId('rows').props.children).toBe('[]'));
});

test('captures actual simulation changes without hydration events or private-room leakage', async () => {
  useHomeStore.setState(home('simulation'));
  const screen = render(<ActivityInboxProvider enabled commands={[]}><Reader /></ActivityInboxProvider>);
  await waitFor(() => expect(mockSimulationListeners.size).toBe(1));
  expect(screen.getByTestId('rows').props.children).toBe('[]');
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates['living-light'] = { ...snapshot.deviceStates['living-light'], on: !snapshot.deviceStates['living-light'].on };
  snapshot.deviceStates['family-tv'] = { ...snapshot.deviceStates['family-tv'], on: !snapshot.deviceStates['family-tv'].on };
  act(() => { for (const listener of mockSimulationListeners) listener(snapshot); });
  await waitFor(() => expect(screen.getByTestId('rows').props.children).toContain('Model '));
  expect(screen.getByTestId('rows').props.children).toContain('No physical device was controlled');
  expect(screen.getByTestId('rows').props.children).not.toContain('Private television');
  act(() => { useHomeStore.setState({ roomMembers: [] }); });
  expect(screen.getByTestId('rows').props.children).toBe('[]');
});

test('recovers a failed simulation baseline without inventing an event or losing later updates', async () => {
  jest.mocked(simulationPersistence.load).mockRejectedValueOnce(new Error('Storage unavailable'));
  useHomeStore.setState(home('simulation-recovery'));
  const screen = render(<ActivityInboxProvider enabled commands={[]}><Reader /></ActivityInboxProvider>);
  await act(async () => { for (let turn = 0; turn < 12; turn += 1) await Promise.resolve(); });
  const recovered = createDefaultSimulationSnapshot();
  recovered.deviceStates['living-light'] = { ...recovered.deviceStates['living-light'], on: false };
  act(() => { for (const listener of mockSimulationListeners) listener(recovered); });
  expect(screen.getByTestId('rows').props.children).toBe('[]');
  const edited = { ...recovered, deviceStates: { ...recovered.deviceStates, 'living-light': { ...recovered.deviceStates['living-light'], on: true } } };
  act(() => { for (const listener of mockSimulationListeners) listener(edited); });
  await waitFor(() => expect(screen.getByTestId('rows').props.children).toContain('Living light'));
  screen.unmount();
});


test('an elapsed countdown alone produces no fabricated model activity', () => {
  const before = { on: true, level: 100, settings: { gatePhase: 'countdown', gateCountdownSec: 30 } };
  expect(hasMeaningfulSimulationChange(before, { ...before, settings: { ...before.settings, gateCountdownSec: 29 } })).toBe(false);
  expect(hasMeaningfulSimulationChange(before, { ...before, settings: { ...before.settings, gatePhase: 'closing' } })).toBe(true);
});

test('an expired guest cannot read persisted events even if their room grant remains cached', () => {
  const state = home('expired');
  state.household[0].accessExpiresAt = new Date(Date.now() - 1000).toISOString();
  const event: InboxEvent = { id: 'one', deviceId: 'light', source: 'simulation', status: 'updated',
    attempts: 0, createdAt: 100, updatedAt: 110, simulated: true };
  expect(presentInboxEvents([event], state)).toEqual([]);
});

test('a late old-account cache read cannot populate a newly selected account', async () => {
  const original = (AsyncStorage.getItem as jest.Mock).getMockImplementation();
  let resolveOld!: (raw: string | null) => void;
  const getItem = jest.spyOn(AsyncStorage, 'getItem').mockImplementation((input: unknown) => {
    const key = String(input);
    if (key.startsWith('vantahome-activity:') && key.includes('late-alice')) {
      return new Promise((resolve) => { resolveOld = resolve; });
    }
    return original?.(key) ?? Promise.resolve(null);
  });
  useHomeStore.setState(home('late-alice'));
  const screen = render(<ActivityInboxProvider enabled commands={[]}><Reader /></ActivityInboxProvider>);
  act(() => { useHomeStore.setState(home('late-bob')); });
  await act(async () => {
    resolveOld(JSON.stringify({ version: 1, events: [{ id: 'private-event', deviceId: 'light', source: 'simulation',
      status: 'updated', attempts: 0, createdAt: 100, updatedAt: 110, simulated: true }] }));
  });
  expect(screen.getByTestId('rows').props.children).toBe('[]');
  getItem.mockRestore();
});


test('model summaries use only captured bounded values and never claim a door is locked', () => {
  const state = home('model-summary');
  const row: InboxEvent = { id: 'sim', deviceId: 'light', source: 'simulation', status: 'updated',
    attempts: 0, createdAt: 100, updatedAt: 110, simulated: true, power: true, level: 42 };
  expect(presentInboxEvents([row], state)[0].status).toBe('Model on · 42% brightness');
  expect(presentInboxEvents([{ ...row, power: false }], state)[0].status).toBe('Model off');
  state.devices[0].kind = 'door';
  expect(presentInboxEvents([{ ...row, level: 0 }], state)[0].status).toBe('Model closed');
  state.devices[0].kind = 'smoke';
  expect(presentInboxEvents([row], state)[0].status).toBe('Model updated');
});
