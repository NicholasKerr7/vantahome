import React from 'react';
import { AccessibilityInfo, Animated, AppState, type AppStateStatus } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { act, renderHook } from '@testing-library/react-native';
import { useFanRotorMotion } from '../useFanRotorMotion';

let onAppChange: (state: AppStateStatus) => void;
let onMotionChange: (enabled: boolean) => void;
let phase = 0.375;
const removeAppListener = jest.fn();
const removeMotionListener = jest.fn();
const start = jest.fn();
const stop = jest.fn();
const reset = jest.fn();
const originalAppState = AppState.currentState;
type RotorStyle = ReturnType<typeof useFanRotorMotion>;

/** Complete the real motion-policy hook's asynchronous initial preference without running a frame loop. */
async function settleMotion(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  phase = 0.375;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    onAppChange = listener;
    return { remove: removeAppListener };
  });
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, listener) => {
    onMotionChange = listener as unknown as (enabled: boolean) => void;
    return { remove: removeMotionListener } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>;
  });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(Animated.Value.prototype, 'stopAnimation').mockImplementation((callback) => { callback?.(phase); });
  jest.spyOn(Animated, 'timing').mockReturnValue({ start, stop, reset });
  jest.spyOn(Animated, 'loop').mockReturnValue({ start, stop, reset });
});

afterEach(() => {
  jest.restoreAllMocks();
  AppState.currentState = originalAppState;
});

test('speed and direction changes retain the phase and use native-driver timing without interaction work', async () => {
  const screen = renderHook<RotorStyle, { velocity: number }>(({ velocity }) => useFanRotorMotion(velocity, true), { initialProps: { velocity: 7.8 } });
  expect(Animated.loop).not.toHaveBeenCalled();
  await settleMotion();
  expect(Animated.timing).toHaveBeenLastCalledWith(expect.any(Animated.Value), expect.objectContaining({
    toValue: 1.375, duration: Math.round(2 * Math.PI / 7.8 * 1000), useNativeDriver: true, isInteraction: false,
  }));
  expect(start).toHaveBeenCalledTimes(1);
  phase = 0.65;
  screen.rerender({ velocity: -4.55 });
  expect(stop).toHaveBeenCalledTimes(1);
  expect(Animated.timing).toHaveBeenLastCalledWith(expect.any(Animated.Value), expect.objectContaining({
    toValue: -0.35, duration: Math.round(2 * Math.PI / 4.55 * 1000), useNativeDriver: true,
  }));
  expect(start).toHaveBeenCalledTimes(2);
  screen.unmount();
  expect(stop).toHaveBeenCalledTimes(2);
});

test('off, zero-speed and saved motion-disabled state allocate no running loop', async () => {
  const screen = renderHook<RotorStyle, { velocity: number; allowed: boolean }>(({ velocity, allowed }) => useFanRotorMotion(velocity, allowed), {
    initialProps: { velocity: 0, allowed: true },
  });
  await settleMotion();
  expect(Animated.loop).not.toHaveBeenCalled();
  screen.rerender({ velocity: 13, allowed: false });
  expect(Animated.loop).not.toHaveBeenCalled();
  screen.rerender({ velocity: 13, allowed: true });
  expect(start).toHaveBeenCalledTimes(1);
  screen.rerender({ velocity: 0, allowed: true });
  expect(stop).toHaveBeenCalledTimes(1);
  screen.rerender({ velocity: Number.NaN, allowed: true });
  expect(start).toHaveBeenCalledTimes(1);
});

test('native inactivity and live reduced motion stop the loop immediately and unsubscribe on unmount', async () => {
  const screen = renderHook(() => useFanRotorMotion(7.8, true));
  await settleMotion();
  act(() => onAppChange('inactive'));
  expect(stop).toHaveBeenCalledTimes(1);
  act(() => onAppChange('background'));
  expect(start).toHaveBeenCalledTimes(1);
  act(() => onAppChange('active'));
  expect(start).toHaveBeenCalledTimes(2);
  act(() => onMotionChange(true));
  expect(stop).toHaveBeenCalledTimes(2);
  act(() => onMotionChange(false));
  expect(start).toHaveBeenCalledTimes(3);
  screen.unmount();
  expect(stop).toHaveBeenCalledTimes(3);
  expect(removeAppListener).toHaveBeenCalledTimes(1);
  expect(removeMotionListener).toHaveBeenCalledTimes(1);
});

test('a retained navigation route stops on blur and resumes only when focused again', async () => {
  let focused = true;
  const listeners = new Map<string, () => void>();
  const offFocus = jest.fn();
  const offBlur = jest.fn();
  const navigation = {
    isFocused: () => focused,
    addListener: (event: string, listener: () => void) => {
      listeners.set(event, listener);
      return event === 'focus' ? offFocus : offBlur;
    },
  } as unknown as NonNullable<React.ContextType<typeof NavigationContext>>;
  /** Provide only the navigation focus contract consumed by the controller. */
  function Wrapper({ children }: React.PropsWithChildren) {
    return <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>;
  }
  const screen = renderHook(() => useFanRotorMotion(7.8, true), { wrapper: Wrapper });
  await settleMotion();
  act(() => { focused = false; listeners.get('blur')?.(); });
  expect(stop).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledTimes(1);
  act(() => { focused = true; listeners.get('focus')?.(); });
  expect(start).toHaveBeenCalledTimes(2);
  screen.unmount();
  expect(offFocus).toHaveBeenCalledTimes(1);
  expect(offBlur).toHaveBeenCalledTimes(1);
});

test('a delayed stop callback cannot start motion after its effect was cleaned up', async () => {
  const pending: Array<(value: number) => void> = [];
  jest.mocked(Animated.Value.prototype.stopAnimation).mockImplementation((callback) => {
    if (callback) pending.push(callback);
  });
  const screen = renderHook<RotorStyle, { allowed: boolean }>(({ allowed }) => useFanRotorMotion(7.8, allowed), { initialProps: { allowed: true } });
  await settleMotion();
  screen.rerender({ allowed: false });
  act(() => pending.forEach((callback) => callback(0.75)));
  expect(Animated.loop).not.toHaveBeenCalled();
});

test('unavailable or reduced system motion leaves the rotor static and readable', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockRejectedValue(new Error('Unavailable'));
  const screen = renderHook(() => useFanRotorMotion(7.8, true));
  await settleMotion();
  expect(Animated.loop).not.toHaveBeenCalled();
  expect(screen.result.current.transform).toHaveLength(1);
  act(() => onMotionChange(true));
  expect(Animated.loop).not.toHaveBeenCalled();
});
