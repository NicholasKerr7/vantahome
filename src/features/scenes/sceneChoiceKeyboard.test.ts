import { Platform } from 'react-native';
import { sceneChoiceKeyboard } from './sceneChoiceKeyboard';

test('activates Space once on web while leaving Enter to native Pressable handling', () => {
  const original = Platform.OS;
  Platform.OS = 'web';
  try {
    const select = jest.fn();
    const preventDefault = jest.fn();
    const props = sceneChoiceKeyboard(select);
    props.onKeyDown?.({ key: ' ', preventDefault });
    props.onKeyDown?.({ key: ' ', repeat: true, preventDefault });
    props.onKeyDown?.({ key: 'Enter', preventDefault });
    expect(select).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(2);
  } finally { Platform.OS = original; }
});

test('leaves native accessibility activation to the platform', () => {
  const original = Platform.OS;
  Platform.OS = 'ios';
  try { expect(sceneChoiceKeyboard(jest.fn())).toEqual({}); }
  finally { Platform.OS = original; }
});
