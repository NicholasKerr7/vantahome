import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import type { ConciergeResponse } from '../../../shared/home-concierge/contract';
import { useHomeStore } from '../../store/useHomeStore';
import { virtualSceneHome } from '../scenes/sceneTestFixtures';
import { modelSimulationScope } from '../three-d-home/modelSceneAccess';
import { SimulationPersistence } from '../three-d-home/simulationPersistence';
import { useSimulationControls } from '../three-d-home/useSimulationControls';
import { conciergeAvailability, requestConcierge } from './conciergeService';
import { useHomeConcierge } from './useHomeConcierge';

// Keep the real control client, reducers, authorization and persistence connected.
jest.mock('./conciergeService', () => ({
  ...jest.requireActual('./conciergeService'), conciergeAvailability: jest.fn(), requestConcierge: jest.fn(),
}));

const original = useHomeStore.getState();
const now = 1_800_000_000_000;
const bedroomLights = ['master-light', 'master-bedside-left', 'master-bedside-right'];
const scopeBoundaries = ['expiry', 'room scope', 'home scope', 'grant', 'membership', 'member identity', 'background'] as const;
type ScopeBoundary = typeof scopeBoundaries[number];
let sequence = 0;
const appStateListeners = new Set<(state: AppStateStatus) => void>();

/** Flush storage acknowledgements, bridge hydration and React subscriptions without advancing time. */
async function settle(): Promise<void> {
  await act(async () => { for (let index = 0; index < 32; index += 1) await Promise.resolve(); });
}

/** Use a unique household so an earlier test's hydrated singleton cannot supply its saved state. */
function prepareOwner(): void {
  const homeId = `voice-conversation-integration-${++sequence}`;
  useHomeStore.setState(virtualSceneHome({ activeHomeId: homeId, accountHomeId: homeId,
    realtime: { enabled: false, useMqtt: false, wsUrl: '' } }), true);
}

/** Give the assistant and assertions the same real controls while allowing room scope changes. */
function renderConversation(roomId: string | null = null) {
  return renderHook(({ roomId: selectedRoom }: { roomId: string | null }) => {
    const controls = useSimulationControls();
    return { controls, assistant: useHomeConcierge({ roomId: selectedRoom, controls }) };
  }, { initialProps: { roomId } });
}

/** Deliver one final, consented utterance and await the actual simulation save. */
async function speak(hook: ReturnType<typeof renderConversation>, question: string): Promise<ConciergeResponse | null> {
  let response: ConciergeResponse | null = null;
  act(() => { response = hook.result.current.assistant.respondLocally(question, () => true); });
  await settle();
  return response;
}

/** Notify every active native lifecycle subscription, including cleanup when a listener is removed. */
function changeAppState(state: AppStateStatus): void {
  act(() => { for (const listener of appStateListeners) listener(state); });
}

/** Interrupt current authority and return an explicit restoration so old memory cannot borrow renewed access. */
async function interruptScope(hook: ReturnType<typeof renderConversation>, boundary: ScopeBoundary): Promise<() => void> {
  const home = useHomeStore.getState();
  if (boundary === 'expiry') act(() => { jest.advanceTimersByTime(60_001); });
  if (boundary === 'room scope') hook.rerender({ roomId: 'registry-room:master' });
  if (boundary === 'home scope') act(() => { prepareOwner(); });
  if (boundary === 'grant') act(() => { useHomeStore.setState({ memberPermissionOverrides: [
    { memberId: home.activeMemberId, permission: 'light.control', allowed: false },
  ] }); });
  if (boundary === 'membership') act(() => { useHomeStore.setState({ membershipReady: false }); });
  if (boundary === 'member identity') act(() => { useHomeStore.setState({ activeMemberId: 'another-member' }); });
  if (boundary === 'background') changeAppState('background');
  await settle();
  return () => {
    if (boundary === 'room scope') hook.rerender({ roomId: null });
    if (boundary === 'home scope') act(() => { useHomeStore.setState(home, true); });
    if (boundary === 'grant') act(() => { useHomeStore.setState({ memberPermissionOverrides: [] }); });
    if (boundary === 'membership') act(() => { useHomeStore.setState({ membershipReady: true }); });
    if (boundary === 'member identity') act(() => { useHomeStore.setState({ activeMemberId: home.activeMemberId }); });
    if (boundary === 'background') changeAppState('active');
  };
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(now);
  jest.clearAllMocks();
  await AsyncStorage.clear();
  appStateListeners.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.add(listener);
    return { remove: () => { appStateListeners.delete(listener); } };
  });
  jest.mocked(conciergeAvailability).mockResolvedValue(true);
  prepareOwner();
});

afterEach(() => {
  cleanup();
  useHomeStore.setState(original, true);
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('relative follow-ups use fresh individual levels, preserve power and persist settings without conversation memory', async () => {
  const hook = renderConversation();
  await settle();
  expect((await speak(hook, 'turn primary suite lights on'))?.answer).toContain('Simulation updated');
  act(() => {
    hook.result.current.controls.client.setSetting('master-light', 'brightness', 25);
    hook.result.current.controls.client.setSetting('master-bedside-left', 'brightness', 95);
    hook.result.current.controls.client.setSetting('master-bedside-right', 'brightness', 0);
    hook.result.current.controls.client.setPower(['master-bedside-left', 'master-bedside-right'], false);
  });
  await settle();
  const before = hook.result.current.controls.client.getSnapshot().state.deviceStates;
  expect(hook.result.current.assistant.acceptsVoiceFollowUp('make them brighter')).toBe(true);
  expect((await speak(hook, 'make them brighter'))?.answer).toContain('Simulation updated');
  const after = hook.result.current.controls.client.getSnapshot().state.deviceStates;
  expect(bedroomLights.map((id) => ({ level: after[id].level, on: after[id].on }))).toEqual([
    { level: 35, on: true }, { level: 100, on: false }, { level: 10, on: false },
  ]);
  for (const [id, state] of Object.entries(before)) if (!bedroomLights.includes(id)) expect(after[id]).toEqual(state);

  // A new persistence instance must read the saved adapter, not the app singleton's in-memory cache.
  const saved = await new SimulationPersistence().load(modelSimulationScope(useHomeStore.getState(), false));
  for (const id of bedroomLights) expect(saved.deviceStates[id]).toEqual(after[id]);
  expect(AsyncStorage.setItem).toHaveBeenCalled();
  for (const [, value] of jest.mocked(AsyncStorage.setItem).mock.calls) {
    expect(value).not.toMatch(/lastDeviceIds|pendingClarification|make them brighter|turn primary suite lights on/);
  }
  expect(requestConcierge).not.toHaveBeenCalled();
  hook.unmount();

  const reopened = renderConversation();
  await settle();
  for (const id of bedroomLights) expect(reopened.result.current.controls.client.getSnapshot().state.deviceStates[id]).toEqual(after[id]);
  expect(reopened.result.current.assistant.acceptsVoiceFollowUp('make them brighter')).toBe(false);
  jest.mocked(AsyncStorage.setItem).mockClear();
  expect((await speak(reopened, 'make them brighter'))?.answer).toContain('name the room and device');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test.each(['spoken room', 'displayed choice'] as const)('an ambiguous command writes nothing until its %s selects one exact target', async (selection) => {
  const hook = renderConversation();
  await settle();
  act(() => { hook.result.current.controls.client.setPower(['living-light', 'family-light', ...bedroomLights], true); });
  await settle();
  const before = hook.result.current.controls.client.getSnapshot().state.deviceStates;
  jest.mocked(AsyncStorage.setItem).mockClear();

  expect((await speak(hook, 'turn lights off'))?.answer).toContain('Which room or device');
  expect(hook.result.current.controls.client.getSnapshot().state.deviceStates).toEqual(before);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  const choice = hook.result.current.assistant.voiceClarification?.choices.find((item) => item.label === 'Living room');
  if (!choice) throw new Error('Expected a permitted Living room clarification');
  const reply = selection === 'spoken room' ? 'living room' : choice.reply;
  expect(hook.result.current.assistant.acceptsVoiceFollowUp(reply)).toBe(true);
  expect((await speak(hook, reply))?.answer).toContain('Simulation updated');

  const after = hook.result.current.controls.client.getSnapshot().state.deviceStates;
  expect(after['living-light'].on).toBe(false);
  for (const [id, state] of Object.entries(before)) if (id !== 'living-light') expect(after[id]).toEqual(state);
  expect(hook.result.current.assistant.voiceClarification).toBeNull();
  expect(requestConcierge).not.toHaveBeenCalled();
});

test.each(scopeBoundaries)(
  'completed targets stay forgotten after a changed %s boundary is restored', async (boundary) => {
    const hook = renderConversation();
    await settle();
    await speak(hook, 'turn living room lights on');
    expect(hook.result.current.assistant.acceptsVoiceFollowUp('turn them off')).toBe(true);
    const retainedRespond = hook.result.current.assistant.respondLocally;
    const restore = await interruptScope(hook, boundary);
    expect(hook.result.current.assistant.acceptsVoiceFollowUp('turn them off')).toBe(false);
    restore();
    await settle();
    const before = hook.result.current.controls.client.getSnapshot().state.deviceStates;
    jest.mocked(AsyncStorage.setItem).mockClear();
    expect(hook.result.current.assistant.acceptsVoiceFollowUp('turn them off')).toBe(false);
    act(() => { retainedRespond('turn them off', () => true); });
    await settle();
    expect(hook.result.current.controls.client.getSnapshot().state.deviceStates).toEqual(before);
    expect(before['living-light'].on).toBe(true);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(requestConcierge).not.toHaveBeenCalled();
  });

test.each(scopeBoundaries)('pending choices cannot resume after a changed %s boundary', async (boundary) => {
  const hook = renderConversation();
  await settle();
  act(() => { hook.result.current.controls.client.setPower(['living-light'], true); });
  await settle();
  await speak(hook, 'turn lights off');
  const reply = hook.result.current.assistant.voiceClarification?.choices.find((choice) => choice.label === 'Living room')?.reply;
  if (!reply) throw new Error('Expected a Living room clarification');
  const restore = await interruptScope(hook, boundary);
  expect(hook.result.current.assistant.voiceClarification).toBeNull();
  expect(hook.result.current.assistant.acceptsVoiceFollowUp(reply)).toBe(false);
  restore();
  await settle();
  const before = hook.result.current.controls.client.getSnapshot().state.deviceStates;
  jest.mocked(AsyncStorage.setItem).mockClear();
  await speak(hook, reply);
  expect(hook.result.current.controls.client.getSnapshot().state.deviceStates).toEqual(before);
  expect(before['living-light'].on).toBe(true);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(requestConcierge).not.toHaveBeenCalled();
});

test('Guest expiry invalidates a pending clarification without another registry update or a write', async () => {
  const home = useHomeStore.getState();
  useHomeStore.setState({ household: [{ ...home.household[0], role: 'Guest', accessExpiresAt: new Date(now + 500).toISOString() }],
    roomMembers: [{ memberId: home.activeMemberId, roomIds: ['registry-room:living', 'registry-room:master'] }] });
  const hook = renderConversation();
  await settle();
  await speak(hook, 'turn lights off');
  const reply = hook.result.current.assistant.voiceClarification?.choices[0].reply;
  if (!reply) throw new Error('Expected a Guest-scoped clarification');
  expect(hook.result.current.assistant.acceptsVoiceFollowUp(reply)).toBe(true);
  jest.mocked(AsyncStorage.setItem).mockClear();
  act(() => { jest.advanceTimersByTime(501); });
  await settle();
  expect(hook.result.current.assistant.voiceClarification).toBeNull();
  expect(hook.result.current.assistant.acceptsVoiceFollowUp(reply)).toBe(false);
  await speak(hook, reply);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(requestConcierge).not.toHaveBeenCalled();
});

test.each(['cancel', 'new command', 'new question', 'reset', 'consent'] as const)(
  '%s removes a pending clarification so its old choice cannot replay', async (transition) => {
    const hook = renderConversation();
    await settle();
    act(() => { hook.result.current.controls.client.setPower(['living-light'], true); });
    await settle();
    await speak(hook, 'turn lights off');
    const reply = hook.result.current.assistant.voiceClarification?.choices.find((choice) => choice.label === 'Living room')?.reply;
    if (!reply) throw new Error('Expected a Living room clarification');

    if (transition === 'cancel') await speak(hook, 'never mind');
    if (transition === 'new command') await speak(hook, 'turn primary suite lights on');
    if (transition === 'new question') await speak(hook, 'home brief');
    if (transition === 'reset') act(() => { hook.result.current.assistant.resetVoiceConversation(); });
    if (transition === 'consent') act(() => { hook.result.current.assistant.respondLocally(reply, () => false); });
    await settle();
    expect(hook.result.current.assistant.voiceClarification).toBeNull();
    expect(hook.result.current.assistant.acceptsVoiceFollowUp(reply)).toBe(false);
    const before = hook.result.current.controls.client.getSnapshot().state.deviceStates;
    jest.mocked(AsyncStorage.setItem).mockClear();
    await speak(hook, reply);
    expect(hook.result.current.controls.client.getSnapshot().state.deviceStates).toEqual(before);
    expect(before['living-light'].on).toBe(true);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

test('a new completed intent replaces old targets and cancellation clears the replacement', async () => {
  const hook = renderConversation();
  await settle();
  await speak(hook, 'turn living room lights on');
  await speak(hook, 'turn primary suite lights on');
  await speak(hook, 'turn them off');
  const states = hook.result.current.controls.client.getSnapshot().state.deviceStates;
  expect(states['living-light'].on).toBe(true);
  expect(bedroomLights.every((id) => !states[id].on)).toBe(true);
  await speak(hook, 'cancel');
  expect(hook.result.current.assistant.acceptsVoiceFollowUp('turn them on')).toBe(false);
  jest.mocked(AsyncStorage.setItem).mockClear();
  await speak(hook, 'turn them on');
  expect(hook.result.current.controls.client.getSnapshot().state.deviceStates).toEqual(states);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test('a scene draft clears old voice targets and remains review-only through a real cloud-response handoff', async () => {
  const hook = renderConversation();
  await settle();
  await speak(hook, 'turn living room lights on');
  const before = hook.result.current.controls.client.getSnapshot().state;
  const scenes = useHomeStore.getState().scenes;
  jest.mocked(AsyncStorage.setItem).mockClear();
  expect(await speak(hook, 'Draft a calm evening scene')).toBeNull();
  expect(hook.result.current.assistant.acceptsVoiceFollowUp('turn them off')).toBe(false);
  expect(requestConcierge).not.toHaveBeenCalled();
  jest.mocked(requestConcierge).mockResolvedValue({ title: 'Evening calm', answer: 'Review softer lighting.',
    deviceIds: ['registry-device:living-light'], scene: { name: 'Evening calm', explanation: 'Softer light.',
      actions: [{ deviceId: 'registry-device:living-light', values: { brightness: 25 } }] } });
  await act(async () => { await hook.result.current.assistant.ask('Draft a calm evening scene'); });
  expect(hook.result.current.assistant.canReview).toBe(true);
  expect(hook.result.current.assistant.response?.scene?.name).toBe('Evening calm');
  expect(hook.result.current.controls.client.getSnapshot().state).toEqual(before);
  expect(useHomeStore.getState().scenes).toBe(scenes);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test('only current targets or a pending choice can arm a wake-free microphone window', async () => {
  const hook = renderConversation();
  await settle();
  expect(hook.result.current.assistant.readVoiceFollowUp()).toBeNull();
  await speak(hook, 'turn living room lights on');
  const predicate = hook.result.current.assistant.readVoiceFollowUp();
  expect(predicate?.('make them dimmer')).toBe(true);
  expect(predicate?.('turn kitchen lights off')).toBe(false);
  await speak(hook, 'home brief');
  expect(hook.result.current.assistant.readVoiceFollowUp()).toBeNull();
  expect(predicate?.('make them dimmer')).toBe(false);
  await speak(hook, 'turn lights off');
  expect(hook.result.current.assistant.readVoiceFollowUp()?.('living room')).toBe(true);
  await speak(hook, 'cancel');
  expect(hook.result.current.assistant.readVoiceFollowUp()).toBeNull();
});
