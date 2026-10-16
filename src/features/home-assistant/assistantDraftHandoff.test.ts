import { useHomeStore, type Scene } from '../../store/useHomeStore';
import { virtualSceneHome } from '../scenes/sceneTestFixtures';
import { clearAssistantDraft, consumeAssistantDraft, stageAssistantDraft } from './assistantDraftHandoff';
import { randomUUID } from 'expo-crypto';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const initial = useHomeStore.getState();
const draft: Omit<Scene, 'id'> = { name: 'Evening calm', scope: 'room', roomId: 'registry-room:living',
  actions: [{ type: 'patch', deviceId: 'registry-device:living-light', patch: { isOn: true, brightness: 20 } }] };

beforeEach(() => {
  jest.useFakeTimers(); useHomeStore.setState(virtualSceneHome());
  let sequence = 0;
  jest.mocked(randomUUID).mockReset().mockImplementation(() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`);
});
afterEach(() => { clearAssistantDraft(); useHomeStore.setState(initial, true); jest.useRealTimers(); });

test('review consumes one in-memory draft without saving or executing it', () => {
  const token = stageAssistantDraft(draft, Date.now() + 60_000);
  expect(consumeAssistantDraft(token)).toEqual(draft);
  expect(consumeAssistantDraft(token)).toBeNull();
  expect(useHomeStore.getState().scenes).toEqual([]);
  expect(useHomeStore.getState().devices.find((item) => item.id === 'registry-device:living-light')?.isOn).toBe(false);
});

test('returning to the same home cannot recover a draft invalidated by a session switch', () => {
  const state = useHomeStore.getState();
  const token = stageAssistantDraft(draft, Date.now() + 60_000);
  useHomeStore.setState({ activeHomeId: 'different-home' });
  useHomeStore.setState({ activeHomeId: state.activeHomeId });
  expect(consumeAssistantDraft(token)).toBeNull();
});

test('permission loss and clock expiry invalidate review tokens', () => {
  const token = stageAssistantDraft(draft, Date.now() + 1000);
  jest.advanceTimersByTime(1001);
  expect(consumeAssistantDraft(token)).toBeNull();
  const second = stageAssistantDraft(draft, Date.now() + 1000);
  useHomeStore.setState({ memberPermissionOverrides: [{ memberId: useHomeStore.getState().activeMemberId, permission: 'automation.manage', allowed: false }] });
  expect(consumeAssistantDraft(second)).toBeNull();
});

test('a new review replaces the old one without letting stale or guessed tokens erase it', () => {
  const old = stageAssistantDraft(draft, Date.now() + 60_000);
  const current = stageAssistantDraft({ ...draft, name: 'Second draft' }, Date.now() + 60_000);
  expect(old).not.toBe(current);
  expect(consumeAssistantDraft(old)).toBeNull();
  expect(consumeAssistantDraft('not-issued')).toBeNull();
  expect(consumeAssistantDraft(current)?.name).toBe('Second draft');
  expect(consumeAssistantDraft(current)).toBeNull();
});

test('an ignored old token does not remove the current review expiry timer', () => {
  const old = stageAssistantDraft(draft, Date.now() + 60_000);
  const current = stageAssistantDraft({ ...draft, name: 'Second draft' }, Date.now() + 1000);
  expect(consumeAssistantDraft(old)).toBeNull();
  jest.advanceTimersByTime(1001);
  expect(consumeAssistantDraft(current)).toBeNull();
});
