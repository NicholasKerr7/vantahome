import React from "react";
import { Alert, AppState, type AppStateStatus } from "react-native";
import { act, cleanup, fireEvent, render } from "@testing-library/react-native";
import RendererLab from "./RendererLab";
import type { LabSurfaceProps } from "./protocol";
import { SimulationControlClient } from '../three-d-home/simulationControlClient';
import { createDefaultSimulationSnapshot, mergeSimulationChanges, parseSimulationRequest } from '../../../packages/home-scene/src/simulationBridgeProtocol';

const mockDispatch = jest.fn();
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ dispatch: mockDispatch }) }));

let mockWebProps: LabSurfaceProps;
let mockNativeProps: LabSurfaceProps;
let mockMotionAllowed = true;
let mockNativeThrows = false;
let mockControls: SimulationControlClient;
let mockDimensions = { width: 402, height: 874, scale: 1, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => mockDimensions }));

jest.mock('../three-d-home/useSimulationControls', () => ({ useSimulationControls: () => {
  const { useSyncExternalStore } = require('react');
  const snapshot = useSyncExternalStore(mockControls.subscribe, mockControls.getSnapshot, mockControls.getSnapshot);
  return { ...snapshot, client: mockControls, reconnect: jest.fn() };
} }));

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
  mockDispatch.mockClear();
  AppState.currentState = "active";
  mockMotionAllowed = true;
  mockNativeThrows = false;
  mockDimensions = { width: 402, height: 874, scale: 1, fontScale: 1 };
  mockControls = new SimulationControlClient((deliver) => {
    let state = createDefaultSimulationSnapshot();
    state.deviceStates['master-blinds'] = { on: false, level: 0 };
    state.deviceStates['entry-gate'] = { on: false, level: 0 };
    for (const id of ['master-light', 'master-bedside-left', 'master-bedside-right']) state.deviceStates[id] = { on: true, level: 65 };
    return { dispose: jest.fn(), handleMessage: (input) => {
      const message = parseSimulationRequest(input);
      if (!message) return false;
      if (message.type === 'patch') state = mergeSimulationChanges(state, message.changes);
      deliver({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state,
        ...(message.type === 'patch' ? { acknowledgedRequestId: message.requestId } : {}) });
      return true;
    } };
  });
  mockControls.connect();
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
    onAppState = listener;
    return { remove: jest.fn() };
  });
});
afterEach(() => {
  cleanup();
  mockControls.dispose();
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
  fireEvent.press(screen.getByLabelText('Lights'));
  expect(mockNativeProps.settings.lightStates?.ceiling?.on).toBe(true);
  expect(mockNativeProps.settings.lightStates?.left?.on).toBe(true);
  expect(mockNativeProps.settings.lightStates?.right?.on).toBe(true);
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
  expect(screen.getByLabelText("Close device controls")).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Routines' })).toBeTruthy();
});

/** Follow visible pagination so integration checks work before or after native layout measurement. */
function advanceControlPagesUntil(screen: ReturnType<typeof render>, isVisible: () => boolean): void {
  for (let page = 0; page < 30; page++) {
    if (isVisible()) return;
    const next = screen.getByLabelText('Next controls page');
    expect(next.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(next);
  }
  expect(isVisible()).toBe(true);
}

test('full controls change one fixture and both engines receive its brightness and color', () => {
  const screen = render(<RendererLab active />);
  const left = mockWebProps.settings.lightStates?.left;
  fireEvent.press(screen.getByLabelText('Lights full controls'));
  fireEvent(screen.getByLabelText('Brightness'), 'valueChange', 25);
  expect(mockWebProps.settings.lightStates?.ceiling?.brightness).toBe(24);
  expect(mockWebProps.settings.lightStates?.left).toEqual(left);
  advanceControlPagesUntil(screen, () => Boolean(screen.queryByLabelText(/Color: .*Choose option/)));
  fireEvent.press(screen.getByLabelText(/Color: .*Choose option/));
  advanceControlPagesUntil(screen, () => Boolean(screen.queryByRole('radio', { name: /Ice/ })));
  fireEvent.press(screen.getByRole('radio', { name: /Ice/ }));
  expect(mockWebProps.settings.lightStates?.ceiling?.colorHex).toBe('#A0E9FF');
  expect(mockWebProps.settings.lightStates?.left).toEqual(left);
  fireEvent.press(screen.getByLabelText('Close device controls'));
  fireEvent.press(screen.getByLabelText('Use Filament renderer'));
  expect(mockNativeProps.settings.lightStates).toEqual(mockWebProps.settings.lightStates);
});

test('native controls keep device preferences while opening the shared routine collection', () => {
  const screen = render(<RendererLab active />);
  fireEvent.press(screen.getByLabelText('Property'));
  fireEvent.press(screen.getByLabelText('Gate full controls'));
  fireEvent.press(screen.getByRole('tab', { name: 'Modes' }));
  for (let page = 0; page < 8 && !screen.queryByLabelText('Auto-open preference'); page++) fireEvent.press(screen.getByLabelText('Next controls page'));
  fireEvent(screen.getByLabelText('Auto-open preference'), 'valueChange', true);
  fireEvent.press(screen.getByRole('tab', { name: 'Routines' }));
  expect(screen.queryByLabelText('Save schedule preference')).toBeNull();
  fireEvent.press(screen.getByLabelText('View device routines'));
  expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ name: 'Main', params: expect.objectContaining({ screen: 'Automations', params: { deviceId: 'd26' } }) }) }));
  expect(screen.queryByLabelText('Close device controls')).toBeNull();
  fireEvent.press(screen.getByLabelText('Gate'));
  expect(mockControls.getSnapshot().state.deviceStates['entry-gate']).toMatchObject({ on: true, level: 100, settings: { autoOpenEnabled: true } });
});

test("offers only implemented property controls and bounds the gate slider", () => {
  const screen = render(<RendererLab active />);
  fireEvent.press(screen.getByLabelText("Property"));
  expect(screen.queryByLabelText("Lights")).toBeNull();
  expect(screen.getByLabelText("Gate")).toBeTruthy();
  fireEvent(screen.getByLabelText("Gate opening"), "valueChange", 135);
  expect(mockWebProps.settings.gate).toBe(100);
  fireEvent(screen.getByLabelText("Gate opening"), "valueChange", -20);
  expect(mockControls.getSnapshot().state.deviceStates['entry-gate'].settings).toMatchObject({ gatePhase: 'closing', gateCloseTargetPercent: 0 });
  act(() => { for (let second = 0; second < 4; second++) mockControls.advanceSafety(1); });
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

test('the shared routine entry stays available after rotation and unlinked devices explain setup', () => {
  mockDimensions = { width: 320, height: 562, scale: 1, fontScale: 1 };
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const screen = render(<RendererLab active />);
  fireEvent.press(screen.getByLabelText('Blinds full controls'));
  fireEvent.press(screen.getByRole('tab', { name: 'Routines' }));
  expect(screen.getByText('1 / 1')).toBeTruthy();
  mockDimensions = { width: 1194, height: 834, scale: 1, fontScale: 1 };
  screen.rerender(<RendererLab active />);
  fireEvent.press(screen.getByLabelText('View device routines'));
  expect(alert).toHaveBeenCalledWith('Device linking required', expect.stringContaining('not linked'));
  expect(mockDispatch).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Close device controls')).toBeTruthy();
  expect(mockControls.getSnapshot().state.deviceStates['master-blinds'].settings?.scheduleEnabled).not.toBe(true);
});
