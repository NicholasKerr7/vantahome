import React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { act, cleanup, fireEvent, render } from "@testing-library/react-native";
import RendererLab from "./RendererLab";
import type { LabSurfaceProps } from "./protocol";

let mockWebProps: LabSurfaceProps;
let mockNativeProps: LabSurfaceProps;
let mockMotionAllowed = true;
let mockNativeThrows = false;

jest.mock("../../components/useDecorativeMotion", () => ({ useDecorativeMotion: () => mockMotionAllowed }));
jest.mock("@react-native-community/slider", () => require("react-native").View);
jest.mock("./WebLabSurface", () => ({ __esModule: true, default: (props: LabSurfaceProps) => {
  mockWebProps = props;
  const Text = require("react-native").Text;
  return <Text testID="web-lab">Web scene</Text>;
} }));
jest.mock("./NativeLabSurface", () => ({ __esModule: true, default: (props: LabSurfaceProps) => {
  mockNativeProps = props;
  if (mockNativeThrows) throw new Error("Native SDK unavailable");
  const Text = require("react-native").Text;
  return <Text testID="native-lab">Native scene</Text>;
} }));

let onAppState: (state: AppStateStatus) => void;
beforeEach(() => {
  jest.useFakeTimers();
  AppState.currentState = "active";
  mockMotionAllowed = true;
  mockNativeThrows = false;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
    onAppState = listener;
    return { remove: jest.fn() };
  });
});
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("starts with Three.js and keeps shared device settings across renderer switches", () => {
  const screen = render(<RendererLab active />);
  expect(screen.queryByTestId("native-lab")).toBeNull();
  act(() => mockWebProps.onEvent({ type: "ready" }));
  fireEvent.press(screen.getByLabelText("Lights"));
  fireEvent.press(screen.getByLabelText("Blinds"));
  expect(mockWebProps.settings.lights).toBe(false);
  expect(mockWebProps.settings.blinds).toBe(100);
  fireEvent.press(screen.getByLabelText("Use Filament renderer"));
  expect(screen.queryByTestId("web-lab")).toBeNull();
  expect(screen.getByTestId("native-lab")).toBeTruthy();
  expect(mockNativeProps.settings.lights).toBe(false);
  expect(mockNativeProps.settings.blinds).toBe(100);
  fireEvent.press(screen.getByLabelText("Use Three.js renderer"));
  expect(mockWebProps.settings.blinds).toBe(100);
});

test("ignores stale ready and metrics events even after switching back to the same renderer", () => {
  const screen = render(<RendererLab active />);
  const oldWebEvent = mockWebProps.onEvent;
  fireEvent.press(screen.getByLabelText("Use Filament renderer"));
  fireEvent.press(screen.getByLabelText("Use Three.js renderer"));
  act(() => {
    oldWebEvent({ type: "ready" });
    oldWebEvent({ type: "metrics", frames: 500, p50: 20, p95: 80, slowFrames: 10 });
  });
  expect(screen.getByText("Preparing your home")).toBeTruthy();
  expect(screen.queryByText("80.0ms")).toBeNull();
  act(() => mockWebProps.onEvent({ type: "ready" }));
  expect(screen.queryByText("Preparing your home")).toBeNull();
});

test("unmounts inactive graphics and retains controls through background and resume", () => {
  const screen = render(<RendererLab active />);
  fireEvent.press(screen.getByLabelText("Lights"));
  const oldWebEvent = mockWebProps.onEvent;
  act(() => onAppState("background"));
  expect(screen.queryByTestId("web-lab")).toBeNull();
  act(() => oldWebEvent({ type: "error", message: "Stale failure" }));
  expect(screen.queryByText("Stale failure")).toBeNull();
  act(() => onAppState("active"));
  expect(screen.getByTestId("web-lab")).toBeTruthy();
  expect(mockWebProps.settings.lights).toBe(false);
  screen.rerender(<RendererLab active={false} />);
  expect(screen.queryByTestId("web-lab")).toBeNull();
});

test("times out an unready renderer and retries with fresh event ownership", () => {
  const screen = render(<RendererLab active />);
  const timedOutEvent = mockWebProps.onEvent;
  act(() => jest.advanceTimersByTime(90_000));
  expect(screen.getByText("Let’s reload the scene")).toBeTruthy();
  expect(screen.queryByTestId("web-lab")).toBeNull();
  act(() => timedOutEvent({ type: "ready" }));
  expect(screen.getByText("Let’s reload the scene")).toBeTruthy();
  fireEvent.press(screen.getByText("Retry"));
  expect(screen.getByTestId("web-lab")).toBeTruthy();
  act(() => mockWebProps.onEvent({ type: "ready" }));
  act(() => jest.advanceTimersByTime(90_000));
  expect(screen.queryByText("Let’s reload the scene")).toBeNull();
});

test("recovers from native initialization errors without losing the Three.js fallback", () => {
  const expectedError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  const screen = render(<RendererLab active />);
  mockNativeThrows = true;
  fireEvent.press(screen.getByLabelText("Use Filament renderer"));
  expect(screen.getByText("Let’s reload the scene")).toBeTruthy();
  fireEvent.press(screen.getByText("Use Three.js"));
  expect(screen.getByTestId("web-lab")).toBeTruthy();
  expect(expectedError).toHaveBeenCalled();
});

test("respects reduced motion while keeping device controls and model selection available", () => {
  mockMotionAllowed = false;
  const screen = render(<RendererLab active />);
  expect(mockWebProps.settings.motion).toBe(false);
  act(() => mockWebProps.onEvent({ type: "select", device: "lights" }));
  expect(screen.getByText("Bedroom lighting")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Lights"));
  expect(mockWebProps.settings.lights).toBe(false);
  fireEvent.press(screen.getByLabelText("Blinds full controls"));
  expect(screen.getByLabelText("Blinds opening")).toBeTruthy();
});

test("offers only implemented property controls and bounds the gate slider", () => {
  const screen = render(<RendererLab active />);
  fireEvent.press(screen.getByLabelText("Property"));
  expect(screen.queryByLabelText("Lights")).toBeNull();
  expect(screen.getByLabelText("Gate")).toBeTruthy();
  fireEvent(screen.getByLabelText("Gate opening"), "valueChange", 135);
  expect(mockWebProps.settings.gate).toBe(100);
  fireEvent(screen.getByLabelText("Gate opening"), "valueChange", -20);
  expect(mockWebProps.settings.gate).toBe(0);
});

test("previews each weather mode without scrolling and preserves weather across engines", () => {
  const screen = render(<RendererLab active />);
  fireEvent.press(screen.getByLabelText("Property"));
  fireEvent.press(screen.getByLabelText("Weather: Clear. Preview. Change weather"));
  fireEvent.press(screen.getByLabelText("Preview light rain"));
  expect(mockWebProps.settings).toMatchObject({ weather: "light", windSpeed: 8 });
  fireEvent.press(screen.getByLabelText("Weather: Light rain. Preview. Change weather"));
  fireEvent.press(screen.getByLabelText("Preview heavy rain"));
  expect(mockWebProps.settings.weather).toBe("heavy");
  fireEvent.press(screen.getByLabelText("Weather: Heavy rain. Preview. Change weather"));
  fireEvent.press(screen.getByLabelText("Preview thunderstorm"));
  expect(mockWebProps.settings).toMatchObject({ weather: "storm", windSpeed: 48 });
  fireEvent.press(screen.getByLabelText("Use Filament renderer"));
  expect(mockNativeProps.settings).toMatchObject({ weather: "storm", windSpeed: 48 });
  fireEvent.press(screen.getByLabelText("Turn scene motion off"));
  expect(mockNativeProps.settings).toMatchObject({ weather: "storm", motion: false });
  fireEvent.press(screen.getByLabelText("Weather: Thunderstorm. Preview. Change weather"));
  fireEvent.press(screen.getByLabelText("Preview clear"));
  expect(mockNativeProps.settings).toMatchObject({ weather: "clear", windSpeed: 0 });
});
