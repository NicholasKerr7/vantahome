import { Platform } from 'react-native';
import { switchKeyboard } from '../switchKeyboard';

const platform = Platform.OS;
afterEach(() => { Platform.OS = platform; });

test('Space activates once while Enter remains owned by Pressable', () => {
  Platform.OS = 'web';
  const change = jest.fn();
  const preventDefault = jest.fn();
  const props = switchKeyboard(change);
  props.onKeyDown?.({ key: ' ', preventDefault });
  props.onKeyDown?.({ key: ' ', repeat: true, preventDefault });
  props.onKeyDown?.({ key: 'Enter', preventDefault });
  expect(change).toHaveBeenCalledTimes(1);
  expect(preventDefault).toHaveBeenCalledTimes(2);
});

test('disabled switches prevent Space scrolling without changing a preference', () => {
  Platform.OS = 'web';
  const change = jest.fn();
  const preventDefault = jest.fn();
  switchKeyboard(change, true).onKeyDown?.({ key: 'Spacebar', preventDefault });
  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(change).not.toHaveBeenCalled();
});

test('native keyboard and accessibility activation remain managed by the platform', () => {
  Platform.OS = 'ios';
  expect(switchKeyboard(jest.fn())).toEqual({});
});
