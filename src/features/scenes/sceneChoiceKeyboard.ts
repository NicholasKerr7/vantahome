import { Platform } from 'react-native';

type ChoiceKeyEvent = { key: string; repeat?: boolean; preventDefault: () => void };

/** RN Web already activates Enter; radio and checkbox roles also need a single Space activation. */
export function sceneChoiceKeyboard(onSelect: () => void) {
  return Platform.OS === 'web' ? { onKeyDown: (event: ChoiceKeyEvent) => {
    if (event.key !== ' ' && event.key !== 'Spacebar') return;
    event.preventDefault();
    if (!event.repeat) onSelect();
  } } : {};
}
