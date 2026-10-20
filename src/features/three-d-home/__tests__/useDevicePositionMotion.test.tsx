import React from 'react';
import { AccessibilityInfo, Animated, AppState, type AppStateStatus } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { act, renderHook } from '@testing-library/react-native';
import { useDevicePositionMotion } from '../useDevicePositionMotion';

let onAppChange: (state: AppStateStatus) => void;
let onMotionChange: (enabled: boolean) => void;
let currentPosition = 40;
const removeAppListener = jest.fn();
const removeMotionListener = jest.fn();
const start = jest.fn();
const stop = jest.fn();
const reset = jest.fn();
const originalAppState = AppState.currentState;

/** Resolve the real motion hook's initial platform preference without running native animation frames. */
async function settleMotion(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  currentPosition = 40;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    onAppChange = listener;
    return { remove: removeAppListener };
  });
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, listener) => {
    onMotionChange = listener as unknown as (enabled: boolean) => void;
    return { remove: removeMotionListener } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>;
  });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(Animated.Value.prototype, 'stopAnimation').mockImplementation((callback) => { callback?.(currentPosition); });
  jest.spyOn(Animated.Value.prototype, 'setValue');
  jest.spyOn(Animated, 'timing').mockReturnValue({ start, stop, reset });
  jest.spyOn(Animated, 'loop');
});
afterEach(() => {
  jest.restoreAllMocks();
  AppState.currentState = originalAppState;
});

test('restored position is immediate and only a changed accepted target starts one short native transition', async () => {
  const screen = renderHook<Animated.Value, { position: number }>(({ position }) => useDevicePositionMotion(position, true), { initialProps: { position: 40 } });
  await settleMotion();
  expect(Animated.timing).not.toHaveBeenCalled();
  screen.rerender({ position: 100 });
  expect(Animated.timing).toHaveBeenLastCalledWith(expect.any(Animated.Value), expect.objectContaining({
    toValue: 100, duration: 300, useNativeDriver: true, isInteraction: false,
  }));
  expect(Animated.Value.prototype.setValue).toHaveBeenLastCalledWith(40);
  expect(start).toHaveBeenCalledTimes(1);
  screen.rerender({ position: 100 });
  expect(start).toHaveBeenCalledTimes(1);
  expect(Animated.loop).not.toHaveBeenCalled();
});

test('a rapid reversal begins at the interrupted presentation and cleans up the previous tween', async () => {
  const screen = renderHook<Animated.Value, { position: number }>(({ position }) => useDevicePositionMotion(position, true), { initialProps: { position: 0 } });
  await settleMotion();
  screen.rerender({ position: 100 });
  currentPosition = 63;
  screen.rerender({ position: 0 });
  expect(stop).toHaveBeenCalledTimes(1);
  expect(Animated.Value.prototype.setValue).toHaveBeenLastCalledWith(63);
  expect(Animated.timing).toHaveBeenLastCalledWith(expect.any(Animated.Value), expect.objectContaining({ toValue: 0 }));
  screen.unmount();
  expect(stop).toHaveBeenCalledTimes(2);
});

test('disabled motion and unknown positions snap safely with no loop or untrusted percentage', async () => {
  const screen = renderHook<Animated.Value, { position: number | null; allowed: boolean }>(({ position, allowed }) =>
    useDevicePositionMotion(position, allowed), { initialProps: { position: null, allowed: false } });
  await settleMotion();
  screen.rerender({ position: 150, allowed: false });
  expect(Animated.Value.prototype.setValue).toHaveBeenLastCalledWith(100);
  screen.rerender({ position: -30, allowed: false });
  expect(Animated.Value.prototype.setValue).toHaveBeenLastCalledWith(0);
  screen.rerender({ position: NaN, allowed: false });
  expect(Animated.Value.prototype.setValue).toHaveBeenLastCalledWith(0);
  expect(Animated.timing).not.toHaveBeenCalled();
  expect(Animated.loop).not.toHaveBeenCalled();
});

test('recovery from unknown position snaps to its first accepted value without inventing prior travel', async () => {
  const screen = renderHook<Animated.Value, { position: number | null }>(({ position }) =>
    useDevicePositionMotion(position, true), { initialProps: { position: null } });
  await settleMotion();
  screen.rerender({ position: 75 });
  expect(Animated.timing).not.toHaveBeenCalled();
  expect(Animated.Value.prototype.setValue).toHaveBeenLastCalledWith(75);
  screen.rerender({ position: 50 });
  expect(Animated.timing).toHaveBeenCalledTimes(1);
  screen.rerender({ position: null });
  screen.rerender({ position: 100 });
  expect(Animated.timing).toHaveBeenCalledTimes(1);
  expect(Animated.Value.prototype.setValue).toHaveBeenLastCalledWith(100);
});

test('background and reduced motion stop then snap to accepted position without replaying on return', async () => {
  const screen = renderHook<Animated.Value, { position: number }>(({ position }) => useDevicePositionMotion(position, true), { initialProps: { position: 0 } });
  await settleMotion();
  screen.rerender({ position: 100 });
  act(() => onAppChange('inactive'));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(Animated.Value.prototype.setValue).toHaveBeenLastCalledWith(100);
  act(() => onAppChange('active'));
  expect(start).toHaveBeenCalledTimes(1);
  screen.rerender({ position: 25 });
  act(() => onMotionChange(true));
  expect(stop).toHaveBeenCalledTimes(2);
  expect(Animated.Value.prototype.setValue).toHaveBeenLastCalledWith(25);
  act(() => onMotionChange(false));
  expect(start).toHaveBeenCalledTimes(2);
  screen.unmount();
  expect(removeAppListener).toHaveBeenCalledTimes(1);
  expect(removeMotionListener).toHaveBeenCalledTimes(1);
});

test('retained route blur stops transitions and hidden position edits do not replay on focus', async () => {
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
  /** Supply the same optional navigation focus contract used by real retained routes. */
  function Wrapper({ children }: React.PropsWithChildren) {
    return <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>;
  }
  const screen = renderHook<Animated.Value, { position: number }>(({ position }) => useDevicePositionMotion(position, true), {
    initialProps: { position: 0 }, wrapper: Wrapper,
  });
  await settleMotion();
  screen.rerender({ position: 100 });
  act(() => { focused = false; listeners.get('blur')?.(); });
  expect(stop).toHaveBeenCalledTimes(1);
  screen.rerender({ position: 25 });
  expect(Animated.Value.prototype.setValue).toHaveBeenLastCalledWith(25);
  act(() => { focused = true; listeners.get('focus')?.(); });
  expect(start).toHaveBeenCalledTimes(1);
  screen.unmount();
  expect(offFocus).toHaveBeenCalledTimes(1);
  expect(offBlur).toHaveBeenCalledTimes(1);
});

test('a delayed native callback cannot start a superseded or unmounted transition', async () => {
  const pending: Array<(value: number) => void> = [];
  jest.mocked(Animated.Value.prototype.stopAnimation).mockImplementation((callback) => {
    if (callback) pending.push(callback);
  });
  const screen = renderHook<Animated.Value, { position: number }>(({ position }) => useDevicePositionMotion(position, true), { initialProps: { position: 0 } });
  await settleMotion();
  screen.rerender({ position: 100 });
  screen.unmount();
  act(() => pending.forEach((callback) => callback(40)));
  expect(Animated.timing).not.toHaveBeenCalled();
});
