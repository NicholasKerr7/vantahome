import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useHomeStore } from '../../store/useHomeStore';
import { virtualSceneHome } from '../scenes/sceneTestFixtures';
import { createDefaultSimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { resolveModelSceneAccess } from '../three-d-home/modelSceneAccess';
import { useSimulationControls } from '../three-d-home/useSimulationControls';
import type { ControlSnapshot, SimulationControlClient } from '../three-d-home/simulationControlClient';
import type { ConciergeResponse } from '../../../shared/home-concierge/contract';
import { conciergeAvailability, requestConcierge } from './conciergeService';
import { stageAssistantDraft } from './assistantDraftHandoff';
import { useHomeConcierge } from './useHomeConcierge';

jest.mock('../three-d-home/useSimulationControls', () => ({ useSimulationControls: jest.fn() }));
jest.mock('./conciergeService', () => ({
  ...jest.requireActual('./conciergeService'), conciergeAvailability: jest.fn(), requestConcierge: jest.fn(),
}));
jest.mock('./assistantDraftHandoff', () => ({ stageAssistantDraft: jest.fn(() => 'review-token') }));

const original = useHomeStore.getState();
const now = Date.now();
let controls: ControlSnapshot;
let appStateListener: ((state: AppStateStatus) => void) | null;
const client = { getSnapshot: () => controls, setPower: jest.fn(), setSetting: jest.fn(), setLevel: jest.fn(), runAction: jest.fn() };

/** Hold a network result to reproduce cancellation and authorization races without network access. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

/** Flush only pending promises; expiry timers are advanced explicitly in the relevant tests. */
async function settle(): Promise<void> {
  await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); });
}

/** Return a proposal whose exact settings are still review-only. */
function proposal(): ConciergeResponse {
  return { title: 'Evening calm', answer: 'Review a gentle lighting scene.', deviceIds: ['registry-device:living-light'],
    scene: { name: 'Evening calm', explanation: 'Warm, low light.', actions: [{ deviceId: 'registry-device:living-light', values: { isOn: true, brightness: 25 } }] } };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(now);
  jest.clearAllMocks();
  const home = virtualSceneHome();
  useHomeStore.setState(home, true);
  controls = { ready: true, status: 'saved', state: createDefaultSimulationSnapshot(), access: resolveModelSceneAccess(home) };
  jest.mocked(useSimulationControls).mockImplementation(() => ({ ...controls, client: client as unknown as SimulationControlClient, reconnect: jest.fn() }));
  jest.mocked(conciergeAvailability).mockResolvedValue(true);
  jest.mocked(requestConcierge).mockResolvedValue(proposal());
  appStateListener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListener = listener;
    return { remove: jest.fn() };
  });
});

afterEach(() => {
  useHomeStore.setState(original, true);
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('checks availability without automatically sending a question or simulation readings', async () => {
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  expect(result.current.canAsk).toBe(true);
  expect(conciergeAvailability).toHaveBeenCalledTimes(1);
  expect(requestConcierge).not.toHaveBeenCalled();
  expect(result.current.context.brief.deviceCount).toBeGreaterThan(0);
  unmount();
});

test('keeps the local brief available when the provider is not configured', async () => {
  jest.mocked(conciergeAvailability).mockResolvedValue(false);
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  expect(result.current.status).toBe('unavailable');
  expect(result.current.context.available).toBe(true);
  await act(async () => { await result.current.ask('What is on?'); });
  expect(requestConcierge).not.toHaveBeenCalled();
  unmount();
});

test('sends only after Ask, validates a proposal, and opens a review without writing or commanding', async () => {
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  await act(async () => { await result.current.ask('Make the living room relaxing'); });
  expect(requestConcierge).toHaveBeenCalledTimes(1);
  const sent = jest.mocked(requestConcierge).mock.calls[0][2];
  expect(sent.mode).toBe('simulation');
  expect(sent.devices.every((device) => Object.keys(device).join(',') === 'id,values')).toBe(true);
  expect(result.current.response).toEqual(proposal());
  expect(result.current.canReview).toBe(true);
  let token: string | null = null;
  act(() => { token = result.current.prepareReview(); });
  expect(token).toBe('review-token');
  expect(stageAssistantDraft).toHaveBeenCalledTimes(1);
  expect(useHomeStore.getState().scenes).toEqual([]);
  expect(client.setPower).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  expect(client.setLevel).not.toHaveBeenCalled();
  expect(client.runAction).not.toHaveBeenCalled();
  unmount();
});

test('cancels a pending answer and discards a provider result that ignores the abort signal', async () => {
  const pending = deferred<unknown>();
  jest.mocked(requestConcierge).mockReturnValue(pending.promise);
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  let asking!: Promise<void>;
  act(() => { asking = result.current.ask('What is on?'); });
  const signal = jest.mocked(requestConcierge).mock.calls[0][3];
  act(() => { result.current.cancel(); });
  expect(signal.aborted).toBe(true);
  await act(async () => { pending.resolve(proposal()); await asking; });
  expect(result.current.response).toBeNull();
  expect(result.current.status).not.toBe('asking');
  unmount();
});

test('aborts even an away-and-back scope change within one render batch', async () => {
  const pending = deferred<unknown>();
  jest.mocked(requestConcierge).mockReturnValue(pending.promise);
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  const previous = useHomeStore.getState();
  let asking!: Promise<void>;
  act(() => { asking = result.current.ask('Prepare a scene'); });
  const signal = jest.mocked(requestConcierge).mock.calls[0][3];
  act(() => {
    useHomeStore.setState({ activeHomeId: 'another-home', accountHomeId: 'another-home' });
    useHomeStore.setState(previous, true);
  });
  await act(async () => { pending.resolve(proposal()); await asking; });
  expect(signal.aborted).toBe(true);
  expect(result.current.response).toBeNull();
  expect(stageAssistantDraft).not.toHaveBeenCalled();
  unmount();
});

test('discarded answers cannot reappear after backgrounding or unmounting', async () => {
  const pending = deferred<unknown>();
  jest.mocked(requestConcierge).mockReturnValue(pending.promise);
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  let asking!: Promise<void>;
  act(() => { asking = result.current.ask('What is on?'); });
  const signal = jest.mocked(requestConcierge).mock.calls[0][3];
  act(() => { appStateListener?.('background'); });
  expect(signal.aborted).toBe(true);
  unmount();
  await act(async () => { pending.resolve(proposal()); await asking; });
  expect(stageAssistantDraft).not.toHaveBeenCalled();
});

test('never submits a second question while one request is pending', async () => {
  const pending = deferred<unknown>();
  jest.mocked(requestConcierge).mockReturnValue(pending.promise);
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  let first!: Promise<void>;
  act(() => { first = result.current.ask('What is on?'); });
  await act(async () => { await result.current.ask('Create movie time'); });
  expect(requestConcierge).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve(proposal()); await first; });
  unmount();
});

test('rejects ungrounded and malformed replies instead of exposing an actionable draft', async () => {
  jest.mocked(requestConcierge).mockResolvedValue({ ...proposal(), deviceIds: ['hidden-bedroom-light'] });
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  await act(async () => { await result.current.ask('Make a scene'); });
  expect(result.current.status).toBe('error');
  expect(result.current.response).toBeNull();
  expect(result.current.canReview).toBe(false);
  expect(stageAssistantDraft).not.toHaveBeenCalled();
  unmount();
});

test('Guest expiry aborts a pending request without requiring another store update', async () => {
  const home = useHomeStore.getState();
  useHomeStore.setState({ household: [{ ...home.household[0], role: 'Guest', accessExpiresAt: new Date(now + 500).toISOString() }],
    roomMembers: [{ memberId: home.activeMemberId, roomIds: ['registry-room:living'] }] });
  controls.access = resolveModelSceneAccess(useHomeStore.getState());
  const pending = deferred<unknown>();
  jest.mocked(requestConcierge).mockReturnValue(pending.promise);
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  let asking!: Promise<void>;
  act(() => { asking = result.current.ask('What is on in my room?'); });
  const signal = jest.mocked(requestConcierge).mock.calls[0][3];
  act(() => { jest.advanceTimersByTime(501); });
  await act(async () => { pending.resolve({ ...proposal(), scene: null }); await asking; });
  expect(signal.aborted).toBe(true);
  expect(result.current.response).toBeNull();
  expect(result.current.context.available).toBe(false);
  unmount();
});

test('scene review revalidates authority even if a previous callback is retained', async () => {
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  await act(async () => { await result.current.ask('Make a scene'); });
  const retained = result.current.prepareReview;
  act(() => { useHomeStore.setState({ sessionEpoch: useHomeStore.getState().sessionEpoch + 1 }); });
  act(() => { expect(retained()).toBeNull(); });
  expect(stageAssistantDraft).not.toHaveBeenCalled();
  unmount();
});

test('returning to the foreground refreshes availability without resubmitting an old question', async () => {
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  act(() => { appStateListener?.('background'); });
  expect(result.current.canAsk).toBe(false);
  act(() => { appStateListener?.('active'); });
  await settle();
  expect(conciergeAvailability).toHaveBeenCalledTimes(2);
  expect(requestConcierge).not.toHaveBeenCalled();
  expect(result.current.canAsk).toBe(true);
  unmount();
});

test('a displayed answer expires without waiting for another render or a stale review tap', async () => {
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  await act(async () => { await result.current.ask('Make a scene'); });
  expect(result.current.response).not.toBeNull();
  act(() => { jest.advanceTimersByTime(60_001); });
  expect(result.current.response).toBeNull();
  expect(result.current.canReview).toBe(false);
  expect(result.current.error).toMatch(/out of date/i);
  expect(stageAssistantDraft).not.toHaveBeenCalled();
  unmount();
});
