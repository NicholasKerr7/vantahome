import React from "react";
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
  return function MockRoomCarousel() {
    return <View testID="room-carousel-mock" />;
  };
});

jest.mock("../../components/GradientOrb", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockGradientOrb() {
    return <View />;
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
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  beforeEach(() => {
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
});
