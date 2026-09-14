import React from "react";
import { AppState } from "react-native";
import { act, render } from "@testing-library/react-native";
import App from "../../App";
import { hydrateHomeAccount, useHomeStore } from "../store/useHomeStore";
import { startDeviceRealtime } from "../services/realtime";
import { startFlowRuntime } from "../services/flowRuntime";
import { deviceClient } from "../services/deviceClient";

const mockStopRealtime = jest.fn();
const mockStopFlows = jest.fn();
jest.mock("./AppNavigator", () => () => null);
jest.mock("../services/supabaseClient", () => ({ supabase: {} }));
jest.mock("../services/realtime", () => ({
  startDeviceRealtime: jest.fn(() => mockStopRealtime),
}));
jest.mock("../services/flowRuntime", () => ({
  startFlowRuntime: jest.fn(() => mockStopFlows),
}));
jest.mock("../services/deviceClient", () => ({
  deviceClient: { resetSession: jest.fn() },
}));
jest.mock("../services/ambient", () => ({
  startAmbientData: jest.fn(() => jest.fn()),
}));
jest.mock("../services/notifications", () => ({
  ensureNotificationsReady: jest.fn(async () => {}),
}));
jest.mock("../services/orientation", () => ({
  applyDeviceOrientationPolicy: jest.fn(async () => {}),
}));
jest.mock("../services/membership", () => ({
  applyMembershipSnapshot: jest.fn(),
  syncMembershipFromSupabase: jest.fn(async () => null),
}));
jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  wrap: (component: unknown) => component,
}));

let changeState: (state: "active" | "inactive" | "background") => void;
beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  await hydrateHomeAccount("alice");
  useHomeStore.setState({
    activeHomeId: "home",
    accountHomeId: "home",
    membershipReady: true,
    activeMemberId: "alice",
    household: [{ id: "alice", role: "Owner", name: "Alice", status: "away" }],
  });
  AppState.currentState = "active";
  jest.spyOn(AppState, "addEventListener").mockImplementation((_, callback) => {
    changeState = callback;
    return { remove: jest.fn() };
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test("presence changes do not restart automation or realtime runtimes", () => {
  const screen = render(<App />);
  expect(startFlowRuntime).toHaveBeenCalledTimes(1);
  act(() => {
    useHomeStore.getState().setHouseholdPresence("alice", "home");
  });
  expect(startFlowRuntime).toHaveBeenCalledTimes(1);
  expect(startDeviceRealtime).toHaveBeenCalledTimes(1);
  expect(mockStopFlows).not.toHaveBeenCalled();
  screen.unmount();
});

test("a biometric inactive transition preserves the pending command; background stops it", () => {
  const screen = render(<App />);
  act(() => {
    changeState("inactive");
    changeState("active");
  });
  expect(mockStopRealtime).not.toHaveBeenCalled();
  expect(useHomeStore.getState().membershipReady).toBe(true);
  act(() => {
    changeState("background");
  });
  expect(mockStopRealtime).toHaveBeenCalledTimes(1);
  expect(mockStopFlows).toHaveBeenCalledTimes(1);
  expect(useHomeStore.getState().membershipReady).toBe(false);
  expect(deviceClient.resetSession).toHaveBeenCalledTimes(2);
  screen.unmount();
});

test("a new deny policy restarts transports synchronously before more work can run", () => {
  const screen = render(<App />);
  act(() => {
    useHomeStore
      .getState()
      .setMemberPermissionOverridesFromRemote([
        { memberId: "alice", permission: "camera.live", allowed: false },
      ]);
    expect(mockStopRealtime).toHaveBeenCalledTimes(1);
    expect(mockStopFlows).toHaveBeenCalledTimes(1);
  });
  expect(startDeviceRealtime).toHaveBeenCalledTimes(2);
  screen.unmount();
});
