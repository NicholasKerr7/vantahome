import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { Alert } from "react-native";
import { getDevice } from "../../../packages/home-scene/src/data";
import { useHomeStore } from "../../store/useHomeStore";
import { DeviceControlsSheet } from "../three-d-home/DeviceControlsSheet";
import { SimulationControlClient } from "../three-d-home/simulationControlClient";
import HomeDeviceLibrary from "./HomeDeviceLibrary";

jest.mock("../../config/runtimeMode", () => ({
  runtimePolicy: { mode: "demo", allowUnauthenticatedDemo: true },
}));
jest.mock("../../components/useDecorativeMotion", () => ({
  useDecorativeMotion: () => false,
}));
jest.mock("../three-d-home/DeviceControlsSheet", () => ({
  DeviceControlsSheet: jest.fn(() =>
    require("react").createElement(
      require("react-native").Text,
      null,
      "Visible model library",
    ),
  ),
}));
const mockClient = new SimulationControlClient();
const mockEnabled = jest.fn();
jest.mock("../three-d-home/useSimulationControls", () => ({
  useSimulationControls: (enabled: boolean) => {
    mockEnabled(enabled);
    return { ...mockClient.getSnapshot(), client: mockClient };
  },
}));
const seed = useHomeStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  const device = getDevice("living-light")!;
  useHomeStore.setState({
    ...seed,
    modelCatalogVersion: 1,
    accountUserId: null,
    authenticatedUserId: null,
    accountHomeId: null,
    activeHomeId: null,
    realtime: { ...seed.realtime, enabled: false, useMqtt: false },
    household: [{ id: "owner", name: "Owner", role: "Owner", status: "home" }],
    activeMemberId: "owner",
    rooms: [{ id: "living", name: "Living room" }],
    devices: [
      {
        id: device.id,
        name: device.name,
        kind: device.kind,
        roomId: device.roomId,
        isOn: false,
      },
    ],
  });
});
afterEach(() => {
  useHomeStore.setState(seed);
  jest.restoreAllMocks();
});

/** Read the public inspector contract without mounting unrelated renderer or controls. */
function sheetProps(): React.ComponentProps<typeof DeviceControlsSheet> {
  const calls = (DeviceControlsSheet as jest.Mock).mock.calls;
  return calls[calls.length - 1][0];
}

test("opens only canonical devices visible in the current offline model home", () => {
  render(<HomeDeviceLibrary onClose={jest.fn()} />);
  expect(mockEnabled).toHaveBeenCalledWith(true);
  expect(sheetProps().allowedDeviceIds).toEqual(["living-light"]);
  act(() => sheetProps().onSelect("master-ac"));
  expect(sheetProps().deviceId).toBeNull();
  act(() => sheetProps().onSelect("living-light"));
  expect(sheetProps().deviceId).toBe("living-light");
});

test("does not expose the model library under an account or connect a preview client", () => {
  useHomeStore.setState({ authenticatedUserId: "account-a" });
  const onClose = jest.fn();
  const screen = render(<HomeDeviceLibrary onClose={onClose} />);
  expect(screen.getByText("Device library unavailable")).toBeTruthy();
  expect(DeviceControlsSheet).not.toHaveBeenCalled();
  expect(mockEnabled).toHaveBeenCalledWith(false);
  fireEvent.press(screen.getByRole("button", { name: "Back to home" }));
  expect(onClose).toHaveBeenCalled();
});

test("blocks stale commands and removes the open library when account access changes", () => {
  const toggle = jest
    .spyOn(mockClient, "toggle")
    .mockImplementation(() => undefined);
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  const screen = render(<HomeDeviceLibrary onClose={jest.fn()} />);
  const stale = sheetProps().client;
  act(() => {
    useHomeStore.setState({ authenticatedUserId: "account-b" });
  });
  expect(screen.getByText("Device library unavailable")).toBeTruthy();
  act(() => stale.toggle("living-light"));
  expect(toggle).not.toHaveBeenCalled();
});
