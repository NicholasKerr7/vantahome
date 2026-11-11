import React from 'react';
import { AccessibilityInfo, Animated, AppState, type AppStateStatus } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { act, renderHook } from '@testing-library/react-native';
import { useCeilingFanMotion } from '../useCeilingFanMotion';

let onAppChange: (state: AppStateStatus) => void;
let onMotionChange: (enabled: boolean) => void;
let phase = 0.375;
const removeAppListener = jest.fn();
const removeMotionListener = jest.fn();
const start = jest.fn();
const stop = jest.fn();
const reset = jest.fn();
let time = 0;
const transitionStart = jest.fn();
const transitionStop = jest.fn();
const originalAppState = AppState.currentState;
type RotorStyle = ReturnType<typeof useCeilingFanMotion>;

/** Complete the real motion-policy hook's asynchronous initial preference without running a frame loop. */
async function settleMotion(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  phase = 0.375; time = 0;
  jest.spyOn(performance, 'now').mockImplementation(() => time);
  jest.spyOn(Animated, 'sequence').mockReturnValue({ start: transitionStart, stop: transitionStop, reset });
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

/** Complete the finite native ramp to inspect its steady-loop handoff. */
function finishRamp(): void {
  act(() => transitionStart.mock.calls.at(-1)?.[0]?.({ finished: true }));
}

test('accelerates on the native driver then cruises without JavaScript frame work', async () => {
  const screen = renderHook(() => useCeilingFanMotion(8, true));
  await settleMotion();
  const config = jest.mocked(Animated.timing).mock.calls.at(-1)![1];
  expect(config).toMatchObject({ duration: 500, useNativeDriver: true, isInteraction: false });
  expect(config.toValue).toBeCloseTo(0.375 + 4 * 0.5 / (2 * Math.PI));
  expect(config.easing?.(0.5)).toBe(0.25);
  expect(Animated.loop).not.toHaveBeenCalled();
  finishRamp();
  expect(Animated.loop).toHaveBeenCalledTimes(1);
  expect(Animated.timing).toHaveBeenLastCalledWith(expect.any(Animated.Value), expect.objectContaining({
    duration: Math.round(2 * Math.PI / 8 * 1000), useNativeDriver: true, isInteraction: false,
  }));
  screen.unmount();
  expect(stop).toHaveBeenCalledTimes(1);
});

test('reversal decelerates to rest before accelerating in the opposite direction at the current phase', async () => {
  const screen = renderHook<RotorStyle, { velocity: number }>(({ velocity }) => useCeilingFanMotion(velocity, true), { initialProps: { velocity: 8 } });
  await settleMotion(); finishRamp(); phase = 0.65;
  screen.rerender({ velocity: -8 });
  const [deceleration, rest, acceleration] = jest.mocked(Animated.timing).mock.calls.slice(-3).map((entry) => entry[1]);
  expect([deceleration.duration, rest.duration, acceleration.duration]).toEqual([420, 80, 500]);
  expect(deceleration.toValue).toBeCloseTo(phase + 4 * 0.42 / (2 * Math.PI));
  expect(rest.toValue).toBe(deceleration.toValue);
  expect(acceleration.toValue).toBeLessThan(Number(rest.toValue));
  expect(deceleration.easing?.(0.5)).toBe(0.75);
  expect(acceleration.easing?.(0.5)).toBe(0.25);
  finishRamp();
  expect(Animated.loop).toHaveBeenCalledTimes(2);
});

test('rapid commands rebase velocity and cancelled ramp callbacks cannot restart an old direction', async () => {
  const screen = renderHook<RotorStyle, { velocity: number }>(({ velocity }) => useCeilingFanMotion(velocity, true), { initialProps: { velocity: 8 } });
  await settleMotion();
  const oldCompletion = transitionStart.mock.calls.at(-1)![0];
  time = 200; phase = 0.42;
  screen.rerender({ velocity: 6 });
  const config = jest.mocked(Animated.timing).mock.calls.at(-1)![1];
  expect(config.duration).toBe(360);
  expect(config.toValue).toBeCloseTo(0.42 + (3.2 + 6) / 2 * 0.36 / (2 * Math.PI));
  act(() => oldCompletion({ finished: true }));
  expect(Animated.loop).not.toHaveBeenCalled();
  finishRamp(); expect(Animated.loop).toHaveBeenCalledTimes(1);
});

test('power off coasts once and finishes without allocating another steady loop', async () => {
  const screen = renderHook<RotorStyle, { velocity: number }>(({ velocity }) => useCeilingFanMotion(velocity, true), { initialProps: { velocity: 8 } });
  await settleMotion(); finishRamp();
  screen.rerender({ velocity: 0 });
  expect(jest.mocked(Animated.timing).mock.calls.at(-1)![1].duration).toBe(420);
  finishRamp();
  expect(Animated.loop).toHaveBeenCalledTimes(1);
  screen.rerender({ velocity: Number.NaN });
  expect(Animated.loop).toHaveBeenCalledTimes(1);
});

test('inactivity and live reduced motion cancel ramps immediately and resume from rest', async () => {
  const screen = renderHook(() => useCeilingFanMotion(8, true));
  await settleMotion(); time = 200;
  act(() => onAppChange('inactive'));
  expect(transitionStop).toHaveBeenCalledTimes(1);
  act(() => onAppChange('active'));
  expect(jest.mocked(Animated.timing).mock.calls.at(-1)![1].easing?.(0.5)).toBe(0.25);
  act(() => onMotionChange(true));
  expect(transitionStop).toHaveBeenCalledTimes(2);
  const calls = transitionStart.mock.calls.length;
  act(() => onAppChange('background'));
  expect(transitionStart).toHaveBeenCalledTimes(calls);
  screen.unmount();
  expect(removeAppListener).toHaveBeenCalledTimes(1);
  expect(removeMotionListener).toHaveBeenCalledTimes(1);
});

test('a retained route cancels momentum on blur without waiting for coast-down', async () => {
  let focused = true;
  const listeners = new Map<string, () => void>();
  const navigation = { isFocused: () => focused, addListener: (event: string, listener: () => void) => {
    listeners.set(event, listener); return jest.fn();
  } } as unknown as NonNullable<React.ContextType<typeof NavigationContext>>;
  /** Supply the same focus lifecycle used by the mounted device console. */
  function Wrapper({ children }: React.PropsWithChildren) {
    return <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>;
  }
  const screen = renderHook(() => useCeilingFanMotion(8, true), { wrapper: Wrapper });
  await settleMotion();
  act(() => { focused = false; listeners.get('blur')?.(); });
  expect(transitionStop).toHaveBeenCalledTimes(1);
  act(() => { focused = true; listeners.get('focus')?.(); });
  expect(transitionStart).toHaveBeenCalledTimes(2);
  screen.unmount();
});

test('late native stop callbacks cannot start a covered or removed console', async () => {
  const pending: Array<(value: number) => void> = [];
  jest.mocked(Animated.Value.prototype.stopAnimation).mockImplementation((callback) => { if (callback) pending.push(callback); });
  const screen = renderHook<RotorStyle, { allowed: boolean }>(({ allowed }) => useCeilingFanMotion(8, allowed), { initialProps: { allowed: true } });
  await settleMotion(); screen.rerender({ allowed: false });
  act(() => pending.forEach((callback) => callback(0.75)));
  expect(Animated.sequence).not.toHaveBeenCalled();
  screen.unmount();
});
