import * as Haptics from 'expo-haptics';
import { useHomeStore } from '../store/useHomeStore';

/** Optional touch feedback always reads the latest preference, including retained callbacks. */
export async function selectionHaptic(): Promise<void> {
  if (!useHomeStore.getState().preferences.haptics) return;
  try {
    await Haptics.selectionAsync();
  } catch {
    // Unsupported or temporarily unavailable haptics must not interrupt the control action.
  }
}

/** Keep scene-card feedback consistent with the same device-local comfort preference. */
export async function impactHaptic(): Promise<void> {
  if (!useHomeStore.getState().preferences.haptics) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // Feedback is optional; the visual interaction remains available without the motor.
  }
}
