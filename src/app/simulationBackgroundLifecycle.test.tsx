import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, render } from '@testing-library/react-native';
import App from '../../App';
import { hydrateHomeAccount, useHomeStore } from '../store/useHomeStore';
import { syncMembershipFromSupabase, type MembershipSyncResult } from '../services/membership';
import { SimulationControlClient } from '../features/three-d-home/simulationControlClient';
import { simulationPersistence } from '../features/three-d-home/simulationPersistence';
import { modelSimulationScope } from '../features/three-d-home/modelSceneAccess';

jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('./AppNavigator', () => {
  const React = require('react');
  const { useHomeStore } = require('../store/useHomeStore');
  const ModelHomeSync = require('../features/three-d-home/ModelHomeSync').default;
  /** Retain the real navigator's membership gate without mounting unrelated navigation. */
  return function Navigator() { const ready = useHomeStore((state: { membershipReady: boolean }) => state.membershipReady); return ready ? React.createElement(ModelHomeSync) : null; };
});
jest.mock('../services/supabaseClient', () => ({ supabase: {} }));
jest.mock('../services/realtime', () => ({ startDeviceRealtime: jest.fn(() => jest.fn()) }));
jest.mock('../services/flowRuntime', () => ({ startFlowRuntime: jest.fn(() => jest.fn()) }));
jest.mock('../services/deviceClient', () => ({ deviceClient: { resetSession: jest.fn() } }));
jest.mock('../services/ambient', () => ({ startAmbientData: jest.fn(() => jest.fn()) }));
jest.mock('../services/notifications', () => ({ ensureNotificationsReady: jest.fn(async () => {}) }));
jest.mock('../services/orientation', () => ({ applyDeviceOrientationPolicy: jest.fn(async () => {}) }));
jest.mock('../services/membership', () => ({ ...jest.requireActual('../services/membership'), syncMembershipFromSupabase: jest.fn() }));
jest.mock('@sentry/react-native', () => ({ init: jest.fn(), wrap: (component: unknown) => component }));
jest.mock('../features/three-d-home/FireEmergencySimulation', () => ({ FireEmergencySimulation: () => null }));
jest.mock('../features/activity/useConditionNotifications', () => ({ useConditionNotifications: () => undefined }));
jest.mock('../features/three-d-home/simulationPersistence', () => { const actual = jest.requireActual('../features/three-d-home/simulationPersistence'); return { ...actual, simulationPersistence: new actual.SimulationPersistence({ getItem: async () => null, setItem: async () => undefined }) }; });

/** Drain real simulation hydration, transport and disk queues inside React's test boundary. */
async function settle(): Promise<void> { await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); }); }

test.each(['registered', 'reversed'] as const)('background preserves a paused gate across same-process resume with %s listener order', async (order) => {
  jest.useFakeTimers();
  const listeners = new Set<(state: AppStateStatus) => void>();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => { if (type === 'change') listeners.add(listener); return { remove: () => listeners.delete(listener) }; });
  AppState.currentState = 'active';
  await hydrateHomeAccount(`gate-audit-person-${order}`);
  const membership: MembershipSyncResult = { homeId: `gate-audit-home-${order}`, activeMemberId: `gate-audit-person-${order}`,
    household: [{ id: `gate-audit-person-${order}`, name: 'Owner', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'grounds', name: 'Grounds', modelRoomId: 'grounds' }], roomMembers: [], permissionOverrides: [],
    devices: [{ id: 'cloud-gate', name: 'Gate', kind: 'gate', roomId: 'grounds', modelDeviceId: 'entry-gate', simulationOnly: true, isOn: false }] };
  useHomeStore.setState({ accountUserId: `gate-audit-person-${order}`, authenticatedUserId: `gate-audit-person-${order}`, accountHomeId: membership.homeId, activeHomeId: membership.homeId,
    membershipReady: true, activeMemberId: membership.activeMemberId, household: membership.household, rooms: membership.rooms, devices: membership.devices,
    roomMembers: [], memberPermissionOverrides: [], realtime: { enabled: false, useMqtt: false, wsUrl: '' } });
  jest.mocked(syncMembershipFromSupabase).mockResolvedValue(membership);
  const scope = modelSimulationScope(useHomeStore.getState(), false);
  // A separate member/home record must never be paused by this scope's lifecycle.
  const otherScope = `${scope}:unrelated`;
  const other = await simulationPersistence.load(otherScope);
  const otherMoving = { ...other, deviceStates: { ...other.deviceStates, 'entry-gate': {
    on: true, level: 75, settings: { gatePhase: 'closing', gateCloseTargetPercent: 0 },
  } } };
  simulationPersistence.save(otherScope, otherMoving);
  const screen = render(<App />);
  const controls = new SimulationControlClient(); controls.connect();
  try {
    await settle();
    act(() => controls.setLevel('entry-gate', 100)); await settle();
    act(() => controls.setLevel('entry-gate', 0)); await settle();
    act(() => jest.advanceTimersByTime(1000)); await settle();
    expect((await simulationPersistence.load(scope)).deviceStates['entry-gate']).toMatchObject({ level: 75, settings: { gatePhase: 'closing' } });
    act(() => { AppState.currentState = 'background'; (order === 'reversed' ? [...listeners].reverse() : [...listeners]).forEach((listener) => listener('background')); }); await settle();
    expect(useHomeStore.getState().membershipReady).toBe(false);
    const background = (await simulationPersistence.load(scope)).deviceStates['entry-gate'];
    act(() => { AppState.currentState = 'active'; [...listeners].forEach((listener) => listener('active')); }); await settle();
    expect(useHomeStore.getState().membershipReady).toBe(true);
    act(() => jest.advanceTimersByTime(1000)); await settle();
    const resumed = (await simulationPersistence.load(scope)).deviceStates['entry-gate'];
    expect({ backgroundPhase: background.settings?.gatePhase, resumedPhase: resumed.settings?.gatePhase, resumedLevel: resumed.level }).toEqual({ backgroundPhase: 'paused', resumedPhase: 'paused', resumedLevel: 75 });
    expect(await simulationPersistence.load(otherScope)).toEqual(otherMoving);
  } finally { screen.unmount(); controls.dispose(); jest.restoreAllMocks(); jest.useRealTimers(); }
});
