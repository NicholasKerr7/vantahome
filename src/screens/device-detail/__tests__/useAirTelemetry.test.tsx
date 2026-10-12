import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import type { Device } from "../../../store/useHomeStore";
import { AIR_READING_FRESHNESS_MS } from "../airTelemetry";
import { useAirTelemetry } from "../useAirTelemetry";

const now = 1_800_000_000_000;
const sensor: Device = { id: "air", name: "Air sensor", kind: "air", roomId: "living", isOn: true,
  airQualityIndex: 32, airLastUpdatedAt: now };

describe("air reading freshness lifecycle", () => {
  let change: (state: AppStateStatus) => void;
  const initialState = AppState.currentState;
  const remove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(now);
    AppState.currentState = "active";
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
      change = listener;
      return { remove };
    });
  });

  afterEach(() => {
    AppState.currentState = initialState;
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("ages cached readings without requiring a new device event", () => {
    const { result, unmount } = renderHook(() => useAirTelemetry(sensor, false));
    expect(result.current?.status).toBe("recent");
    act(() => { jest.advanceTimersByTime(AIR_READING_FRESHNESS_MS); });
    expect(result.current?.status).toBe("stale");
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("stops the timer in background and reevaluates cached data immediately on resume", () => {
    const { result, unmount } = renderHook(() => useAirTelemetry(sensor, false));
    act(() => { AppState.currentState = "background"; change("background"); });
    expect(jest.getTimerCount()).toBe(0);
    act(() => { jest.advanceTimersByTime(AIR_READING_FRESHNESS_MS); });
    expect(result.current?.status).toBe("recent");
    act(() => { AppState.currentState = "active"; change("active"); });
    expect(result.current?.status).toBe("stale");
    unmount();
    expect(remove).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("cleans up when a browser cannot subscribe to visibility changes", () => {
    // RN Web can return undefined although the native AppState signature requires a subscription.
    jest.mocked(AppState.addEventListener).mockReturnValueOnce(undefined as unknown as ReturnType<typeof AppState.addEventListener>);
    const { unmount } = renderHook(() => useAirTelemetry(sensor, false));
    expect(() => unmount()).not.toThrow();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("starts no freshness timer for another device kind", () => {
    const { unmount } = renderHook(() => useAirTelemetry({ ...sensor, kind: "light" }, false));
    expect(AppState.addEventListener).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    unmount();
  });
});
