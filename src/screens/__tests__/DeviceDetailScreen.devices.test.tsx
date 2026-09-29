import React from "react";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import DeviceDetailScreen from "../DeviceDetailScreen";
import CameraDetailSection from "../device-detail/devices/CameraDetailSection";
import LightDetailSection from "../device-detail/devices/LightDetailSection";
import CinematicSurface from "../../components/CinematicSurface";
import { theme } from "../../theme/theme";
import {
  useHomeStore,
  type Device,
  type DeviceKind,
  type HouseholdMember,
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
const defaultLayout = { ...mockLayout };
let mockModelHome = false;
jest.mock("../../features/three-d-home/modelHomeScope", () => ({ isModelHome: () => mockModelHome }));
jest.mock("../../security/useProtectedAccess", () => ({ useProtectedAccess: () => ({ state: "granted", retry: jest.fn() }) }));

jest.mock("lottie-react-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockLottieView(props: any) {
    return <View {...props} />;
  };
});

jest.mock("../../components/RadialDial", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockRadialDial(props: any) {
    return <View {...props} />;
  };
});

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

jest.mock("../../theme/layout", () => ({
  useResponsive: () => mockLayout,
  TABLET_MIN_SIZE: 768,
  DEFAULT_MAX_WIDTH: 860,
}));

jest.mock("../../components/BackgroundLines", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockBackgroundLines() {
    return <View />;
  };
});

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const seed = useHomeStore.getState();
const baseRooms = seed.rooms.length
  ? seed.rooms.map((room) => ({ ...room }))
  : [{ id: "r1", name: "Living Room" }];
const baseHousehold: HouseholdMember[] = seed.household.length
  ? seed.household.map((member) => ({ ...member }))
  : [
      {
        id: "h1",
        name: "Jamie Taylor",
        role: "Owner",
        status: "home",
      },
    ];

const deviceKinds: DeviceKind[] = [
  "ac",
  "air",
  "camera",
  "coffee",
  "door",
  "dryer",
  "dishwasher",
  "energy",
  "fan",
  "fridge",
  "garage",
  "gate",
  "light",
  "microwave",
  "smoke",
  "speaker",
  "sprinkler",
  "stove",
  "tv",
  "vacuum",
  "washer",
  "water",
  "water-heater",
  "window",
];

// Minimal per-kind fixtures so each device detail view can render safely.
const createDevice = (kind: DeviceKind): Device => {
  const base: Device = {
    id: `test-${kind}`,
    name: kind.replace("-", " ").toUpperCase(),
    kind,
    roomId: baseRooms[0].id,
    isOn: false,
  };

  switch (kind) {
    case "ac":
      return { ...base, isOn: true, tempC: 22, mode: "cold" };
    case "air":
      return { ...base, isOn: true, airQualityIndex: 32, humidity: 44 };
    case "camera":
      return {
        ...base,
        isOn: true,
        armed: true,
        recording: false,
        nightVision: true,
        motionAlerts: true,
        motionSensitivity: 60,
        micMuted: false,
        twoWayAudio: true,
      };
    case "coffee":
      return { ...base, isOn: true };
    case "door":
      return { ...base, isOn: false, openPercent: 10 };
    case "dryer":
      return {
        ...base,
        cycle: "Normal",
        progress: 35,
        heatLevel: "Med",
        drynessLevel: "Dry",
        remainingMin: 42,
        sensorDry: true,
        wrinkleGuard: true,
        steamRefresh: false,
        ecoDry: false,
        airFluff: false,
        coolDown: true,
        lintFilterOk: true,
        antiStatic: false,
      };
    case "energy":
      return {
        ...base,
        isOn: true,
        powerW: 680,
        energyTodayKwh: 4.2,
        energyPeakW: 980,
        energyMonthKwh: 78,
        energyCostToday: 2.4,
        energyBudgetKwh: 120,
        gridAvailable: true,
        gridOutageAlerts: true,
        solarW: 420,
        solarTodayKwh: 1.4,
        gridTodayKwh: 2.8,
      };
    case "fan":
      return { ...base, isOn: true, speed: 55 };
    case "fridge":
      return { ...base, isOn: true, tempC: 4 };
    case "garage":
      return { ...base, isOn: false, openPercent: 12 };
    case "gate":
      return { ...base, isOn: false, openPercent: 0, autoOpenEnabled: true };
    case "light":
      return {
        ...base,
        isOn: true,
        brightness: 70,
        color: "#FFD166",
        colorTempK: 3200,
      };
    case "microwave":
      return {
        ...base,
        isOn: false,
        timeRemainingSec: 90,
        microwavePower: 7,
        microwaveMode: "Reheat",
      };
    case "smoke":
      return { ...base, isOn: true, smokeDetected: false };
    case "speaker":
      return {
        ...base,
        isOn: true,
        volume: 28,
        speakerSource: "Spotify",
        speakerPreset: "Warm",
        bass: 58,
        treble: 46,
        spatialAudio: true,
        partyMode: false,
        nightMode: false,
        micEnabled: true,
        voiceAssistantEnabled: true,
        shuffle: true,
        repeat: "all",
        trackTitle: "Midnight City",
        trackArtist: "M83",
        trackAlbum: "Hurry Up, We're Dreaming",
        trackDurationSec: 252,
        trackProgressSec: 96,
      };
    case "sprinkler":
      return {
        ...base,
        isOn: false,
        zone: "Front Yard",
        durationMin: 15,
        schedule: [
          {
            id: "sch-1",
            hour: 6,
            minute: 0,
            days: ["Mon", "Wed", "Fri"],
            enabled: true,
          },
        ],
      };
    case "stove":
      return {
        ...base,
        isOn: false,
        burnerLevel: 3,
        stoveMode: "simmer",
        stoveTimerMin: 15,
        stoveLock: false,
      };
    case "tv":
      return {
        ...base,
        isOn: true,
        volume: 20,
        channel: 5,
        source: "Live TV",
      };
    case "vacuum":
      return { ...base, isOn: false, status: "docked", battery: 85 };
    case "washer":
      return {
        ...base,
        cycle: "Normal",
        progress: 30,
        washTemp: "Warm",
        spinSpeedRpm: 1000,
        soilLevel: "Normal",
        remainingMin: 40,
        loadSize: "Medium",
        rinseCount: 2,
        prewash: false,
        steamWash: false,
        sanitizeWash: false,
        smartDispense: true,
        extraSpin: false,
        ecoWash: false,
      };
    case "dishwasher":
      return {
        ...base,
        cycle: "Auto",
        progress: 40,
        washTemp: "Hot",
        soilLevel: "Normal",
        remainingMin: 55,
        rinseCount: 2,
        prewash: false,
        steamWash: false,
        sanitizeWash: true,
        smartDispense: true,
        extraSpin: false,
        ecoWash: false,
      };
    case "water":
      return {
        ...base,
        isOn: true,
        waterLpm: 8,
        waterTodayL: 120,
        waterPressurePsi: 52,
        waterPressureLowPsi: 40,
        waterPressureHighPsi: 80,
        waterTempC: 18,
        waterLeakDetected: false,
        waterLeakAlerts: true,
        waterPressureAlerts: true,
        waterAutoShutoff: false,
        waterBudgetL: 220,
      };
    case "water-heater":
      return {
        ...base,
        isOn: true,
        tempC: 52,
        waterHeaterType: "heat-pump",
        heaterMode: "eco",
        recirculation: true,
        antiLegionella: false,
        vacationDays: 0,
        heaterScheduleEnabled: true,
      };
    case "window":
      return { ...base, isOn: true, openPercent: 30 };
    default:
      return base;
  }
};

describe("DeviceDetailScreen device coverage", () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;
  afterEach(() => { Object.assign(mockLayout, defaultLayout); mockModelHome = false; });

  /** Mount the actual utility hero with synthetic data and no command dispatch. */
  function renderUtilityHero(kind: DeviceKind, overrides: Partial<Device> = {}) {
    const device = { ...createDevice(kind), ...overrides };
    if (kind === "energy") device.name = "Energy Monitor";
    if (kind === "coffee") device.name = "Coffee Machine";
    if (kind === "camera") device.name = "Entry Camera";
    useHomeStore.setState({
      rooms: baseRooms,
      devices: [device],
      indoor: seed.indoor ?? { tempC: 22, label: "Indoor" },
      outdoor: seed.outdoor ?? { tempC: 24, label: "Outdoor" },
      household: baseHousehold,
      activeMemberId: baseHousehold[0].id,
    });
    const route: React.ComponentProps<typeof DeviceDetailScreen>["route"] = {
      key: "DeviceDetail",
      name: "DeviceDetail",
      params: { deviceId: device.id },
    };
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DeviceDetailScreen navigation={navigation} route={route} />,
      );
    });
    return tree;
  }

  it.each(["energy", "coffee"] as const)("gives the %s title full width above status pills on a 390px phone", (kind) => {
    const tree = renderUtilityHero(kind);
    try {
      const header = tree.root.findByProps({ testID: `${kind}-hero-header` });
      const title = tree.root.findByProps({ testID: `${kind}-hero-title` });
      expect(StyleSheet.flatten(header.props.style)).toMatchObject({
        flexDirection: "column", alignItems: "stretch", gap: 12,
      });
      expect(StyleSheet.flatten(title.props.style)).toMatchObject({
        flex: 0, width: "100%",
      });
    } finally {
      act(() => { tree.unmount(); });
    }
  });

  it("keeps a white bulb preview legible without restoring a light app surface", () => {
    const tree = renderUtilityHero("light", { color: "#FFFFFF", isOn: true });
    try {
      const surface = tree.root.findByType(CinematicSurface);
      const light = tree.root.findByType(LightDetailSection);
      expect(surface.props.variant).toBe("quiet");
      expect(surface.props.active).toBeUndefined();
      expect(light.props.bulbGradient[0]).toBe("#FFFFFF");
      expect(light.props.bulbIconColor).toBe(theme.colors.bg0);
      expect(StyleSheet.flatten(light.props.lightCenterValueStyle).color).toBe(theme.colors.bg0);
      expect(light.props.lightHeroGradient[0]).toBe(theme.colors.card2);
      expect(light.props.lightHeroGradient).not.toContain("#FFFFFF");
      expect(useHomeStore.getState().devices[0].color).toBe("#FFFFFF");
    } finally {
      act(() => { tree.unmount(); });
    }
  });

  it.each(["energy", "coffee", "washer", "gate", "window", "air"] as const)(
    "keeps the %s progress fill distinct from its track",
    (kind) => {
      // Gate position is displayed in its landscape status card.
      if (kind === "gate") Object.assign(mockLayout, {
        width: 1194, height: 834, isTablet: true, isLandscape: true,
      });
      const tree = renderUtilityHero(kind);
      try {
        const tracks = tree.root.findAll((node: { props: { children?: React.ReactNode; style?: StyleProp<ViewStyle> } }) => {
          const child = node.props.children;
          if (!React.isValidElement<{ style?: StyleProp<ViewStyle> }>(child)) return false;
          const fill = StyleSheet.flatten(child.props.style);
          return StyleSheet.flatten(node.props.style)?.backgroundColor === theme.colors.stroke &&
            fill?.height === "100%" && typeof fill.width === "string" && fill.width.endsWith("%");
        });
        expect(tracks.length).toBeGreaterThan(0);
        for (const track of tracks) {
          const child = track.props.children as React.ReactElement<{ style: StyleProp<ViewStyle> }>;
          expect(StyleSheet.flatten(child.props.style).backgroundColor).toBe(theme.colors.accent);
        }
      } finally {
        act(() => { tree.unmount(); });
      }
    },
  );

  it.each([
    ["phone", 390, 844, false, false],
    ["tablet portrait", 834, 1194, true, false],
    ["tablet landscape", 1194, 834, true, true],
  ] as const)("uses the bounded camera workspace on %s", (_label, width, height, isTablet, isLandscape) => {
    Object.assign(mockLayout, { width, height, isTablet, isLandscape });
    const tree = renderUtilityHero("camera");
    try {
      expect(tree.root.findByType(CameraDetailSection)).toBeTruthy();
      const workspace = tree.root.findByProps({ testID: "camera-control-workspace" });
      expect(StyleSheet.flatten(workspace.props.style)).toMatchObject({ flex: 1, minHeight: 0 });
      expect(workspace.findAllByType(ScrollView).every((node: { props: { horizontal?: boolean } }) => node.props.horizontal)).toBe(true);
      expect(tree.root.findAllByProps({ testID: "camera-hero-header" })).toHaveLength(0);
    } finally { act(() => { tree.unmount(); }); }
  });

  it("locks model camera identity while retaining custom camera editing", () => {
    mockModelHome = true;
    const model = renderUtilityHero("camera", { id: "entry-camera" });
    try { expect(model.root.findAllByProps({ testID: "device-options-button" })).toHaveLength(0); }
    finally { act(() => { model.unmount(); }); }
    const custom = renderUtilityHero("camera", { id: "custom-camera" });
    try { expect(custom.root.findAllByProps({ testID: "device-options-button" }).length).toBeGreaterThan(0); }
    finally { act(() => { custom.unmount(); }); }
  });

  it.each([
    ["energy", false], ["energy", true],
    ["coffee", false], ["coffee", true],
  ] as const)("preserves the %s tablet header with landscape=%s", (kind, isLandscape) => {
    Object.assign(mockLayout, {
      width: isLandscape ? 1194 : 834,
      height: isLandscape ? 834 : 1194,
      isTablet: true,
      isLandscape,
      contentWidth: 834,
      scale: isLandscape ? 1.08 : 1.14,
    });
    const tree = renderUtilityHero(kind);
    try {
      const header = tree.root.findByProps({ testID: `${kind}-hero-header` });
      const title = tree.root.findByProps({ testID: `${kind}-hero-title` });
      expect(StyleSheet.flatten(header.props.style)).toMatchObject({
        flexDirection: isLandscape ? "column" : "row",
        alignItems: "flex-start",
        gap: 12,
      });
      expect(StyleSheet.flatten(title.props.style).flex).toBe(1);
      expect(StyleSheet.flatten(title.props.style).width).toBeUndefined();
    } finally {
      act(() => { tree.unmount(); });
    }
  });

  // Keep this list in sync with DeviceKind so every device view renders safely.
  it.each(deviceKinds)("renders %s details without crashing", (kind) => {
    const device = createDevice(kind);
    act(() => {
      useHomeStore.setState({
        rooms: baseRooms,
        devices: [device],
        indoor: seed.indoor ?? { tempC: 22, label: "Indoor" },
        outdoor: seed.outdoor ?? { tempC: 24, label: "Outdoor" },
        household: baseHousehold,
      activeMemberId: baseHousehold[0].id,
      });
    });

    const route = {
      key: "DeviceDetail",
      name: "DeviceDetail",
      params: { deviceId: device.id },
    } as any;

    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DeviceDetailScreen navigation={navigation} route={route} />,
      );
    });
    expect(tree.toJSON()).toBeTruthy();
    act(() => {
      tree.unmount();
    });
  });
});
