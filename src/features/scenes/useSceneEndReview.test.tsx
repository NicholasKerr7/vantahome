import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useHomeStore } from '../../store/useHomeStore';
import { virtualSceneHome } from './sceneTestFixtures';
import { useSceneEndReview } from './useSceneEndReview';
import { finishSceneEndReview, prepareSceneEndReview, sceneEndAccessKey, type SceneEndReviewSession } from './sceneEndReview';

jest.mock('./sceneEndReview', () => ({ ...jest.requireActual('./sceneEndReview'), prepareSceneEndReview: jest.fn(), finishSceneEndReview: jest.fn() }));
jest.mock('../three-d-home/useControllerFocused', () => ({ useControllerFocused: () => true }));
const prepare = jest.mocked(prepareSceneEndReview);
const finish = jest.mocked(finishSceneEndReview);

/** Supply only review metadata; hook tests exercise lifecycle and tap locking, not the reducer. */
function session(): SceneEndReviewSession {
  return { model: { sceneId: 'evening', sceneName: 'Evening', runId: 'run', revision: 1, canRestore: true, items: [] },
    editorScope: '', accessKey: sceneEndAccessKey(useHomeStore.getState()), storageScope: '', receiptKey: '', lastRunKey: '', planKey: '' };
}
beforeEach(() => {
  jest.clearAllMocks();
  useHomeStore.setState(virtualSceneHome({ activeSceneId: 'evening' }));
  prepare.mockResolvedValue(session()); finish.mockResolvedValue();
});

test('opening or closing never applies changes and an old read cannot reopen a closed review', async () => {
  let resolve!: (value: SceneEndReviewSession) => void;
  prepare.mockReturnValue(new Promise((done) => { resolve = done; }));
  const { result } = renderHook(useSceneEndReview);
  act(() => result.current.open('evening'));
  expect(result.current.loading).toBe(true);
  act(() => result.current.close());
  await act(async () => { resolve(session()); });
  expect(result.current.shown).toBe(false);
  expect(finish).not.toHaveBeenCalled();
});

test('rapid confirmation taps execute once and closing aborts pending mutation', async () => {
  finish.mockReturnValue(new Promise(() => undefined));
  const { result } = renderHook(useSceneEndReview);
  act(() => result.current.open('evening'));
  await waitFor(() => expect(result.current.review).not.toBeNull());
  act(() => { result.current.restore(); result.current.restore(); result.current.keep(); });
  expect(finish).toHaveBeenCalledTimes(1);
  const signal = finish.mock.calls[0][4];
  expect(signal?.aborted).toBe(false);
  act(() => result.current.close());
  expect(signal?.aborted).toBe(true);
});

test('household verification loss discards the open review', async () => {
  const { result } = renderHook(useSceneEndReview);
  act(() => result.current.open('evening'));
  await waitFor(() => expect(result.current.shown).toBe(true));
  await act(async () => { useHomeStore.setState({ membershipReady: false }); });
  expect(result.current.shown).toBe(false);
  act(() => result.current.restore());
  expect(finish).not.toHaveBeenCalled();
});

test('backgrounding removes review and aborts a pending confirmation', async () => {
  let changed: ((next: 'background') => void) | undefined;
  const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => {
    changed = callback; return { remove: jest.fn() };
  });
  finish.mockReturnValue(new Promise(() => undefined));
  const { result, unmount } = renderHook(useSceneEndReview);
  act(() => result.current.open('evening'));
  await waitFor(() => expect(result.current.review).not.toBeNull());
  act(() => result.current.keep());
  act(() => changed?.('background'));
  expect(result.current.shown).toBe(false);
  expect(finish.mock.calls[0][4]?.aborted).toBe(true);
  unmount(); listener.mockRestore();
});
