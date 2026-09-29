import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import Pressable from "../../../components/Pressable";
import CameraDetailSection from "../../../screens/device-detail/devices/CameraDetailSection";
import type { Device, HouseholdMember } from "../../../store/useHomeStore";

let mockAccess = "granted";
const mockState = {
  member: { id: "owner", role: "Owner" },
  memberPermissionOverrides: [],
};
jest.mock("../../../store/useHomeStore", () => ({
  useHomeStore: (selector: (state: typeof mockState) => unknown) =>
    selector(mockState),
  selectActiveMember: (state: typeof mockState) => state.member,
}));
jest.mock("../../../security/useProtectedAccess", () => ({
  useProtectedAccess: () => ({ state: mockAccess, retry: jest.fn() }),
}));
jest.mock("../../../theme/layout", () => ({
  useResponsive: () => ({ isTablet: false, isLandscape: false }),
}));
jest.mock("@expo/vector-icons/Ionicons", () => "Icon");
jest.mock("../../../components/LiveVideoPlayer", () => {
  const { Text } = require("react-native");
  return function LivePlayer() {
    return <Text>Private live feed</Text>;
  };
});
jest.mock("../../../components/CameraThumbnail", () => {
  const { Text, View } = require("react-native");
  return function Thumbnail({
    title,
    subtitle,
  }: {
    title: string;
    subtitle: string;
  }) {
    return (
      <View>
        <Text>{title}</Text>
        <Text>{subtitle}</Text>
      </View>
    );
  };
});

const camera: Device = {
  id: "entry-camera",
  name: "Entry camera",
  roomId: "entry",
  kind: "camera",
  isOn: true,
  armed: false,
  recording: false,
  motionSensitivity: 6,
};
const household: HouseholdMember[] = [
  { id: "owner", name: "Jamie Taylor", role: "Owner", status: "home" },
];
const gate: Device = {
  id: "entry-gate",
  name: "Smart entrance gate",
  kind: "gate",
  roomId: "entry",
  isOn: false,
  openPercent: 0,
  autoOpenEnabled: false,
};

/** Mount complete camera controls with observable callbacks and no device transport. */
function setup(device: Device = camera) {
  const actions = {
    onPatch: jest.fn(),
    onKnownFace: jest.fn(),
    onUnknownFace: jest.fn(),
    onPresence: jest.fn(),
    onOpenGate: jest.fn(),
    onCloseGate: jest.fn(),
    onToggleGateAutoOpen: jest.fn(),
    onExpand: jest.fn(),
  };
  return {
    ...render(
      <CameraDetailSection
        device={device}
        household={household}
        gate={gate}
        events={[]}
        {...actions}
      />,
    ),
    actions,
  };
}

beforeEach(() => {
  mockAccess = "granted";
  mockState.member.role = "Owner";
});

test("keeps camera power, arming, recording, and viewer navigation independent", () => {
  const screen = setup();
  fireEvent.press(screen.getByLabelText("Camera power"));
  fireEvent.press(screen.getByLabelText("Armed"));
  fireEvent.press(screen.getByLabelText("Recording"));
  expect(screen.actions.onPatch.mock.calls).toEqual([
    [{ isOn: false }],
    [{ armed: true }],
    [{ recording: true }],
  ]);
  fireEvent.press(screen.getByLabelText("Expand camera view"));
  expect(screen.actions.onExpand).toHaveBeenCalledTimes(1);
  expect(screen.getByText("No snapshot yet")).toBeTruthy();
  expect(screen.queryByText("Live view")).toBeNull();
});

test("retains every security, audio, and sensitivity setting", () => {
  const screen = setup();
  fireEvent.press(screen.getByLabelText("Protection"));
  for (const label of [
    "Night vision",
    "Motion alerts",
    "Microphone muted",
    "Two-way audio",
    "High motion sensitivity",
  ])
    fireEvent.press(screen.getByLabelText(label));
  expect(screen.actions.onPatch.mock.calls).toEqual([
    [{ nightVision: true }],
    [{ motionAlerts: false }],
    [{ micMuted: true }],
    [{ twoWayAudio: false }],
    [{ motionSensitivity: 9 }],
  ]);
});

test("retains recognition, household presence, and entry controls", () => {
  const screen = setup();
  fireEvent.press(screen.getByLabelText("People"));
  fireEvent.press(screen.getByLabelText("Recognize Jamie Taylor"));
  fireEvent.press(screen.getByLabelText("Mark away"));
  fireEvent.press(screen.getByLabelText("Report unknown visitor"));
  expect(screen.actions.onKnownFace).toHaveBeenCalledWith(
    "owner",
    "Jamie Taylor",
  );
  expect(screen.actions.onPresence).toHaveBeenCalledWith("owner", "away");
  expect(screen.actions.onUnknownFace).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByLabelText("Entry"));
  for (const label of ["Open gate", "Close gate", "Auto-open for known faces"])
    fireEvent.press(screen.getByLabelText(label));
  expect(screen.actions.onOpenGate).toHaveBeenCalledTimes(1);
  expect(screen.actions.onCloseGate).toHaveBeenCalledTimes(1);
  expect(screen.actions.onToggleGateAutoOpen).toHaveBeenCalledTimes(1);
});

test("does not mount media or expose switches before authentication succeeds", () => {
  mockAccess = "denied";
  const screen = setup({
    ...camera,
    streamUrl: "https://example.com/live.m3u8",
  });
  expect(screen.getByText("Camera access locked")).toBeTruthy();
  expect(screen.queryByText("Private live feed")).toBeNull();
  expect(screen.queryByLabelText("Camera power")).toBeNull();
});

test("camera viewers without management permission cannot submit camera changes", () => {
  mockState.member.role = "Member";
  const screen = setup();
  expect(screen.getByLabelText("Camera power")).toHaveProp(
    "accessibilityState",
    expect.objectContaining({ disabled: true }),
  );
  fireEvent.press(screen.getByLabelText("Camera power"));
  expect(screen.actions.onPatch).not.toHaveBeenCalled();
});

test("exposes accurate web and native checked states for switches, sensitivity, and tabs", () => {
  const screen = setup();
  /** Inspect web props before React Native normalizes them into native accessibilityState. */
  const control = (label: string) => screen.UNSAFE_getAllByType(Pressable).find((node) => node.props.accessibilityLabel === label)!;
  for (const [label, checked] of [
    ["Camera power", true],
    ["Armed", false],
    ["Recording", false],
  ] as const) {
    expect(control(label).props["aria-checked"]).toBe(checked);
    expect(screen.getByLabelText(label)).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ checked }),
    );
  }
  fireEvent.press(screen.getByLabelText("Protection"));
  for (const [label, checked] of [
    ["Night vision", false],
    ["Motion alerts", true],
    ["Microphone muted", false],
    ["Two-way audio", true],
    ["Low motion sensitivity", false],
    ["Medium motion sensitivity", true],
    ["High motion sensitivity", false],
  ] as const) {
    expect(control(label).props["aria-checked"]).toBe(checked);
    expect(screen.getByLabelText(label)).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ checked }),
    );
  }
  expect(control("Protection").props["aria-selected"]).toBe(true);
  fireEvent.press(screen.getByLabelText("People"));
  expect(control("Household").props["aria-selected"]).toBe(true);
  expect(control("Detections").props["aria-selected"]).toBe(false);
});
