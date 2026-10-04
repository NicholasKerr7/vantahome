import React from "react";
import { AppState } from "react-native";
import { act, render } from "@testing-library/react-native";
import App from "../../App";
import { hydrateHomeAccount, selectVisibleRooms, useHomeStore } from "../store/useHomeStore";
import { startDeviceRealtime } from "../services/realtime";
import { startFlowRuntime } from "../services/flowRuntime";
import { deviceClient } from "../services/deviceClient";
import { syncMembershipFromSupabase, type MembershipSyncResult } from "../services/membership";

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
  ...jest.requireActual("../services/membership"),
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
  jest.mocked(syncMembershipFromSupabase).mockReset().mockResolvedValue(null);
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

test.each(['sessionEpoch', 'activeMemberId'] as const)('a new %s replaces scoped runtime subscriptions', (field) => {
  const screen = render(<App />);
  act(() => {
    if (field === 'sessionEpoch') useHomeStore.setState({ sessionEpoch: useHomeStore.getState().sessionEpoch + 1 });
    else useHomeStore.setState({ activeMemberId: 'another-member', household: [...useHomeStore.getState().household, { id: 'another-member', name: 'Another member', role: 'Member', status: 'home' }] });
  });
  expect(mockStopRealtime).toHaveBeenCalledTimes(1);
  expect(startDeviceRealtime).toHaveBeenCalledTimes(2);
  screen.unmount();
});

/** Build an authorized response that exercises real snapshot installation and selectors. */
function ownerSnapshot(): MembershipSyncResult {
  return {
    homeId: "home",
    activeMemberId: "alice",
    household: [{ id: "alice", name: "Alice", role: "Owner", status: "home" }],
    rooms: [{ id: "living", name: "Living room" }],
    devices: [],
    roomMembers: [],
    permissionOverrides: [],
  };
}

/** Hold a membership response so lifecycle changes can happen before it arrives. */
function pendingMembership() {
  let resolve!: (value: MembershipSyncResult | null) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<MembershipSyncResult | null>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  jest.mocked(syncMembershipFromSupabase).mockReturnValueOnce(promise);
  return { resolve, reject };
}

test("a failed refresh stops home runtimes; a later verified refresh restores them", async () => {
  jest.mocked(syncMembershipFromSupabase)
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce(ownerSnapshot());
  const screen = render(<App />);
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(useHomeStore.getState().membershipReady).toBe(false);
  expect(selectVisibleRooms(useHomeStore.getState())).toEqual([]);
  expect(mockStopRealtime).toHaveBeenCalledTimes(1);
  expect(mockStopFlows).toHaveBeenCalledTimes(1);

  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(useHomeStore.getState().membershipReady).toBe(true);
  expect(selectVisibleRooms(useHomeStore.getState()).map((room) => room.id)).toEqual(["living"]);
  expect(startDeviceRealtime).toHaveBeenCalledTimes(2);
  expect(startFlowRuntime).toHaveBeenCalledTimes(2);
  screen.unmount();
});

test("resuming keeps access closed until fresh membership verification completes", async () => {
  const pending = pendingMembership();
  const screen = render(<App />);
  await act(async () => {
    changeState("background");
    jest.advanceTimersByTime(60_000);
  });
  expect(syncMembershipFromSupabase).not.toHaveBeenCalled();
  act(() => { changeState("active"); });
  expect(syncMembershipFromSupabase).toHaveBeenCalledTimes(1);
  expect(useHomeStore.getState().membershipReady).toBe(false);
  expect(startDeviceRealtime).toHaveBeenCalledTimes(1);

  await act(async () => { pending.resolve(ownerSnapshot()); });
  expect(useHomeStore.getState().membershipReady).toBe(true);
  expect(startDeviceRealtime).toHaveBeenCalledTimes(2);
  screen.unmount();
});

test("a response arriving after backgrounding cannot reopen the home", async () => {
  const pending = pendingMembership();
  const screen = render(<App />);
  await act(async () => { jest.advanceTimersByTime(60_000); });
  act(() => { changeState("background"); });
  await act(async () => { pending.resolve(ownerSnapshot()); });
  expect(useHomeStore.getState().membershipReady).toBe(false);
  expect(startDeviceRealtime).toHaveBeenCalledTimes(1);
  screen.unmount();
});

test.each(["success", "failure"] as const)("a late %s from an earlier login cannot change the new session", async (outcome) => {
  const pending = pendingMembership();
  const screen = render(<App />);
  await act(async () => { jest.advanceTimersByTime(60_000); });
  act(() => {
    useHomeStore.setState({
      sessionEpoch: useHomeStore.getState().sessionEpoch + 1,
      rooms: [{ id: "new-room", name: "New session room" }],
    });
  });
  await act(async () => {
    if (outcome === "success") pending.resolve(ownerSnapshot());
    else pending.reject(new Error("Old request failed"));
  });
  expect(useHomeStore.getState().membershipReady).toBe(true);
  expect(selectVisibleRooms(useHomeStore.getState()).map((room) => room.id)).toEqual(["new-room"]);
  screen.unmount();
});

test("guest expiry stops transports and flows without waiting for the next cloud refresh", () => {
  useHomeStore.setState({
    household: [{ id: "alice", name: "Guest", role: "Guest", status: "home", accessExpiresAt: new Date(Date.now() + 1000).toISOString() }],
    rooms: [{ id: "living", name: "Living room" }],
    roomMembers: [{ memberId: "alice", roomIds: ["living"] }],
  });
  const screen = render(<App />);
  expect(selectVisibleRooms(useHomeStore.getState())).toHaveLength(1);
  act(() => { jest.advanceTimersByTime(1001); });
  expect(selectVisibleRooms(useHomeStore.getState())).toEqual([]);
  expect(mockStopRealtime).toHaveBeenCalledTimes(1);
  expect(mockStopFlows).toHaveBeenCalledTimes(1);
  expect(syncMembershipFromSupabase).not.toHaveBeenCalled();
  screen.unmount();
});
