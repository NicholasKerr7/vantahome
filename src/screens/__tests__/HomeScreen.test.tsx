import React from "react";
import { StyleSheet } from "react-native";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import HomeScreen from "../HomeScreen";
import { useHomeStore } from "../../store/useHomeStore";

let mockParentNavigate: jest.Mock;
let mockNavigate: jest.Mock;
const mockLayout = {
  width: 390,
  height: 844,
  isLandscape: false,
  isTablet: false,
  contentWidth: 390,
  gutter: 22,
  topPad: 56,
  blockGap: 14,
  scale: 1,
};

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    getParent: () => ({ navigate: mockParentNavigate }),
  }),
}));

jest.mock("../../theme/layout", () => ({
  useResponsive: () => mockLayout,
  TABLET_MIN_SIZE: 768,
  DEFAULT_MAX_WIDTH: 860,
}));

jest.mock("@react-native-voice/voice", () => ({
  __esModule: true,
  default: {
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    destroy: jest.fn(() => Promise.resolve()),
    removeAllListeners: jest.fn(),
    onSpeechResults: undefined,
    onSpeechEnd: undefined,
    onSpeechError: undefined,
  },
}));

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve()),
  AndroidImportance: { HIGH: "high" },
  AndroidNotificationVisibility: { PUBLIC: "public" },
}));

jest.mock("@expo/vector-icons/Ionicons", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockIonicons(props: any) {
    return <View {...props} />;
  };
});

jest.mock("../../components/RoomCarousel", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockRoomCarousel(props: { compact?: boolean }) {
    return (
      <View
        testID="room-carousel-mock"
        accessibilityLabel={props.compact ? "compact" : "standard"}
      />
    );
  };
});

jest.mock("../../components/GradientOrb", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockGradientOrb(props: { compact?: boolean }) {
    return (
      <View
        testID="gradient-orb-mock"
        accessibilityLabel={props.compact ? "compact" : "standard"}
      />
    );
  };
});

jest.mock("../../components/BackgroundLines", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockBackgroundLines() {
    return <View />;
  };
});

describe("HomeScreen", () => {
  const previousThreeDFlag = process.env.EXPO_PUBLIC_ENABLE_3D_HOME;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    if (previousThreeDFlag === undefined) {
      delete process.env.EXPO_PUBLIC_ENABLE_3D_HOME;
    } else {
      process.env.EXPO_PUBLIC_ENABLE_3D_HOME = previousThreeDFlag;
    }
    jest.clearAllTimers();
    Object.assign(mockLayout, {
      width: 390,
      height: 844,
      isLandscape: false,
      isTablet: false,
      contentWidth: 390,
      gutter: 22,
      topPad: 56,
      blockGap: 14,
      scale: 1,
    });
  });

  beforeEach(() => {
    process.env.EXPO_PUBLIC_ENABLE_3D_HOME = "true";
    mockParentNavigate = jest.fn();
    mockNavigate = jest.fn();
    act(() => {
      useHomeStore.setState({
        userName: "Alex",
        profile: {
          name: "Alex",
          email: "alex@example.com",
          phone: "",
          homeName: "Vanta Home",
          avatarColor: "#B46BFF",
        },
        rooms: [{ id: "r1", name: "Drawing Room" }],
        devices: [
          {
            id: "d1",
            name: "AC",
            kind: "ac",
            roomId: "r1",
            isOn: true,
            tempC: 22,
            mode: "cold",
          },
        ],
        outdoor: { tempC: 24, label: "Sunny" },
        indoor: { tempC: 22, label: "Indoor" },
      });
    });
  });

  it("opens the typed 3D simulation route without changing household devices", () => {
    const previousDevices = useHomeStore.getState().devices;
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HomeScreen />);
    });
    const entry = tree.root.findByProps({ testID: "home-three-d-button" });
    expect(entry.props.accessibilityLabel).toBe("Open 3D Home simulation");
    act(() => entry.props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith("ThreeDHome");
    expect(useHomeStore.getState().devices).toBe(previousDevices);
    act(() => tree.unmount());
  });

  it("omits the 3D entry when disabled while preserving dashboard actions", () => {
    process.env.EXPO_PUBLIC_ENABLE_3D_HOME = "false";
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HomeScreen />);
    });
    expect(
      tree.root.findAllByProps({ testID: "home-three-d-button" }),
    ).toHaveLength(0);
    expect(tree.root.findByProps({ testID: "home-avatar-button" })).toBeTruthy();
    expect(
      tree.root.findByProps({ testID: "home-notifications-button" }),
    ).toBeTruthy();
    act(() => tree.unmount());
  });

  it("navigates to Profile when avatar is pressed", () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HomeScreen />);
    });
    const avatar = tree.root.findByProps({ testID: "home-avatar-button" });
    act(() => avatar.props.onPress());
    expect(mockParentNavigate).toHaveBeenCalledWith("Profile", undefined);
    act(() => {
      tree.unmount();
    });
  });

  it("navigates to Notifications when bell is pressed", () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HomeScreen />);
    });
    const bell = tree.root.findByProps({ testID: "home-notifications-button" });
    act(() => bell.props.onPress());
    expect(mockParentNavigate).toHaveBeenCalledWith("Notifications", undefined);
    act(() => {
      tree.unmount();
    });
  });

  it("uses compact dashboard components in landscape", () => {
    Object.assign(mockLayout, {
      width: 844,
      height: 390,
      isLandscape: true,
      contentWidth: 720,
    });
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HomeScreen />);
    });
    expect(
      tree.root.findByProps({ testID: "gradient-orb-mock" }).props
        .accessibilityLabel,
    ).toBe("compact");
    expect(
      tree.root.findByProps({ testID: "room-carousel-mock" }).props
        .accessibilityLabel,
    ).toBe("compact");
    act(() => {
      tree.unmount();
    });
  });

  it("centers the orb and room deck on one axis in tablet landscape", () => {
    Object.assign(mockLayout, {
      width: 1366,
      height: 1024,
      isLandscape: true,
      isTablet: true,
      contentWidth: 980,
      gutter: 36,
      topPad: 56,
      blockGap: 20,
      scale: 1.08,
    });
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HomeScreen />);
    });

    const heroStyle = StyleSheet.flatten(
      tree.root.findByProps({ testID: "home-hero-stack" }).props.style,
    );
    const orbStyle = StyleSheet.flatten(
      tree.root.findByProps({ testID: "home-orb-wrap" }).props.style,
    );
    const roomsStyle = StyleSheet.flatten(
      tree.root.findByProps({ testID: "home-rooms-section" }).props.style,
    );
    const carouselWrapStyle = StyleSheet.flatten(
      tree.root.findByProps({ testID: "home-rooms-carousel-wrap" }).props.style,
    );

    expect(heroStyle.flexDirection).toBe("column");
    expect(heroStyle.alignItems).toBe("center");
    expect(heroStyle.justifyContent).toBe("center");
    expect(heroStyle.gap).toBeGreaterThanOrEqual(72);
    expect(heroStyle.paddingBottom).toBe(0);
    expect(orbStyle.width).toBe("100%");
    expect(roomsStyle.alignSelf).toBe("center");
    expect(roomsStyle.width).toBeGreaterThan(0);
    expect(roomsStyle.width).toBeLessThanOrEqual(mockLayout.contentWidth * 0.52);
    expect(roomsStyle.transform).toBeUndefined();
    expect(carouselWrapStyle.marginTop).toBeGreaterThanOrEqual(44);
    act(() => {
      tree.unmount();
    });
  });

  it("tightens vertical rhythm on shorter tablet landscape viewports", () => {
    Object.assign(mockLayout, {
      width: 1180,
      height: 820,
      isLandscape: true,
      isTablet: true,
      contentWidth: 980,
      gutter: 36,
      topPad: 56,
      blockGap: 20,
      scale: 1.08,
    });
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HomeScreen />);
    });

    const heroStyle = StyleSheet.flatten(
      tree.root.findByProps({ testID: "home-hero-stack" }).props.style,
    );
    const carouselWrapStyle = StyleSheet.flatten(
      tree.root.findByProps({ testID: "home-rooms-carousel-wrap" }).props.style,
    );
    const roomsStyle = StyleSheet.flatten(
      tree.root.findByProps({ testID: "home-rooms-section" }).props.style,
    );

    expect(heroStyle.justifyContent).toBe("center");
    expect(heroStyle.gap).toBeLessThanOrEqual(16);
    expect(heroStyle.paddingBottom).toBeLessThanOrEqual(14);
    expect(roomsStyle.transform).toBeUndefined();
    expect(carouselWrapStyle.marginTop).toBeGreaterThanOrEqual(14);
    expect(carouselWrapStyle.marginTop).toBeLessThanOrEqual(16);
    act(() => {
      tree.unmount();
    });
  });
});
