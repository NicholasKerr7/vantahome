import { Alert, Platform, type AlertButton } from 'react-native';
import { useHomeStore } from '../store/useHomeStore';
import { hasCurrentMembershipAccess } from '../security/guestAccess';

/** Retain the authorization boundary that existed when a confirmation was opened. */
function captureScope() {
  const state = useHomeStore.getState();
  return [state.authenticatedUserId, state.activeHomeId, state.activeMemberId,
    state.sessionEpoch, state.membershipReady, state.household,
    state.roomMembers, state.memberPermissionOverrides];
}

export type FeedbackMessage = {
  title: string;
  message?: string;
  buttons: AlertButton[];
  isCurrent: () => boolean;
};
let current: FeedbackMessage | null = null;
const listeners = new Set<() => void>();

/** Publish one bounded dialog; superseded actions cannot be invoked from an old dialog. */
function publish(message: FeedbackMessage | null) {
  current = message;
  listeners.forEach((listener) => listener());
}

/** Match React's external-store contract without creating a new snapshot on each render. */
export function subscribeToFeedback(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Read the currently displayed browser dialog. */
export function getFeedback() { return current; }

/** Dismiss without executing a destructive confirmation. */
export function dismissFeedback() { publish(null); }

/** Close a dialog when its account, home, membership, or permission boundary changes. */
export function reconcileFeedback() {
  if (current && !current.isCurrent()) dismissFeedback();
}

/** Execute only the current dialog's button, after rechecking its authorization boundary. */
export function respondToFeedback(message: FeedbackMessage, button: AlertButton) {
  if (current !== message || !message.buttons.includes(button)) return;
  const allowed = message.isCurrent();
  dismissFeedback();
  if (allowed) button.onPress?.();
}

/** Native alerts retain platform behavior; browser alerts use the accessible rendered host. */
function alert(title: string, message?: string, buttons?: AlertButton[]) {
  // Native informational messages have no delayed action to fence.
  if (Platform.OS !== 'web' && !buttons) {
    Alert.alert(title, message);
    return;
  }
  const scope = captureScope();
  const hasAction = buttons?.some((button) => Boolean(button.onPress));
  const isCurrent = () => {
    if (!captureScope().every((value, index) => value === scope[index])) return false;
    if (!hasAction) return true;
    const state = useHomeStore.getState();
    return hasCurrentMembershipAccess(state.household.find((member) => member.id === state.activeMemberId));
  };
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons?.map((button) => ({ ...button,
      onPress: button.onPress ? () => { if (isCurrent()) button.onPress?.(); } : undefined,
    })));
    return;
  }
  publish({ title, message, isCurrent, buttons: buttons?.length ? buttons : [{ text: 'OK' }] });
}

export const AppFeedback = { alert };
