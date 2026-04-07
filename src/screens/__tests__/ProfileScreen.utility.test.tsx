import React from "react";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { useHomeStore } from "../../store/useHomeStore";

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

jest.mock("../../components/AvatarChip", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockAvatarChip(props: any) {
    return <View {...props} />;
  };
});

jest.mock("../../components/LandscapeFrame", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockLandscapeFrame({ children }: any) {
    return <View>{children}</View>;
  };
});

jest.mock("../../components/PortraitFrame", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockPortraitFrame({ children }: any) {
    return <View>{children}</View>;
  };
});

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: "granted" }),
  ),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true })),
  MediaTypeOptions: { Images: "Images" },
}));

jest.mock("../../services/roomMembers", () => ({
  setRoomMembershipRemote: jest.fn(() => Promise.resolve()),
}));

jest.mock("../../services/cloudRegistry", () => ({
  inviteHomeMember: jest.fn(() => Promise.resolve()),
  listPendingInvites: jest.fn(() => Promise.resolve([])),
  respondHomeInvite: jest.fn(() => Promise.resolve()),
}));

jest.mock("../../services/membership", () => ({
  syncMembershipFromSupabase: jest.fn(() => Promise.resolve(null)),
}));

jest.mock("../../services/supabaseClient", () => ({
  supabase: null,
}));

jest.mock("../../services/remotePush", () => ({
  disableRemotePushRegistration: jest.fn(() => Promise.resolve(true)),
}));

jest.mock("../../services/presenceGeofencing", () => ({
  configurePresenceGeofenceFromCurrentLocation: jest.fn(() =>
    Promise.resolve({ kind: "task-unavailable" }),
  ),
  DEFAULT_PRESENCE_GEOFENCE_RADIUS_M: 120,
  PRESENCE_GEOFENCE_RADIUS_OPTIONS: [80, 120, 180, 250],
  syncPresenceFromCurrentLocationIfAuthorized: jest.fn(() =>
    Promise.resolve(null),
  ),
  syncPresenceGeofencingFromProfile: jest.fn(() =>
    Promise.resolve({ kind: "task-unavailable" }),
  ),
}));

jest.mock("../../services/utilityLocation", () => ({
  requestUtilityLocationFromDevice: jest.fn(),
  buildUtilityLocationPatchFromDeviceResult: jest.requireActual(
    "../../services/utilityLocation",
  ).buildUtilityLocationPatchFromDeviceResult,
}));

const ProfileScreen = require("../ProfileScreen").default;
const { requestUtilityLocationFromDevice } = require("../../services/utilityLocation");

const seed = useHomeStore.getState();

function textValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(textValue).join("");
  if (value == null || typeof value === "boolean") return "";
  return String(value);
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("ProfileScreen utility rates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useHomeStore.setState({
      profile: {
        ...seed.profile,
        utilityLocation: "us-average",
        utilityLocationManual: "us-average",
        utilityLocationMode: "manual",
        utilityLocationResolvedLabel: "",
        utilityLocationStatus: "fallback",
      },
    });
    (requestUtilityLocationFromDevice as jest.Mock).mockResolvedValue({
      kind: "resolved",
      locationId: "denver-co",
      resolvedLabel: "Denver, CO",
      status: "matched",
    });
  });

  it(
    "switches to device-matched utility rates from the profile screen",
    async () => {
    const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;
    const route = { key: "Profile", name: "Profile", params: undefined } as any;

    let tree: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileScreen navigation={navigation} route={route} />,
      );
    });
    await flushEffects();

    await act(async () => {
      await tree.root
        .findByProps({ testID: "utility-use-current-location-button" })
        .props.onPress();
    });
    await flushEffects();

    expect(requestUtilityLocationFromDevice).toHaveBeenCalledTimes(1);

    const summary = tree.root.findByProps({ testID: "utility-summary-text" });
    expect(textValue(summary.props.children)).toContain(
      "Auto mode is using Denver, CO based on Denver, CO.",
    );
    expect(
      tree.root.findByProps({ testID: "utility-use-manual-rates-button" }),
    ).toBeTruthy();

    await act(async () => {
      tree.unmount();
    });
    },
    15000,
  );
});
