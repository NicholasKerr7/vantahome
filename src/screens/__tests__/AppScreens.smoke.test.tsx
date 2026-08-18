import React from "react";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import AuthScreen from "../AuthScreen";
import OnboardingScreen from "../OnboardingScreen";
import SettingsScreen from "../SettingsScreen";
import AutomationsScreen from "../AutomationsScreen";
import AutomationBuilderScreen from "../AutomationBuilderScreen";
import ScenesScreen from "../ScenesScreen";
import ManageRoomsScreen from "../ManageRoomsScreen";
import NotificationsScreen from "../NotificationsScreen";
import ProfileScreen from "../ProfileScreen";
import RoomScreen from "../RoomScreen";
import PasswordRecoveryScreen from "../PasswordRecoveryScreen";
import {
  useHomeStore,
  type AutomationFlow,
  type AutomationRule,
  type Device,
  type HouseholdMember,
  type Room,
  type Scene,
} from "../../store/useHomeStore";

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

let mockNavigate: jest.Mock;
let mockGoBack: jest.Mock;
let mockReplace: jest.Mock;
let mockCanGoBack: jest.Mock;

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
    getParent: () => ({ navigate: mockNavigate }),
  }),
}));

jest.mock("../../theme/layout", () => ({
  useResponsive: () => mockLayout,
  TABLET_MIN_SIZE: 768,
  DEFAULT_MAX_WIDTH: 860,
}));

jest.mock("@expo/vector-icons/Ionicons", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockIonicons(props: any) {
    return <View {...props} />;
  };
});

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockMaterialIcons(props: any) {
    return <View {...props} />;
  };
});

jest.mock("lottie-react-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockLottieView(props: any) {
    return <View {...props} />;
  };
});

jest.mock("@gorhom/bottom-sheet", () => {
  const React = require("react");
  const { View } = require("react-native");
  const BottomSheetModal = React.forwardRef(
    ({ children, ...props }: any, ref: any) => (
      <View ref={ref} {...props}>
        {children}
      </View>
    ),
  );
  return {
    BottomSheetModal,
    BottomSheetBackdrop: View,
    BottomSheetView: View,
  };
});

jest.mock("expo-blur", () => {
  const { View } = require("react-native");
  return { BlurView: View };
});

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-auth-session", () => ({
  makeRedirectUri: jest.fn(() => "mock://redirect"),
}));

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(() => Promise.resolve({ type: "cancel" })),
}));

jest.mock("../../services/authProviderAvailability", () => ({
  fetchAuthProviderAvailability: jest.fn(() => new Promise(() => {})),
}));

jest.mock("@react-native-masked-view/masked-view", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockMaskedView({ children, ...props }: any) {
    return <View {...props}>{children}</View>;
  };
});

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: "granted" }),
  ),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true })),
  MediaTypeOptions: { Images: "Images" },
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

jest.mock("../../services/deviceClient", () => ({
  deviceClient: {
    subscribeConnection: jest.fn((fn: any) => {
      if (fn) fn({ status: "disconnected", ts: 0 });
      return () => {};
    }),
    subscribeState: jest.fn(() => () => {}),
    subscribeRetry: jest.fn((fn: any) => {
      if (fn) fn({ pending: 0 });
      return () => {};
    }),
    sendCommand: jest.fn(() => Promise.resolve()),
    getConnectionStatus: jest.fn(() => "disconnected"),
    connect: jest.fn(() => () => {}),
    disconnect: jest.fn(),
  },
}));

jest.mock("../../services/cloudRegistry", () => ({
  bootstrapHome: jest.fn(() => Promise.resolve({ home: { id: "h1" } })),
  devicesToStateEvents: jest.fn(() => []),
  pushDeviceStateBatch: jest.fn(() => Promise.resolve({ updated: 0 })),
}));

const seed = useHomeStore.getState();

const cloneRooms = (rooms: Room[]) => rooms.map((r) => ({ ...r }));
const cloneDevices = (devices: Device[]) => devices.map((d) => ({ ...d }));
const cloneRules = (rules: AutomationRule[]) =>
  rules.map((r) => ({
    ...r,
    trigger: { ...r.trigger },
    action: { ...(r.action as any) },
  }));
const cloneFlows = (flows: AutomationFlow[]) =>
  flows.map((f) => ({
    ...f,
    triggers: f.triggers.map((t) => ({ ...t })),
    conditions: f.conditions.map((c) => ({ ...c })),
    actions: f.actions.map((a) => ({ ...a })),
  }));
const cloneScenes = (scenes: Scene[]) =>
  scenes.map((s) => ({
    ...s,
    actions: s.actions.map((a) => {
      if (a.type === "patch") return { ...a, patch: { ...a.patch } };
      return { ...a };
    }),
  }));
const cloneHousehold = (household: HouseholdMember[]) =>
  household.map((member) => ({ ...member }));

const resetStore = () => {
  useHomeStore.setState({
    userName: seed.userName,
    profile: { ...seed.profile },
    outdoor: { ...seed.outdoor },
    indoor: { ...seed.indoor },
    rooms: cloneRooms(seed.rooms),
    devices: cloneDevices(seed.devices),
    rules: cloneRules(seed.rules),
    flows: cloneFlows(seed.flows),
    scenes: cloneScenes(seed.scenes),
    activeSceneId: seed.activeSceneId,
    lastSceneRun: seed.lastSceneRun,
    integrations: { ...seed.integrations },
    preferences: { ...seed.preferences },
    realtime: { ...seed.realtime },
    household: cloneHousehold(seed.household),
  });
};

const renderScreen = (element: React.ReactElement) => {
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  expect(tree!.toJSON()).toBeTruthy();
  act(() => {
    tree!.unmount();
  });
};

describe("App screens smoke coverage", () => {
  beforeEach(() => {
    mockNavigate = jest.fn();
    mockGoBack = jest.fn();
    mockReplace = jest.fn();
    mockCanGoBack = jest.fn(() => true);
    resetStore();
  });

  it("renders AuthScreen", () => {
    const navigation = { replace: jest.fn(), goBack: jest.fn() } as any;
    const route = { key: "Auth", name: "Auth" } as any;
    renderScreen(<AuthScreen navigation={navigation} route={route} />);
  });

  it("renders PasswordRecoveryScreen", () => {
    renderScreen(<PasswordRecoveryScreen onComplete={jest.fn()} />);
  });

  it("renders OnboardingScreen", () => {
    const navigation = { replace: jest.fn(), goBack: jest.fn() } as any;
    const route = { key: "Onboarding", name: "Onboarding" } as any;
    renderScreen(<OnboardingScreen navigation={navigation} route={route} />);
  });

  it("renders SettingsScreen", () => {
    renderScreen(<SettingsScreen />);
  });

  it("renders AutomationsScreen", () => {
    renderScreen(<AutomationsScreen />);
  });

  it("renders AutomationBuilderScreen", () => {
    const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;
    const route = {
      key: "AutomationBuilder",
      name: "AutomationBuilder",
      params: { flowId: undefined },
    } as any;
    renderScreen(
      <AutomationBuilderScreen navigation={navigation} route={route} />,
    );
  });

  it("renders ScenesScreen", () => {
    renderScreen(<ScenesScreen />);
  });

  it("renders ManageRoomsScreen", () => {
    const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;
    const route = { key: "ManageRooms", name: "ManageRooms" } as any;
    renderScreen(<ManageRoomsScreen navigation={navigation} route={route} />);
  });

  it("renders NotificationsScreen", () => {
    renderScreen(<NotificationsScreen />);
  });

  it("renders ProfileScreen", () => {
    const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;
    const route = { key: "Profile", name: "Profile" } as any;
    renderScreen(<ProfileScreen navigation={navigation} route={route} />);
  });

  it("renders RoomScreen", () => {
    const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;
    const roomId = seed.rooms[0]?.id ?? "r1";
    const route = {
      key: "Room",
      name: "Room",
      params: { roomId, showAll: false },
    } as any;
    renderScreen(<RoomScreen navigation={navigation} route={route} />);
  });
});
