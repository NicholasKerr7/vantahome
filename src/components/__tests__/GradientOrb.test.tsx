import React from "react";
import { AccessibilityInfo, AppState, type AppStateStatus, StyleSheet } from "react-native";
import { act, cleanup, fireEvent, render } from "@testing-library/react-native";
import { cancelAnimation, ReduceMotion, withRepeat, withTiming } from "react-native-reanimated";
import GradientOrb from "../GradientOrb";

jest.mock("@expo/vector-icons/Ionicons", () => require("react-native").View);
jest.mock("../../theme/layout", () => ({
  useResponsive: () => ({ width: 390, isTablet: false, isLandscape: false, scale: 1 }),
}));
jest.mock("react-native-reanimated", () => {
  const mock = jest.requireActual("react-native-reanimated/mock");
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    ...mock,
    // Match the production shared value's stable identity across renders.
    useSharedValue: (value: number) => React.useRef({ value }).current,
    withTiming: jest.fn((value: number) => value),
    withRepeat: jest.fn((value: number) => value),
    cancelAnimation: jest.fn(),
  };
});

const climate = { outdoor: { tempC: 28, label: "Outside" }, indoor: { tempC: 23, label: "Inside" } };
let onAppChange: (state: AppStateStatus) => void;
let onMotionChange: (enabled: boolean) => void;
let removeAppListener: jest.Mock;
let removeMotionListener: jest.Mock;

/** Flush the asynchronous preference read without advancing decorative timers. */
async function settleMotion(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
  act(() => jest.advanceTimersByTime(0));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  AppState.currentState = "active";
  removeAppListener = jest.fn();
  removeMotionListener = jest.fn();
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
    onAppChange = listener;
    return { remove: removeAppListener };
  });
  jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((_event, listener) => {
    onMotionChange = listener as unknown as (enabled: boolean) => void;
    // The hook uses only the removable-subscription contract, not emitter internals.
    return { remove: removeMotionListener } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>;
  });
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("stops pulse and prompt rotation on route blur, then resumes on focus", async () => {
  const onVoicePress = jest.fn();
  const screen = render(<GradientOrb {...climate} active onVoicePress={onVoicePress} />);
  await settleMotion();
  expect(withRepeat).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(5200));
  expect(screen.getByText("Say a command")).toBeTruthy();
  const cancellations = jest.mocked(cancelAnimation).mock.calls.length;
  screen.rerender(<GradientOrb {...climate} active={false} onVoicePress={onVoicePress} />);
  expect(jest.mocked(cancelAnimation).mock.calls.length).toBeGreaterThan(cancellations);
  expect(screen.queryByText("Say a command")).toBeNull();
  expect(jest.getTimerCount()).toBe(0);
  act(() => jest.advanceTimersByTime(15_600));
  expect(withRepeat).toHaveBeenCalledTimes(1);
  screen.rerender(<GradientOrb {...climate} active onVoicePress={onVoicePress} />);
  expect(withRepeat).toHaveBeenCalledTimes(2);
  act(() => jest.advanceTimersByTime(5200));
  expect(screen.getByText("Say a command")).toBeTruthy();
});

test("stops native work while inactive or backgrounded and cleans up on unmount", async () => {
  const screen = render(<GradientOrb {...climate} onVoicePress={jest.fn()} />);
  await settleMotion();
  act(() => onAppChange("inactive"));
  expect(jest.getTimerCount()).toBe(0);
  act(() => onAppChange("background"));
  expect(withRepeat).toHaveBeenCalledTimes(1);
  act(() => onAppChange("active"));
  expect(withRepeat).toHaveBeenCalledTimes(2);
  const cancellations = jest.mocked(cancelAnimation).mock.calls.length;
  screen.unmount();
  expect(jest.mocked(cancelAnimation).mock.calls.length).toBeGreaterThan(cancellations);
  expect(jest.getTimerCount()).toBe(0);
  expect(removeAppListener).toHaveBeenCalledTimes(1);
  expect(removeMotionListener).toHaveBeenCalledTimes(1);
});

test("obeys live reduced-motion changes while preserving active voice feedback and controls", async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
  const onVoicePress = jest.fn();
  const screen = render(<GradientOrb {...climate} voiceActive onVoicePress={onVoicePress} />);
  await settleMotion();
  expect(withRepeat).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
  expect(screen.getByText("Listening...")).toBeTruthy();
  fireEvent.press(screen.getByRole("button"));
  expect(onVoicePress).toHaveBeenCalledTimes(1);
  screen.rerender(<GradientOrb {...climate} onVoicePress={onVoicePress} />);
  expect(screen.getByText("Outside")).toBeTruthy();
  act(() => onMotionChange(false));
  expect(withRepeat).toHaveBeenCalledTimes(1);
  expect(withRepeat).toHaveBeenLastCalledWith(1, -1, true, undefined, ReduceMotion.Never);
  expect(withTiming).toHaveBeenLastCalledWith(1, expect.objectContaining({ reduceMotion: ReduceMotion.Never }));
  expect(jest.getTimerCount()).toBe(1);
  act(() => onMotionChange(true));
  expect(jest.getTimerCount()).toBe(0);
});

test("a stale initial preference read cannot override a newer reduced-motion event", async () => {
  let finishInitialRead: (enabled: boolean) => void = () => undefined;
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockReturnValue(new Promise((resolve) => { finishInitialRead = resolve; }));
  const screen = render(<GradientOrb {...climate} onVoicePress={jest.fn()} />);
  act(() => onMotionChange(true));
  await act(async () => { finishInitialRead(false); });
  act(() => jest.advanceTimersByTime(0));
  expect(withRepeat).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
  screen.unmount();
});

test("keeps decoration still when the system preference is unavailable", async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockRejectedValue(new Error("Unavailable"));
  render(<GradientOrb {...climate} onVoicePress={jest.fn()} />);
  await settleMotion();
  expect(withRepeat).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test("keeps border and shadow painting separate from the per-frame animated surface", async () => {
  const screen = render(<GradientOrb {...climate} />);
  await settleMotion();
  const motion = StyleSheet.flatten(screen.getByTestId("gradient-orb-motion").props.style);
  const surface = StyleSheet.flatten(screen.getByTestId("gradient-orb-surface").props.style);
  expect(motion.borderWidth).toBeUndefined();
  expect(motion.shadowRadius).toBeUndefined();
  expect(surface.borderWidth).toBe(2);
  expect(surface.shadowRadius).toBe(24);
  expect(surface.transform).toBeUndefined();
});
