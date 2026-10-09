import { Platform } from 'react-native';

type SwitchKeyEvent = { key: string; repeat?: boolean; preventDefault: () => void };

/** Add Space for web switch rows; RN Web already handles Enter and native accessibility. */
export function switchKeyboard(onChange: () => void, disabled = false) {
  return Platform.OS === 'web' ? { onKeyDown: (event: SwitchKeyEvent) => {
    if (event.key !== ' ' && event.key !== 'Spacebar') return;
    event.preventDefault();
    if (!event.repeat && !disabled) onChange();
  } } : {};
}
