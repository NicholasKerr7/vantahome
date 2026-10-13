import * as Haptics from 'expo-haptics';
import { useHomeStore } from '../../store/useHomeStore';
import { impactHaptic, selectionHaptic } from '../haptics';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

const initial = useHomeStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useHomeStore.setState({ preferences: { haptics: true, notifications: true } });
});
afterEach(() => useHomeStore.setState(initial, true));

test('all feedback types read the latest saved choice at interaction time', async () => {
  await selectionHaptic();
  await impactHaptic();
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);

  useHomeStore.getState().setPreferences({ haptics: false });
  await selectionHaptic();
  await impactHaptic();
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);

  useHomeStore.getState().setPreferences({ haptics: true });
  await selectionHaptic();
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
});

test('unsupported device feedback cannot reject the control action', async () => {
  jest.mocked(Haptics.selectionAsync).mockRejectedValueOnce(new Error('Unavailable'));
  jest.mocked(Haptics.impactAsync).mockRejectedValueOnce(new Error('Unavailable'));
  await expect(selectionHaptic()).resolves.toBeUndefined();
  await expect(impactHaptic()).resolves.toBeUndefined();
});
