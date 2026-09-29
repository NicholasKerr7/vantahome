import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../../app/AppNavigator";
import type { Device } from "../../../store/useHomeStore";
import CamerasScreen from "../../../screens/CamerasScreen";
import CameraViewerScreen from "../../../screens/CameraViewerScreen";

let mockAccessState = "granted";
const mockRetry = jest.fn();
const mockNavigation = {
  canGoBack: () => true,
  goBack: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
};
const mockState = {
  devices: [] as Device[],
  memberPermissionOverrides: [],
  rooms: [{ id: "entry", name: "Entry" }],
  member: { id: "owner", role: "Owner" },
};
jest.mock("../../../store/useHomeStore", () => ({
  useHomeStore: (selector: (state: typeof mockState) => unknown) =>
    selector(mockState),
  selectActiveMember: (state: typeof mockState) => state.member,
  selectVisibleDevices: (state: typeof mockState) => state.devices,
  selectVisibleRooms: (state: typeof mockState) => state.rooms,
}));
jest.mock("../../../security/useProtectedAccess", () => ({
  useProtectedAccess: () => ({ state: mockAccessState, retry: mockRetry }),
}));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: jest.fn() }));
jest.mock("../../../components/LiveVideoPlayer", () => {
  const { Text } = require("react-native");
  return function LivePlayer() {
    return <Text>Private live feed</Text>;
  };
});
jest.mock("../../../components/CameraThumbnail", () => {
  const { Text } = require("react-native");
  return function Thumbnail() {
    return <Text>Private snapshot</Text>;
  };
});
jest.mock("../../../components/CinematicSurface", () => {
  const { View } = require("react-native");
  return function Surface({ children }: { children: React.ReactNode }) {
    return <View>{children}</View>;
  };
});
jest.mock("../../../theme/layout", () => ({
  useResponsive: () => ({ isTablet: false, isLandscape: false }),
}));
jest.mock("@expo/vector-icons/Ionicons", () => "Icon");
jest.mock("../../../components/RenderProfiler", () => {
  return function Profiler({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  };
});

/** Supply a valid camera without invoking device transports. */
function camera(id: string): Device {
  return {
    id,
    name: `${id} camera`,
    kind: "camera",
    roomId: "entry",
    isOn: true,
    streamUrl: "https://example.com/camera.m3u8",
    armed: true,
  } as Device;
}

/** Render the camera monitor with only the navigator operations it actually uses. */
function monitor() {
  return render(
    <CamerasScreen
      navigation={
        mockNavigation as unknown as NativeStackScreenProps<
          RootStackParamList,
          "Cameras"
        >["navigation"]
      }
      route={{ key: "Cameras", name: "Cameras" }}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAccessState = "granted";
  mockState.devices = [camera("Front"), camera("Rear")];
  mockState.member.role = "Owner";
});

test("does not mount private content until authentication succeeds", () => {
  mockAccessState = "denied";
  const screen = monitor();
  expect(screen.getByText("Camera access locked")).toBeTruthy();
  expect(screen.queryByText("Private snapshot")).toBeNull();
  expect(screen.queryByText("Private live feed")).toBeNull();
  fireEvent.press(screen.getByLabelText("Try again"));
  expect(mockRetry).toHaveBeenCalledTimes(1);
});

test("paging releases a running feed and retains camera-control navigation", () => {
  const screen = monitor();
  fireEvent.press(screen.getByLabelText("Go live"));
  expect(screen.getByText("Private live feed")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Next cameras"));
  expect(screen.queryByText("Private live feed")).toBeNull();
  expect(screen.getByText("Rear camera")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Camera controls for Rear camera"));
  expect(mockNavigation.navigate).toHaveBeenCalledWith("DeviceDetail", {
    deviceId: "Rear",
  });
});

test("a camera role restriction blocks content even with a granted authentication state", () => {
  mockState.member.role = "Guest";
  const screen = monitor();
  expect(screen.getByText("Camera access unavailable")).toBeTruthy();
  expect(screen.queryByText("Private snapshot")).toBeNull();
});

test("an online camera without a stream is not labelled live", () => {
  mockState.devices = [{ ...camera("Front"), streamUrl: undefined }];
  const screen = render(
    <CameraViewerScreen
      navigation={
        mockNavigation as unknown as NativeStackScreenProps<
          RootStackParamList,
          "CameraViewer"
        >["navigation"]
      }
      route={{
        key: "CameraViewer",
        name: "CameraViewer",
        params: { deviceId: "Front" },
      }}
    />,
  );
  expect(screen.queryByText("Private live feed")).toBeNull();
  expect(screen.getByText("Private snapshot")).toBeTruthy();
  expect(screen.queryByText(/· Live view/)).toBeNull();
});
