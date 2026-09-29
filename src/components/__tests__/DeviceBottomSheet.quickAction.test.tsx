import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import DeviceBottomSheet from "../DeviceBottomSheet";
import type { Device } from "../../store/useHomeStore";

jest.mock("@expo/vector-icons/Ionicons", () => require("react-native").View);
jest.mock("../DeviceIcon", () => require("react-native").View);
jest.mock("../DeviceCapabilityControls", () => require("react-native").View);
jest.mock("expo-blur", () => ({ BlurView: require("react-native").View }));
jest.mock("@gorhom/bottom-sheet", () => {
  const { View, ScrollView } = require("react-native");
  return {
    BottomSheetModal: View,
    BottomSheetBackdrop: View,
    BottomSheetScrollView: ScrollView,
  };
});
jest.mock("../../theme/layout", () => ({
  useResponsive: () => ({
    contentWidth: 375,
    gutter: 16,
    isTablet: false,
    isLandscape: false,
    scale: 1,
  }),
}));

const callbacks = {
  onClose: jest.fn(),
  onOpenDetails: jest.fn(),
  onGoToAutomations: jest.fn(),
  onToggle: jest.fn(),
  onQuickSchedule: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

test.each([
  { kind: "camera", name: "Entry camera", label: "Arm" },
  { kind: "gate", name: "Front gate", label: "Open" },
  { kind: "smoke", name: "Family smoke sensor", label: "View readings" },
] as const)(
  "announces the real $kind shortcut independently from its power state",
  ({ kind, name, label }) => {
    const device: Device = {
      id: "device",
      name,
      kind,
      roomId: "room",
      isOn: true,
    };
    const screen = render(
      <DeviceBottomSheet
        {...callbacks}
        device={device}
        quickActionLabel={label}
        quickActionActive={false}
      />,
    );
    const action = screen.getByRole("button", { name: `${label}: ${name}` });
    expect(action.props.accessibilityState.selected).toBe(false);
    expect(
      screen.queryByRole("button", { name: `Turn off ${name}` }),
    ).toBeNull();
    fireEvent.press(action);
    expect(callbacks.onToggle).toHaveBeenCalledTimes(1);
    expect(callbacks.onOpenDetails).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole("button", { name: "Full controls" }));
    expect(callbacks.onOpenDetails).toHaveBeenCalledTimes(1);
  },
);

test("uses the supplied active state and defaults an overridden action to inactive", () => {
  const device: Device = {
    id: "camera",
    name: "Entry camera",
    kind: "camera",
    roomId: "room",
    isOn: false,
    armed: true,
  };
  const screen = render(
    <DeviceBottomSheet
      {...callbacks}
      device={device}
      quickActionLabel="Disarm"
      quickActionActive
    />,
  );
  expect(
    screen.getByRole("button", { name: "Disarm: Entry camera" }).props
      .accessibilityState.selected,
  ).toBe(true);
  screen.rerender(
    <DeviceBottomSheet
      {...callbacks}
      device={{ ...device, isOn: true }}
      quickActionLabel="View readings"
    />,
  );
  expect(
    screen.getByRole("button", { name: "View readings: Entry camera" }).props
      .accessibilityState.selected,
  ).toBe(false);
});

test("retains ordinary power behavior when the caller supplies no shortcut override", () => {
  const device: Device = {
    id: "light",
    name: "Bedside light",
    kind: "light",
    roomId: "room",
    isOn: true,
  };
  const screen = render(<DeviceBottomSheet {...callbacks} device={device} />);
  const action = screen.getByRole("button", { name: "Turn off Bedside light" });
  expect(action.props.accessibilityState.selected).toBe(true);
  fireEvent.press(action);
  expect(callbacks.onToggle).toHaveBeenCalledTimes(1);
});

test("retains the gas full-controls shortcut for existing callers", () => {
  const device: Device = {
    id: "gas",
    name: "Gas meter",
    kind: "gas-meter",
    roomId: "room",
    isOn: true,
  };
  const screen = render(<DeviceBottomSheet {...callbacks} device={device} />);
  fireEvent.press(
    screen.getByRole("button", { name: "Open controls for Gas meter" }),
  );
  expect(callbacks.onOpenDetails).toHaveBeenCalledTimes(1);
  expect(callbacks.onToggle).not.toHaveBeenCalled();
});
