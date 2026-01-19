import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  TextInput,
  ScrollView,
} from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import Slider from "@react-native-community/slider";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import LottieView from "lottie-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../app/AppNavigator";
import { theme } from "../theme/theme";
import {
  AC_TEMP_MAX_C,
  AC_TEMP_MIN_C,
  useHomeStore,
  type Device,
  type SprinklerSchedule,
} from "../store/useHomeStore";
import RadialDial from "../components/RadialDial";
import DeviceEditModal from "./device-detail/DeviceEditModal";
import DeviceScheduleModal from "./device-detail/DeviceScheduleModal";
import BackgroundLines from "../components/BackgroundLines";
import ModeTiles from "../components/ModeTiles";
import DeviceCapabilityControls from "../components/DeviceCapabilityControls";
import AvatarChip from "../components/AvatarChip";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { deviceClient } from "../services/deviceClient";
import { useResponsive } from "../theme/layout";
import DeviceIcon from "../components/DeviceIcon";

const AnimatedLottieView = Animated.createAnimatedComponent(LottieView);

const TV_LOTTIE_SOURCE = require("../../assets/animations/tv-screen.json");
const AC_LOTTIE_SOURCE = require("../../assets/animations/ac-screen.json");
const GARAGE_LOTTIE_SOURCE = require("../../assets/animations/garage-screen.json");
const CAMERA_LOTTIE_SOURCE = require("../../assets/animations/camera-screen.json");
const DRYER_LOTTIE_SOURCE = require("../../assets/animations/dryer-screen.json");
const DOOR_LOTTIE_SOURCE = require("../../assets/animations/door-screen.json");
const GATE_LOTTIE_SOURCE = require("../../assets/animations/front-gate-screen.json");
const STOVE_LOTTIE_SOURCE = require("../../assets/animations/stove-screen.json");
const ENERGY_LOTTIE_SOURCE = require("../../assets/animations/energy-screen.json");
const WATER_LOTTIE_SOURCE = require("../../assets/animations/water-screen.json");
const WINDOW_LOTTIE_SOURCE = require("../../assets/animations/window-screen.json");

type Props = NativeStackScreenProps<RootStackParamList, "DeviceDetail">;

function hexToRgb(hex: string) {
  const cleaned = hex.trim().replace("#", "");
  if (cleaned.length !== 3 && cleaned.length !== 6) return null;
  const full =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}

function isLightColor(hex: string, threshold = 0.9) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance >= threshold;
}

const LIGHT_TEMP_PRESETS: Array<{ label: string; value: number }> = [
  { label: "Warm", value: 2400 },
  { label: "Soft", value: 3000 },
  { label: "Neutral", value: 4000 },
  { label: "Daylight", value: 5200 },
];

const LIGHT_EFFECTS: Array<{
  label: string;
  value: NonNullable<Device["lightEffect"]>;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { label: "Focus", value: "focus", icon: "flash" as const },
  { label: "Relax", value: "relax", icon: "moon" as const },
  { label: "Sunset", value: "sunset", icon: "sunny" as const },
  { label: "Party", value: "party", icon: "color-palette" as const },
];

const LIGHT_AUTO_OFF = [0, 15, 30, 60];

const AIR_QUALITY_BANDS = [
  {
    max: 50,
    label: "Good",
    color: "#2F9E7D",
    gradient: ["#C8F3E4", "#6B3CFF"],
  },
  {
    max: 100,
    label: "Moderate",
    color: "#C08A1F",
    gradient: ["#FFE8B6", "#FF9B6A"],
  },
  {
    max: 150,
    label: "Poor",
    color: "#D05763",
    gradient: ["#FFD2D6", "#D8465B"],
  },
  {
    max: Number.POSITIVE_INFINITY,
    label: "Hazardous",
    color: "#8B2F43",
    gradient: ["#F4B0BA", "#B63A51"],
  },
];

const resolveAirBand = (aqi: number) =>
  AIR_QUALITY_BANDS.find((band) => aqi <= band.max) ?? AIR_QUALITY_BANDS[0];

const AIR_CHART_WINDOW_HOURS = 24;
const AIR_CHART_MAX_POINTS = 48;
const AIR_CHART_MIN_POINTS = 12;

const formatTimeAgo = (ts: number) => {
  const diffMs = Date.now() - ts;
  if (!Number.isFinite(diffMs) || diffMs < 0) return "Just now";
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.round(diffHr / 24);
  return `${diffDays}d ago`;
};

const buildAirSeries = (
  history: Array<{ ts: number; aqi?: number }>,
  fallbackAqi: number,
) => {
  if (!history.length) return [];
  const sorted = [...history].sort((a, b) => a.ts - b.ts);
  const now = Date.now();
  const windowMs = AIR_CHART_WINDOW_HOURS * 60 * 60 * 1000;
  const windowed = sorted.filter((sample) => sample.ts >= now - windowMs);
  if (windowed.length <= 1) return windowed;

  const deltas = windowed
    .slice(1)
    .map((sample, idx) => sample.ts - windowed[idx].ts)
    .filter((delta) => delta > 0);
  const median = deltas.length
    ? deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)]
    : 30 * 60 * 1000;
  const targetPoints = Math.min(
    AIR_CHART_MAX_POINTS,
    Math.max(AIR_CHART_MIN_POINTS, Math.round(windowMs / median)),
  );
  const stride =
    windowed.length > targetPoints
      ? Math.ceil(windowed.length / targetPoints)
      : 1;
  const downsampled =
    stride > 1 ? windowed.filter((_, idx) => idx % stride === 0) : windowed;
  return downsampled.length
    ? downsampled
    : [{ ts: now, aqi: fallbackAqi }];
};

export default function DeviceDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { gutter, isTablet, isLandscape, scale, contentWidth, height } =
    useResponsive(960);
  const isPortrait = !isLandscape;
  const safeBottom = insets.bottom;
  // Scale all measurements together so layouts stay balanced across device sizes.
  const panelPad = Math.round((isTablet ? 22 : 18) * scale);
  const panelRadius = Math.round((isTablet ? 44 : 42) * scale);
  const headerHeight = Math.round((isTablet ? 62 : 56) * scale);
  const headerBtnSize = Math.round((isTablet ? 48 : 44) * scale);
  const headerBtnRadius = Math.round(headerBtnSize / 2);
  const headerTitleSize = Math.round((isTablet ? 18 : 16) * scale);
  const moodLabelSize = Math.round((isTablet ? 13 : 12) * scale);
  const moodValueSize = Math.round((isTablet ? 24 : 22) * scale);
  const powerDockHeight = Math.round((isTablet ? 120 : 104) * scale);
  const powerDockInset = Math.round((isTablet ? 18 : 12) * scale);
  const powerDockOffset = Math.round((isTablet ? 12 : 8) * scale) + safeBottom;
  const dialSize = Math.round(
    (isTablet ? (isLandscape ? 320 : 340) : 280) * scale,
  );
  const compactDialSize = Math.round((isTablet ? 280 : 240) * scale);
  const gateLottieSize = Math.round(compactDialSize * 1.2);
  const gateAutoOpenPortraitTop = Math.round(
    (isTablet ? 36 : 28) * scale,
  );
  const tvDialSize = Math.round(compactDialSize * (isTablet ? 0.86 : 0.9));
  const tvOrbSize = Math.round(tvDialSize * 0.79);
  const tvOrbRadius = Math.round(tvOrbSize / 2);
  const speakerOrbSize = Math.round(compactDialSize * 0.79);
  const tvHeroPad = Math.round((isTablet ? 18 : 14) * scale);
  const tvHeroPillHeight = Math.round((isTablet ? 28 : 24) * scale);
  const tvHeroPillTextSize = Math.round((isTablet ? 12 : 11) * scale);
  const tvScreenHeight = Math.round((isTablet ? 200 : 170) * scale);
  const tvScreenRadius = Math.round((isTablet ? 24 : 20) * scale);
  const tvScreenInset = Math.round((isTablet ? 14 : 12) * scale);
  const tvScreenBadgeHeight = Math.round((isTablet ? 24 : 22) * scale);
  const tvScreenBadgeTextSize = Math.round((isTablet ? 11 : 10) * scale);
  const tvScreenTitleSize = Math.round((isTablet ? 18 : 16) * scale);
  const tvScreenSubtitleSize = Math.round((isTablet ? 12 : 11) * scale);
  const tvScreenMetaSize = Math.round((isTablet ? 12 : 11) * scale);
  const tvScreenFooterLabelSize = Math.round((isTablet ? 10 : 9) * scale);
  const tvScreenFooterValueSize = Math.round((isTablet ? 12 : 11) * scale);
  const tvVolumeValueSize = Math.round((isTablet ? 22 : 20) * scale);
  const tvVolumeLabelSize = Math.round((isTablet ? 11 : 10) * scale);
  const airOrbSize = Math.round((isTablet ? 220 : 190) * scale);
  const airHeroPad = Math.round((isTablet ? 20 : 16) * scale);
  const airHeroGap = Math.round((isTablet ? 20 : 14) * scale);
  const airGaugeSize = Math.round(airOrbSize * (isTablet ? 0.7 : 0.64));
  const airGaugeRadius = Math.round(airGaugeSize / 2);
  const airGaugeValueSize = Math.max(16, Math.round(airGaugeSize * 0.22));
  const airGaugeLabelSize = Math.max(10, Math.round(airGaugeSize * 0.1));
  const airHeroValueSize = Math.max(30, Math.round((isTablet ? 46 : 38) * scale));
  const airHeroLabelSize = Math.round((isTablet ? 13 : 12) * scale);
  const airHeroBadgeTextSize = Math.round((isTablet ? 12 : 11) * scale);
  const laundryHeroSize = Math.round(
    Math.min(compactDialSize, (isTablet ? 220 : 180) * scale),
  );
  const laundryHeroRadius = Math.round(laundryHeroSize / 2);
  const laundryHeroLabelSize = Math.max(
    11,
    Math.round(laundryHeroSize * 0.11),
  );
  const laundryLottieScale = isTablet ? 1.12 : 1.08;
  const laundryHeroPad = Math.round((isTablet ? 20 : 16) * scale);
  const laundryHeroGap = Math.round((isTablet ? 18 : 14) * scale);
  const laundryBadgeHeight = Math.round((isTablet ? 30 : 26) * scale);
  const laundryBadgeTextSize = Math.round((isTablet ? 12 : 11) * scale);
  const laundryStatusSize = Math.round((isTablet ? 16 : 14) * scale);
  const laundryCycleSize = Math.round((isTablet ? 18 : 16) * scale);
  const laundryCycleSubSize = Math.round((isTablet ? 12 : 11) * scale);
  const laundryStatValueSize = Math.round((isTablet ? 14 : 13) * scale);
  const laundryStatLabelSize = Math.round((isTablet ? 11 : 10) * scale);
  const laundryStatGap = Math.round((isTablet ? 12 : 10) * scale);
  const laundryProgressHeight = Math.round((isTablet ? 10 : 8) * scale);
  const windowHeroSize = Math.round(
    Math.min(compactDialSize, (isTablet ? 230 : 190) * scale),
  );
  const windowHeroRadius = Math.round(windowHeroSize / 2);
  const windowHeroPad = Math.round((isTablet ? 20 : 16) * scale);
  const windowHeroGap = Math.round((isTablet ? 18 : 14) * scale);
  const windowPillHeight = Math.round((isTablet ? 32 : 28) * scale);
  const windowPillTextSize = Math.round((isTablet ? 12 : 11) * scale);
  const energyHeroSize = Math.round(
    Math.min(compactDialSize, (isTablet ? 240 : 200) * scale),
  );
  const energyHeroRadius = Math.round(energyHeroSize / 2);
  const energyHeroPad = Math.round((isTablet ? 20 : 16) * scale);
  const energyHeroGap = Math.round((isTablet ? 18 : 14) * scale);
  const energyHeroPillHeight = Math.round((isTablet ? 30 : 26) * scale);
  const energyHeroPillTextSize = Math.round((isTablet ? 12 : 11) * scale);
  const energyHeroStatValueSize = Math.round((isTablet ? 15 : 14) * scale);
  const energyHeroStatLabelSize = Math.round((isTablet ? 11 : 10) * scale);
  const energyHeroProgressHeight = Math.round((isTablet ? 10 : 8) * scale);
  const utilityHeroSize = Math.round(
    Math.min(compactDialSize, (isTablet ? 220 : 180) * scale),
  );
  const utilityHeroRadius = Math.round(utilityHeroSize / 2);
  const utilityHeroPad = Math.round((isTablet ? 20 : 16) * scale);
  const utilityHeroGap = Math.round((isTablet ? 18 : 14) * scale);
  const utilityHeroPillHeight = Math.round((isTablet ? 30 : 26) * scale);
  const utilityHeroPillTextSize = Math.round((isTablet ? 12 : 11) * scale);
  const utilityHeroIconSize = Math.round(utilityHeroSize * 0.18);
  const coffeeHeroCupSize = Math.round(energyHeroSize * 0.34);
  const coffeeHeroCupRadius = Math.round(coffeeHeroCupSize * 0.26);
  const speakerBarBase = Math.round((isTablet ? 12 : 10) * scale);
  const speakerBarMax = Math.round((isTablet ? 36 : 28) * scale);
  const speakerCoverSize = Math.round((isTablet ? 72 : 60) * scale);
  const controlCardPad = Math.round((isTablet ? 16 : 12) * scale);
  const controlCardRadius = Math.round((isTablet ? 20 : 18) * scale);
  const gateAutoOpenCardPad = Math.round(controlCardPad * 0.45);
  const gateAutoOpenCardRadius = Math.round(controlCardRadius * 0.8);
  const controlCardRowGap = Math.round((isTablet ? 12 : 10) * scale);
  const isTabletLandscape = isTablet && isLandscape;
  const isLandscapeSplit =
    isTabletLandscape || (isLandscape && contentWidth >= 700);
  const smokeHeroSize = isLandscapeSplit
    ? Math.min(compactDialSize, Math.round(utilityHeroSize * 1.18))
    : utilityHeroSize;
  const smokeHeroRadius = Math.round(smokeHeroSize / 2);
  const smokeHeroIconSize = Math.round(smokeHeroSize * 0.18);
  const garageHeroSize = isLandscapeSplit
    ? Math.min(compactDialSize, Math.round(utilityHeroSize * 1.35))
    : utilityHeroSize;
  const garageHeroRadius = Math.round(garageHeroSize / 2);
  const doorHeroSize = isLandscapeSplit
    ? Math.min(compactDialSize, Math.round(utilityHeroSize * 1.35))
    : utilityHeroSize;
  const doorHeroRadius = Math.round(doorHeroSize / 2);
  const landscapeGridGap = Math.round((isTablet ? 22 : 18) * scale);
  const landscapeColumnGap = Math.round((isTablet ? 18 : 14) * scale);
  const landscapeSurfacePad = Math.round((isTablet ? 12 : 10) * scale);
  const landscapeSurfaceRadius = Math.round((isTablet ? 30 : 26) * scale);
  const landscapeColumnPad = Math.round((isTablet ? 14 : 12) * scale);
  const landscapeColumnRadius = Math.max(18, landscapeSurfaceRadius - 6);
  const sectionTopMargin = isTabletLandscape
    ? Math.round(12 * scale)
    : Math.round(28 * scale);
  const isLightCompact = !isTablet;
  const isLightMobile = !isTablet && !isLandscape;
  const lightDialSize = Math.round(
    Math.min(
      dialSize * (isLightMobile ? 0.78 : isLightCompact ? 0.86 : 1),
      contentWidth - panelPad * 2,
      height * (isLandscape ? 0.58 : isTablet ? 0.48 : 0.32),
    ),
  );
  const lightCenterSize = Math.max(
    120,
    Math.round(
      lightDialSize * (isLightMobile ? 0.84 : isLightCompact ? 0.82 : 0.8),
    ),
  );
  const lightCenterIcon = Math.max(22, Math.round(lightCenterSize * 0.2));
  const lightCenterValueSize = Math.max(18, Math.round(lightCenterSize * 0.11));
  const lightCenterRoomSize = Math.max(11, Math.round(lightCenterSize * 0.068));
  const lightCenterValueMargin = Math.max(
    6,
    Math.round(lightCenterSize * 0.05),
  );
  const lightCenterRoomMargin = Math.max(
    2,
    Math.round(lightCenterSize * 0.025),
  );
  const lightSwatchSize = Math.round((isTablet ? 36 : 26) * scale);
  const lightSwatchRadius = Math.round(lightSwatchSize * 0.35);
  const lightSceneItemHeight = Math.round((isTablet ? 54 : 40) * scale);
  const lightSceneItemRadius = Math.round(lightSceneItemHeight * 0.28);
  const lightSceneIconSize = Math.round((isTablet ? 16 : 12) * scale);
  const lightCardGap = Math.round((isTablet ? 14 : 6) * scale);
  const lightSubLabelSize = Math.round((isTablet ? 12 : 9) * scale);
  const lightCardPad = controlCardPad;
  const lightCardRadius = controlCardRadius;
  const editPad = Math.round((isTablet ? 20 : 16) * scale);
  const editRadius = Math.round((isTablet ? 24 : 22) * scale);
  const editTitleSize = Math.round((isTablet ? 20 : 18) * scale);
  const editSubSize = Math.round((isTablet ? 14 : 12) * scale);
  const editLabelSize = Math.round((isTablet ? 13 : 12) * scale);
  const editInputHeight = Math.round((isTablet ? 48 : 44) * scale);
  const editButtonHeight = Math.round((isTablet ? 46 : 44) * scale);
  const controlCardStyle = isTablet
    ? [
        styles.controlCard,
        {
          padding: controlCardPad,
          borderRadius: controlCardRadius,
          marginTop: isTabletLandscape ? 0 : undefined,
        },
        isTabletLandscape && styles.controlCardLandscape,
      ]
    : styles.controlCard;
  const controlCardRowStyle = isTablet
    ? [styles.controlCardRow, { gap: controlCardRowGap }]
    : styles.controlCardRow;
  const lightLayoutRow = isLandscape;
  const lightCardBaseStyle = {
    padding: lightCardPad,
    borderRadius: lightCardRadius,
    marginTop: 0,
  };
  const lightDialCardStyle = [
    styles.controlCard,
    lightCardBaseStyle,
    styles.lightDialCard,
    isTabletLandscape && styles.controlCardLandscape,
    {
      marginTop: lightLayoutRow
        ? 0
        : Math.round((isLightCompact ? 12 : 16) * scale),
      gap: lightCardGap,
    },
  ];
  const lightControlCardStyle = [
    styles.controlCard,
    lightCardBaseStyle,
    styles.lightControlCard,
    isTabletLandscape && styles.controlCardLandscape,
  ];
  const lightControlsColumnStyle = [
    styles.lightControlsColumn,
    { gap: lightCardGap },
  ];
  const lightSwatchStyle = {
    width: lightSwatchSize,
    height: lightSwatchSize,
    borderRadius: lightSwatchRadius,
  };
  const lightSceneItemStyle = {
    height: lightSceneItemHeight,
    borderRadius: lightSceneItemRadius,
  };
  const lightSceneMinWidth = Math.round((isTablet ? 92 : 78) * scale);
  const lightControlsCompact = isLightMobile;
  const outerStyle: StyleProp<ViewStyle> = [
    styles.outer,
    { padding: gutter },
    isTablet && styles.outerTablet,
  ];
  const panelStyle: StyleProp<ViewStyle> = [
    styles.panel,
    {
      paddingTop: panelPad,
      paddingHorizontal: panelPad,
      paddingBottom: Math.round(panelPad * 1.1),
      borderRadius: panelRadius,
    },
    isTablet && {
      maxWidth: Math.min(isLandscape ? 980 : 860, contentWidth),
      width: "100%",
      alignSelf: "center",
    },
    isPortrait && styles.panelPortrait,
  ];
  const headerPillStyle: StyleProp<ViewStyle> = [
    styles.headerPill,
    {
      height: headerHeight,
      borderRadius: Math.round(headerHeight / 2),
      paddingHorizontal: Math.round(10 * scale),
    },
  ];
  const headerBtnStyle: StyleProp<ViewStyle> = [
    styles.headerBtn,
    {
      width: headerBtnSize,
      height: headerBtnSize,
      borderRadius: headerBtnRadius,
    },
  ];
  const headerTitleStyle: StyleProp<TextStyle> = [
    styles.headerTitle,
    { fontSize: headerTitleSize },
  ];
  const panelScrollContentStyle: StyleProp<ViewStyle> = [
    styles.panelScroll,
    {
      paddingBottom:
        powerDockHeight + powerDockOffset + Math.round(12 * scale),
    },
    isTabletLandscape && { paddingTop: Math.round(8 * scale) },
  ];
  const sectionTopStyle: ViewStyle = { marginTop: sectionTopMargin };
  const landscapeColumnGapStyle: ViewStyle = { gap: landscapeColumnGap };
  const flex1Style: ViewStyle = { flex: 1 };
  const marginBottom6Style: ViewStyle = { marginBottom: 6 };
  const openColumnStyle: ViewStyle = {
    flex: 1,
    gap: landscapeColumnGap,
    justifyContent: "center",
    alignItems: "stretch",
  };
  const landscapeGridStyle = isLandscapeSplit
    ? [
        styles.landscapeGrid,
        {
          gap: landscapeGridGap,
          padding: landscapeSurfacePad,
          borderRadius: landscapeSurfaceRadius,
        },
      ]
    : styles.landscapeGrid;
  const landscapeColumnBase = {
    gap: landscapeColumnGap,
    padding: landscapeColumnPad,
    borderRadius: landscapeColumnRadius,
  };
  const landscapeColumnPrimaryStyle = isLandscapeSplit
    ? [styles.landscapeColumn, styles.landscapeColumnPrimary, landscapeColumnBase]
    : styles.landscapeColumn;
  const landscapeColumnSecondaryStyle = isLandscapeSplit
    ? [styles.landscapeColumn, styles.landscapeColumnSecondary, landscapeColumnBase]
    : styles.landscapeColumn;
  const renderLandscapeContent = (content: React.ReactNode) => {
    if (!isLandscapeSplit) return content;
    if (!React.isValidElement(content)) return content;
    const element = content as React.ReactElement<any>;
    const isFragment = element.type === React.Fragment;
    const isViewWrapper = element.type === View;
    if (!isFragment && !isViewWrapper) return content;

    const isRenderableNode = (node: React.ReactNode) =>
      React.isValidElement(node) ||
      typeof node === "string" ||
      typeof node === "number";
    let nodes = React.Children.toArray(element.props.children).filter(
      isRenderableNode,
    );
    if (nodes.length <= 1) {
      const only = nodes[0];
      if (React.isValidElement(only) && only.type === React.Fragment) {
        const onlyElement = only as React.ReactElement<any>;
        const inner = React.Children.toArray(onlyElement.props.children).filter(
          isRenderableNode,
        );
        if (inner.length > 1) {
          nodes = inner;
        }
      }
    }

    if (nodes.length <= 1) return content;
    const splitIndex = Math.ceil(nodes.length / 2);
    const left = nodes.slice(0, splitIndex);
    const right = nodes.slice(splitIndex);

    if (isViewWrapper) {
      const { style, ...rest } = element.props as React.ComponentProps<
        typeof View
      >;
      const gridWrapStyle: StyleProp<ViewStyle> = [landscapeGridStyle, style];
      return (
        <View {...rest} style={gridWrapStyle}>
          <View style={landscapeColumnPrimaryStyle}>{left}</View>
          <View style={landscapeColumnSecondaryStyle}>{right}</View>
        </View>
      );
    }

    return (
      <View style={landscapeGridStyle}>
        <View style={landscapeColumnPrimaryStyle}>{left}</View>
        <View style={landscapeColumnSecondaryStyle}>{right}</View>
      </View>
    );
  };
  const renderDeviceLottie = (source: any, size: number) => {
    const dockStyle: StyleProp<ViewStyle> = [
      styles.deviceLottieDock,
      {
        width: size,
        height: size,
        borderRadius: Math.round(size / 2),
      },
    ];
    return (
      <View style={dockStyle}>
        <LottieView
          source={source}
          autoPlay
          loop
          resizeMode="contain"
          style={styles.deviceLottie}
        />
      </View>
    );
  };
  const { deviceId } = route.params;
  const device = useHomeStore((s) => s.devices.find((d) => d.id === deviceId));
  const roomName = useHomeStore(
    (s) => s.rooms.find((r) => r.id === device?.roomId)?.name ?? "",
  );
  const removeDevice = useHomeStore((s) => s.removeDevice);
  const household = useHomeStore((s) => s.household);
  const activeHouseholdMember =
    household.find((member) => member.status === "home") ?? household[0];
  const setHouseholdPresence = useHomeStore((s) => s.setHouseholdPresence);
  const gateDevice = useHomeStore((s) =>
    s.devices.find((d) => d.kind === "gate"),
  );
  const roomTemp = useHomeStore((s) => s.indoor.tempC);
  const outdoor = useHomeStore((s) => s.outdoor);
  const rooms = useHomeStore((s) => s.rooms);
  const devicesAll = useHomeStore((s) => s.devices);
  const coffeeFill = useRef(
    new Animated.Value(device?.kind === "coffee" && device.isOn ? 1 : 0),
  ).current;
  const waterFill = useRef(new Animated.Value(0)).current;
  const waterLoop = useRef<Animated.CompositeAnimation | null>(null);
  const speakerBars = useRef(
    Array.from({ length: 10 }, () => new Animated.Value(0.2)),
  ).current;
  const coffeeLoop = useRef<Animated.CompositeAnimation | null>(null);
  const openProgress = useRef(new Animated.Value(0)).current;
  const openDeviceIdRef = useRef<string | null>(null);
  const openPercentRef = useRef<number | null>(null);

  if (!device) return null;

  const isAC = device.kind === "ac";
  const showCapabilities = false;
  const temp = Math.max(
    AC_TEMP_MIN_C,
    Math.min(AC_TEMP_MAX_C, device.tempC ?? 22),
  );
  const mode = (device.mode ?? "cold") as "cold" | "fan" | "dry";
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));
  const brightness = clamp(device.brightness ?? 60, 0, 100);
  const colorTempK = clamp(device.colorTempK ?? 3200, 2000, 6500);
  const lightEffect = device.lightEffect ?? "focus";
  const adaptiveLighting = device.adaptiveLighting ?? false;
  const motionBoost = device.motionBoost ?? false;
  const nightShift = device.nightShift ?? false;
  const autoOffMin = clamp(device.autoOffMin ?? 0, 0, 120);
  const acFanSpeed = clamp(device.acFanSpeed ?? 60, 0, 100);
  const acSwingMode = device.acSwingMode ?? "both";
  const acEcoMode = device.acEcoMode ?? false;
  const acTurboMode = device.acTurboMode ?? false;
  const acQuietMode = device.acQuietMode ?? false;
  const acTargetHumidity = clamp(device.acTargetHumidity ?? 45, 30, 60);
  const acFilterLife = clamp(device.acFilterLife ?? 100, 0, 100);
  const bulbColor = device.color ?? "#FFD166";
  const bulbIsLight = isLightColor(bulbColor);
  const bulbGradient: [string, string] = bulbIsLight
    ? [bulbColor, "rgba(200,200,216,0.96)"]
    : [bulbColor, "rgba(255,255,255,0.92)"];
  const bulbTextColor = bulbIsLight ? stylesVars.ink : "#fff";
  const bulbSubColor = bulbIsLight
    ? stylesVars.subtext
    : "rgba(255,255,255,0.85)";
  const bulbIconColor = bulbIsLight ? stylesVars.ink : "#fff";
  const bulbInnerBorder = bulbIsLight
    ? "rgba(0,0,0,0.12)"
    : "rgba(255,255,255,0.18)";
  const volume = clamp(device.volume ?? 20, 0, 100);
  const channel = clamp(device.channel ?? 1, 1, 999);
  const tvSource = device.source ?? "Live TV";
  const tvIsLive = tvSource === "Live TV" || tvSource === "Guide";
  const tvStatusLabel = device.isOn
    ? tvIsLive
      ? "Live TV"
      : "Quick App"
    : "TV Off";
  const tvDetailLabel = device.isOn
    ? tvIsLive
      ? `Ch ${channel}`
      : tvSource
    : "Press power to start";
  const fridgeTemp = clamp(device.tempC ?? 4, 1, 8);
  const freezerTemp = clamp(device.freezerTempC ?? -18, -24, -12);
  const fridgeMode = device.fridgeMode ?? "normal";
  const fridgeDoorOpen = device.fridgeDoorOpen ?? false;
  const fridgeDoorAlarm = device.fridgeDoorAlarm ?? true;
  const fridgeIceMaker = device.fridgeIceMaker ?? true;
  const fridgeQuickCool = device.fridgeQuickCool ?? false;
  const fridgeQuickFreeze = device.fridgeQuickFreeze ?? false;
  const fridgeEnergySaver = device.fridgeEnergySaver ?? true;
  const fridgeFilterLife = clamp(device.fridgeFilterLife ?? 100, 0, 100);
  const fridgeHumidity = clamp(device.fridgeHumidity ?? 50, 30, 70);
  const fanSpeed = clamp(device.speed ?? 50, 0, 100);
  const fanOscillation = device.fanOscillation ?? true;
  const fanDirection = device.fanDirection ?? "forward";
  const fanTimerMin = clamp(device.fanTimerMin ?? 0, 0, 240);
  const fanAutoMode = device.fanAutoMode ?? false;
  const fanLightOn = device.fanLightOn ?? true;
  const fanSleepMode = device.fanSleepMode ?? false;
  const isOpenable = ["garage", "gate", "door", "window"].includes(device.kind);
  const openPercent = isOpenable
    ? clamp(
        typeof device.openPercent === "number"
          ? device.openPercent
          : device.isOn
            ? 100
            : 0,
        0,
        100,
      )
    : 0;
  const gateAutoOpen = gateDevice?.autoOpenEnabled ?? false;
  const stoveLevel = clamp(device.burnerLevel ?? 0, 0, 10);
  const stoveMode = device.stoveMode ?? "simmer";
  const stoveTimer = clamp(device.stoveTimerMin ?? 0, 0, 120);
  const stoveLock = device.stoveLock ?? false;
  const washerProgress = clamp(device.progress ?? 0, 0, 100);
  const washTemp = device.washTemp ?? "Warm";
  const spinSpeed = clamp(device.spinSpeedRpm ?? 1000, 600, 1400);
  const soilLevel = device.soilLevel ?? "Normal";
  const heatLevel = device.heatLevel ?? "Med";
  const drynessLevel = device.drynessLevel ?? "Dry";
  const loadSize = device.loadSize ?? "Medium";
  const rinseCount = Math.min(
    3,
    Math.max(1, device.rinseCount ?? 2),
  ) as 1 | 2 | 3;
  const prewash = device.prewash ?? false;
  const steamWash = device.steamWash ?? false;
  const sanitizeWash = device.sanitizeWash ?? false;
  const smartDispense = device.smartDispense ?? false;
  const extraSpin = device.extraSpin ?? false;
  const ecoWash = device.ecoWash ?? false;
  const sensorDry = device.sensorDry ?? true;
  const wrinkleGuard = device.wrinkleGuard ?? false;
  const steamRefresh = device.steamRefresh ?? false;
  const ecoDry = device.ecoDry ?? false;
  const airFluff = device.airFluff ?? false;
  const coolDown = device.coolDown ?? true;
  const lintFilterOk = device.lintFilterOk ?? true;
  const antiStatic = device.antiStatic ?? false;
  const coffeeStrength = device.coffeeStrength ?? "normal";
  const coffeeSizeOz = clamp(device.coffeeSizeOz ?? 8, 4, 16);
  const coffeeTempC = clamp(device.coffeeTempC ?? 92, 80, 98);
  const coffeeKeepWarmMin = clamp(device.coffeeKeepWarmMin ?? 20, 0, 60);
  const coffeeCupCount = clamp(device.coffeeCupCount ?? 2, 1, 6);
  const coffeeGrinder = device.coffeeGrinder ?? true;
  const coffeeMilkFrother = device.coffeeMilkFrother ?? false;
  const coffeeWaterLevel = clamp(device.coffeeWaterLevel ?? 70, 0, 100);
  const coffeeBeanLevel = clamp(device.coffeeBeanLevel ?? 55, 0, 100);
  const coffeeDescaleNeeded = device.coffeeDescaleNeeded ?? false;
  const coffeeAutoBrewTime = device.coffeeAutoBrewTime ?? "07:00";
  const coffeeStrengthLabel =
    coffeeStrength === "mild"
      ? "Mild"
      : coffeeStrength === "strong"
        ? "Strong"
        : "Normal";
  const coffeeWaterProgress = Math.min(
    Math.max(coffeeWaterLevel / 100, 0),
    1,
  );
  const coffeeAutoBrewActive = Boolean(coffeeAutoBrewTime);
  const laundryCycles =
    device.kind === "dryer"
      ? ["Normal", "Quick", "Delicate", "Bedding", "Towels", "Air Fluff"]
      : ["Normal", "Quick", "Delicate", "Bedding", "Eco"];
  const stoveModeOptions: Array<{
    label: string;
    value: NonNullable<Device["stoveMode"]>;
  }> = [
    { label: "Simmer", value: "simmer" },
    { label: "Boil", value: "boil" },
    { label: "Sear", value: "sear" },
    { label: "Keep Warm", value: "keep-warm" },
  ];
  const washTempOptions: Array<NonNullable<Device["washTemp"]>> = [
    "Cold",
    "Warm",
    "Hot",
  ];
  const soilLevelOptions: Array<NonNullable<Device["soilLevel"]>> = [
    "Light",
    "Normal",
    "Heavy",
  ];
  const heatLevelOptions: Array<NonNullable<Device["heatLevel"]>> = [
    "Low",
    "Med",
    "High",
  ];
  const drynessOptions: Array<NonNullable<Device["drynessLevel"]>> = [
    "Damp",
    "Dry",
    "Extra",
  ];
  const microwaveModeOptions: Array<NonNullable<Device["microwaveMode"]>> = [
    "Reheat",
    "Defrost",
    "Grill",
    "Popcorn",
  ];
  const washerPhaseNotice =
    washerProgress >= 100
      ? "Done"
      : washerProgress >= 70
        ? "Spinning"
        : washerProgress >= 40
          ? "Rinsing"
          : washerProgress > 0 || device.isOn
            ? "Washing"
            : "Ready";
  const dryerPhaseNotice =
    washerProgress >= 100
      ? "Done"
      : washerProgress >= 85
        ? "Cooling"
        : washerProgress > 0 || device.isOn
          ? "Drying"
          : "Ready";
  const laundryPhaseNotice =
    device.kind === "dryer" ? dryerPhaseNotice : washerPhaseNotice;
  const laundryOverlayLabel =
    laundryPhaseNotice === "Ready" || laundryPhaseNotice === "Done"
      ? ""
      : laundryPhaseNotice;
  const showLaundryNotice = laundryPhaseNotice !== "Ready";
  const laundryNoticeLabel =
    laundryPhaseNotice === "Done"
      ? "Cycle complete"
      : device.isOn
        ? `${laundryPhaseNotice} in progress`
        : `${laundryPhaseNotice} paused`;
  const laundryStatus =
    device.isOn || washerProgress > 0 ? (device.isOn ? "Running" : "Paused") : "";
  const laundryBadge = device.stackPosition
    ? `Stack ${device.stackPosition === "top" ? "Top" : "Bottom"}`
    : device.kind === "dryer"
      ? "Dryer"
      : "Washer";
  const laundryCycleLabel = device.cycle ?? "Normal";
  const washerCycleMinutes: Record<string, number> = {
    Normal: 45,
    Quick: 25,
    Delicate: 35,
    Bedding: 60,
    Eco: 55,
  };
  const dryerCycleMinutes: Record<string, number> = {
    Normal: 50,
    Quick: 30,
    Delicate: 40,
    Bedding: 65,
    Towels: 70,
    "Air Fluff": 20,
  };
  const washerCycleBase = washerCycleMinutes[laundryCycleLabel] ?? 45;
  const dryerCycleBase = dryerCycleMinutes[laundryCycleLabel] ?? 45;
  const washerAdjustMinutes =
    (loadSize === "Small" ? -6 : loadSize === "Large" ? 8 : 0) +
    (washTemp === "Cold" ? -4 : washTemp === "Hot" ? 6 : 0) +
    (soilLevel === "Light" ? -4 : soilLevel === "Heavy" ? 8 : 0) +
    (spinSpeed <= 800 ? -2 : spinSpeed >= 1200 ? 2 : 0) +
    (rinseCount - 1) * 4 +
    (prewash ? 10 : 0) +
    (steamWash ? 12 : 0) +
    (sanitizeWash ? 12 : 0) +
    (smartDispense ? 3 : 0) +
    (extraSpin ? 8 : 0) +
    (ecoWash ? 6 : 0);
  const dryerAdjustMinutes =
    (heatLevel === "Low" ? 10 : heatLevel === "High" ? -6 : 0) +
    (drynessLevel === "Damp" ? -6 : drynessLevel === "Extra" ? 10 : 0) +
    (sensorDry ? -5 : 0) +
    (wrinkleGuard ? 8 : 0) +
    (steamRefresh ? 10 : 0) +
    (ecoDry ? 8 : 0) +
    (airFluff ? 6 : 0) +
    (coolDown ? 5 : 0) +
    (!lintFilterOk ? 6 : 0) +
    (antiStatic ? 4 : 0);
  const laundryBaseMin =
    device.kind === "dryer" ? dryerCycleBase : washerCycleBase;
  const laundryTotalMin = clamp(
    laundryBaseMin +
      (device.kind === "dryer" ? dryerAdjustMinutes : washerAdjustMinutes),
    15,
    180,
  );
  const laundryRemainingMin = Math.max(
    0,
    Math.round(laundryTotalMin * (1 - washerProgress / 100)),
  );
  const laundryTimeLabel =
    washerProgress >= 100
      ? "Done"
      : device.isOn || washerProgress > 0
        ? `${laundryRemainingMin} min left`
        : `Preset ${laundryTotalMin} min`;
  const laundryStats =
    device.kind === "dryer"
      ? [
          { label: "Heat", value: heatLevel },
          { label: "Dry", value: drynessLevel },
          { label: "Cool", value: coolDown ? "On" : "Off" },
        ]
      : [
          { label: "Temp", value: washTemp },
          { label: "Spin", value: `${spinSpeed} rpm` },
          { label: "Load", value: loadSize },
        ];
  const laundryHeroCardStyle: StyleProp<ViewStyle> = [
    styles.laundryHeroCard,
    { padding: laundryHeroPad, borderRadius: controlCardRadius + 6 },
  ];
  const laundryHeroHeaderStyle: StyleProp<ViewStyle> = [
    styles.laundryHeroHeader,
    !laundryStatus && styles.laundryHeroHeaderSolo,
  ];
  const laundryHeroStatusPillStyle: StyleProp<ViewStyle> = [
    styles.laundryHeroStatusPill,
    {
      height: laundryBadgeHeight,
      borderRadius: Math.round(laundryBadgeHeight / 2),
    },
    device.isOn && styles.laundryHeroStatusPillActive,
  ];
  const laundryHeroStatusTextStyle: StyleProp<TextStyle> = [
    styles.laundryHeroStatusText,
    { fontSize: laundryStatusSize },
    device.isOn && styles.laundryHeroStatusTextActive,
  ];
  const laundryHeroBadgeStyle: StyleProp<ViewStyle> = [
    styles.laundryHeroBadge,
    {
      height: laundryBadgeHeight,
      borderRadius: Math.round(laundryBadgeHeight / 2),
    },
  ];
  const laundryHeroBadgeTextStyle: StyleProp<TextStyle> = [
    styles.laundryHeroBadgeText,
    { fontSize: laundryBadgeTextSize },
  ];
  const laundryNoticeTextStyle: StyleProp<TextStyle> = [
    styles.laundryNoticeText,
    laundryPhaseNotice === "Done" && styles.laundryNoticeTextDone,
  ];
  const laundryHeroBodyStyle: StyleProp<ViewStyle> = [
    styles.laundryHeroBody,
    {
      flexDirection: isTablet || isLandscape ? "row" : "column",
      alignItems: "center",
      gap: laundryHeroGap,
    },
    isLandscape && { justifyContent: "center" },
  ];
  const laundryHeroLottieWrapStyle: StyleProp<ViewStyle> = [
    styles.laundryHeroLottieWrap,
    {
      width: laundryHeroSize,
      height: laundryHeroSize,
      borderRadius: laundryHeroRadius,
    },
  ];
  const laundryHeroLottieStyle: StyleProp<ViewStyle> = [
    styles.laundryHeroLottie,
    { transform: [{ scale: laundryLottieScale }] },
  ];
  const laundryHeroPhaseStyle: StyleProp<TextStyle> = [
    styles.laundryHeroPhase,
    { fontSize: laundryHeroLabelSize },
  ];
  const laundryHeroInfoStyle: StyleProp<ViewStyle> = [
    styles.laundryHeroInfo,
    {
      alignItems: isTablet || isLandscape ? "flex-start" : "center",
      alignSelf: isTablet || isLandscape ? "auto" : "stretch",
    },
  ];
  const laundryHeroLeftColumnStyle: StyleProp<ViewStyle> = [
    styles.laundryHeroLeftColumn,
    { width: laundryHeroSize },
  ];
  const laundryHeroStackStyle: StyleProp<ViewStyle> = [
    styles.laundryHeroStack,
    isLandscape && { marginTop: Math.max(10, Math.round(laundryHeroGap * 0.6)) },
  ];
  const laundryCycleTextStyle: StyleProp<TextStyle> = [
    styles.laundryCycleText,
    { fontSize: laundryCycleSize },
    isLandscape && styles.laundryHeroCenterText,
  ];
  const laundryCycleSubTextStyle: StyleProp<TextStyle> = [
    styles.laundryCycleSubText,
    { fontSize: laundryCycleSubSize },
    isLandscape && styles.laundryHeroCenterText,
  ];
  const laundryProgressTrackStyle: StyleProp<ViewStyle> = [
    styles.laundryProgressTrack,
    { height: laundryProgressHeight },
    isLandscape && { marginTop: Math.max(12, Math.round(laundryHeroGap * 0.6)) },
  ];
  const laundryProgressFillStyle: StyleProp<ViewStyle> = [
    styles.laundryProgressFill,
    {
      width: `${washerProgress}%`,
      opacity: device.isOn || washerProgress > 0 ? 1 : 0.45,
    },
  ];
  const laundryStatsRowStyle: StyleProp<ViewStyle> = [
    styles.laundryStatsRow,
    { gap: laundryStatGap },
  ];
  const laundryHeroMetricsStyle: StyleProp<ViewStyle> = [
    laundryStatsRowStyle,
    styles.laundryHeroMetrics,
    isLandscape && {
      justifyContent: "center",
      alignItems: "center",
      alignContent: "center",
      alignSelf: "center",
      flexWrap: "nowrap",
      gap: Math.max(8, Math.round(laundryStatGap * 0.7)),
      marginTop: Math.max(14, Math.round(laundryHeroGap * 0.75)),
    },
  ];
  const laundryStatValueStyle: StyleProp<TextStyle> = [
    styles.laundryStatValue,
    { fontSize: laundryStatValueSize },
  ];
  const laundryStatLabelStyle: StyleProp<TextStyle> = [
    styles.laundryStatLabel,
    { fontSize: laundryStatLabelSize },
  ];
  const microwaveSeconds = clamp(device.timeRemainingSec ?? 0, 0, 1800);
  const microwavePower = clamp(device.microwavePower ?? 6, 1, 10);
  const microwaveMode = device.microwaveMode ?? "Reheat";
  const sprinklerDuration = clamp(device.durationMin ?? 15, 0, 60);
  const vacuumStatus = device.status ?? "docked";
  const vacuumStatusLabel =
    vacuumStatus === "cleaning"
      ? "Cleaning"
      : vacuumStatus === "paused"
        ? "Paused"
        : "Docked";
  const vacuumBattery = clamp(device.battery ?? 0, 0, 100);
  const vacuumSuction = clamp(device.vacuumSuction ?? 70, 0, 100);
  const vacuumMode = device.vacuumMode ?? "auto";
  const vacuumMop = device.vacuumMop ?? false;
  const vacuumQuietMode = device.vacuumQuietMode ?? false;
  const vacuumBinFull = device.vacuumBinFull ?? false;
  const vacuumBrushDirty = device.vacuumBrushDirty ?? false;
  const vacuumFilterLife = clamp(device.vacuumFilterLife ?? 100, 0, 100);
  const vacuumAreaM2 = clamp(device.vacuumAreaM2 ?? 0, 0, 300);
  const vacuumRuntimeMin = clamp(device.vacuumRuntimeMin ?? 0, 0, 240);
  const speakerVolume = clamp(device.volume ?? 20, 0, 100);
  const speakerSource = device.speakerSource ?? "Bluetooth";
  const speakerPreset = device.speakerPreset ?? "Flat";
  const speakerBass = clamp(device.bass ?? 50, 0, 100);
  const speakerTreble = clamp(device.treble ?? 50, 0, 100);
  const speakerSpatial = device.spatialAudio ?? false;
  const speakerParty = device.partyMode ?? false;
  const speakerNight = device.nightMode ?? false;
  const speakerMic = device.micEnabled ?? true;
  const speakerAssistant = device.voiceAssistantEnabled ?? true;
  const speakerShuffle = device.shuffle ?? false;
  const speakerRepeat = device.repeat ?? "off";
  const speakerTrackTitle = device.trackTitle ?? "Now playing";
  const speakerTrackArtist = device.trackArtist ?? "Unknown artist";
  const speakerTrackAlbum = device.trackAlbum ?? speakerSource;
  const speakerTrackDuration = device.trackDurationSec ?? 0;
  const speakerTrackProgress = clamp(
    device.trackProgressSec ?? 0,
    0,
    speakerTrackDuration || 0,
  );
  const speakerTrackProgressPct =
    speakerTrackDuration > 0 ? speakerTrackProgress / speakerTrackDuration : 0;
  const energyPower = device.powerW ?? 0;
  const energyToday = device.energyTodayKwh ?? 0;
  const energyPeak = device.energyPeakW ?? 0;
  const energyMonth = device.energyMonthKwh ?? 0;
  const energyCostToday = device.energyCostToday ?? 0;
  const energyBudget = device.energyBudgetKwh ?? 0;
  const energyBudgetProgress =
    energyBudget > 0
      ? Math.min(Math.max(energyMonth / energyBudget, 0), 1)
      : 0;
  const gridAvailable = device.gridAvailable ?? true;
  const gridOutageAlerts = device.gridOutageAlerts ?? true;
  const solarW = device.solarW ?? 0;
  const solarToday = device.solarTodayKwh ?? 0;
  const solarActive = solarW > 0 || solarToday > 0;
  const gridToday =
    device.gridTodayKwh ??
    Math.max(0, +Math.max(energyToday - solarToday, 0).toFixed(1));
  const powerOutage = !gridAvailable;
  const waterFlow = device.waterLpm ?? 0;
  const waterToday = device.waterTodayL ?? 0;
  const waterPressure = device.waterPressurePsi ?? 0;
  const waterPressureLow = device.waterPressureLowPsi ?? 40;
  const waterPressureHigh = device.waterPressureHighPsi ?? 80;
  const waterTemp = device.waterTempC ?? 0;
  const waterLeakDetected = device.waterLeakDetected ?? false;
  const waterLeakAlerts = device.waterLeakAlerts ?? true;
  const waterPressureAlerts = device.waterPressureAlerts ?? true;
  const waterAutoShutoff = device.waterAutoShutoff ?? false;
  const waterBudget = device.waterBudgetL ?? 0;
  const waterBudgetProgress =
    waterBudget > 0
      ? Math.min(Math.max(waterToday / waterBudget, 0), 1)
      : 0;
  const waterBudgetExceeded = waterBudget > 0 && waterToday >= waterBudget;
  const lowPressure =
    waterPressureAlerts &&
    waterPressure > 0 &&
    waterPressure < waterPressureLow;
  const highPressure =
    waterPressureAlerts &&
    waterPressureHigh > 0 &&
    waterPressure > waterPressureHigh;
  const nightVision = device.nightVision ?? false;
  const motionAlerts = device.motionAlerts ?? true;
  const motionSensitivity = clamp(device.motionSensitivity ?? 6, 1, 10);
  const micMuted = device.micMuted ?? false;
  const twoWayAudio = device.twoWayAudio ?? true;
  const smokeDetected = device.smokeDetected ?? false;
  const coDetected = device.coDetected ?? false;
  const coPpm = clamp(device.coPpm ?? 0, 0, 400);
  const smokePpm = clamp(device.smokePpm ?? 0, 0, 200);
  const smokeBattery = clamp(device.smokeBattery ?? 0, 0, 100);
  const smokeSensorStatus = device.smokeSensorStatus ?? "ok";
  const smokeSilenced = device.smokeSilenced ?? false;
  const smokeLastTestAt = device.smokeLastTestAt ?? null;
  const smokeLastAlarmAt = device.smokeLastAlarmAt ?? null;
  const airQuality = device.airQualityIndex ?? 0;
  const humidity = device.humidity ?? 0;
  const airPm25 = device.airPm25 ?? 0;
  const airPm10 = device.airPm10 ?? 0;
  const airCo2 = device.airCo2 ?? 0;
  const airVoc = device.airVoc ?? 0;
  const airFormaldehyde = device.airFormaldehyde ?? 0;
  const airPollen = device.airPollen ?? 0;
  const airConfidence = clamp(device.airQualityConfidence ?? 92, 0, 100);
  const airPurifierMode = device.airPurifierMode ?? "auto";
  const airPurifierSpeed = clamp(device.airPurifierSpeed ?? 40, 0, 100);
  const airIonizerEnabled = device.airIonizerEnabled ?? false;
  const airFilterLife = clamp(device.airFilterLife ?? 100, 0, 100);
  const airFilterDaysLeft = clamp(device.airFilterDaysLeft ?? 0, 0, 365);
  const airAutoVentilation = device.airAutoVentilation ?? false;
  const airAlertsEnabled = device.airAlertsEnabled ?? true;
  const airAlertAqi = clamp(device.airAlertAqi ?? 100, 50, 200);
  const airAlertCo2 = clamp(device.airAlertCo2 ?? 1200, 600, 2000);
  const airAlertVoc = clamp(device.airAlertVoc ?? 300, 80, 800);
  const airAlertPm25 = clamp(device.airAlertPm25 ?? 35, 10, 120);
  const airAlertPm10 = clamp(device.airAlertPm10 ?? 50, 20, 160);
  const airAlertPollen = clamp(device.airAlertPollen ?? 3, 1, 5);
  const airOutdoorAqi = device.airOutdoorAqi ?? 0;
  const airOutdoorPm25 = device.airOutdoorPm25 ?? 0;
  const airOutdoorCo2 = device.airOutdoorCo2 ?? 0;
  const airOutdoorVoc = device.airOutdoorVoc ?? 0;
  const airOutdoorHumidity = device.airOutdoorHumidity ?? 0;
  const airOutdoorTempC =
    typeof device.airOutdoorTempC === "number"
      ? device.airOutdoorTempC
      : outdoor.tempC;
  const airHistory = Array.isArray(device.airHistory) ? device.airHistory : [];
  const airBand = resolveAirBand(airQuality);
  const airSeries = useMemo(() => {
    if (airHistory.length >= 2) {
      return buildAirSeries(airHistory, airQuality);
    }
    const now = Date.now();
    return Array.from({ length: AIR_CHART_MIN_POINTS }, (_, idx) => ({
      ts: now - (AIR_CHART_MIN_POINTS - 1 - idx) * 30 * 60 * 1000,
      aqi: airQuality,
    }));
  }, [airHistory, airQuality]);
  const airSeriesAqi = airSeries.map(
    (sample) => sample.aqi ?? airQuality ?? 0,
  );
  const airChartMax = Math.max(...airSeriesAqi, 1);
  const airTrendDelta =
    airSeriesAqi.length > 1
      ? airSeriesAqi[airSeriesAqi.length - 1] -
        airSeriesAqi[airSeriesAqi.length - 2]
      : 0;
  const airLastUpdatedAt =
    device.airLastUpdatedAt ?? airSeries[airSeries.length - 1]?.ts ?? null;
  const airRecommendations = useMemo(() => {
    const items: string[] = [];
    if (airQuality >= 120) {
      items.push("Run purifier on Boost mode.");
    } else if (airQuality >= 80) {
      items.push("Keep purifier on Auto to stabilize AQI.");
    }
    if (airCo2 >= 1000) {
      items.push("Increase ventilation to reduce CO2.");
    }
    if (airVoc >= 220) {
      items.push("Avoid aerosols and enable exhaust fans.");
    }
    if (humidity >= 60) {
      items.push("Humidity is high. Consider dehumidifying.");
    }
    if (humidity > 0 && humidity < 35) {
      items.push("Air is dry. Consider humidifying.");
    }
    if (airPollen >= 3) {
      items.push("High pollen: keep windows closed.");
    }
    if (airFilterLife <= 20) {
      items.push("Filter life low. Replace soon.");
    }
    if (!items.length) {
      items.push("Air quality looks great. Maintain Auto mode.");
    }
    return items.slice(0, 4);
  }, [airQuality, airCo2, airVoc, airPollen, airFilterLife, humidity]);
  const airSensors = useMemo(
    () => devicesAll.filter((item) => item.kind === "air"),
    [devicesAll],
  );
  const roomLookup = useMemo(
    () => new Map(rooms.map((room) => [room.id, room.name])),
    [rooms],
  );
  const formatMetric = (
    value: number | null | undefined,
    unit?: string,
    digits = 0,
  ) => {
    if (value == null || Number.isNaN(value)) return "--";
    const formatted = digits
      ? value.toFixed(digits)
      : Math.round(value).toString();
    return unit ? `${formatted} ${unit}` : formatted;
  };
  const airMetricWidth = isTablet ? "23%" : "31%";
  const airTrendIcon =
    airTrendDelta > 2 ? "trending-up" : airTrendDelta < -2 ? "trending-down" : "remove";
  const airTrendLabel = `${airTrendDelta >= 0 ? "+" : ""}${Math.round(
    airTrendDelta,
  )}`;
  const heaterTemp = clamp(device.tempC ?? 52, 40, 70);
  const heaterType = device.waterHeaterType ?? "electric-tank";
  const heaterMode = device.heaterMode ?? "eco";
  const heaterRecirculation = device.recirculation ?? false;
  const heaterScheduleEnabled = device.heaterScheduleEnabled ?? true;
  const heaterSanitize = device.antiLegionella ?? false;
  const heaterVacationDays = clamp(device.vacationDays ?? 0, 0, 30);
  const heaterStatus = device.isOn ? "Heating" : "Standby";
  const showRecirculation =
    heaterType === "tankless" || heaterType === "heat-pump";
  const heaterTypeOptions: Array<{
    label: string;
    value: NonNullable<Device["waterHeaterType"]>;
  }> =
    [
      { label: "Electric Tank", value: "electric-tank" },
      { label: "Gas Tank", value: "gas-tank" },
      { label: "Heat Pump", value: "heat-pump" },
      { label: "Tankless", value: "tankless" },
    ];
  const heaterModeOptions: Array<{
    label: string;
    value: NonNullable<Device["heaterMode"]>;
  }> =
    heaterType === "heat-pump"
      ? [
          { label: "Eco", value: "eco" },
          { label: "Heat Pump", value: "standard" },
          { label: "High Demand", value: "boost" },
          { label: "Vacation", value: "vacation" },
        ]
      : heaterType === "tankless"
        ? [
            { label: "Eco", value: "eco" },
            { label: "Comfort", value: "standard" },
            { label: "Turbo", value: "boost" },
            { label: "Vacation", value: "vacation" },
          ]
        : [
            { label: "Eco", value: "eco" },
            { label: "Standard", value: "standard" },
            { label: "Boost", value: "boost" },
            { label: "Vacation", value: "vacation" },
          ];
  const isLaundry = device.kind === "washer" || device.kind === "dryer";
  const stackPartnerKind =
    device.kind === "washer"
      ? "dryer"
      : device.kind === "dryer"
        ? "washer"
        : null;
  const [draftRoomId, setDraftRoomId] = useState(device.roomId);
  const [stackEnabled, setStackEnabled] = useState(false);
  const [stackTargetId, setStackTargetId] = useState<string | null>(null);
  const stackCandidates = useMemo(() => {
    if (!stackPartnerKind) return [];
    return devicesAll.filter(
      (d) =>
        d.id !== device.id &&
        d.kind === stackPartnerKind &&
        d.roomId === draftRoomId,
    );
  }, [devicesAll, device.id, draftRoomId, stackPartnerKind]);
  const currentStackPartner = useMemo(() => {
    if (!device.stackId) return null;
    return (
      devicesAll.find(
        (d) => d.id !== device.id && d.stackId === device.stackId,
      ) ?? null
    );
  }, [devicesAll, device.id, device.stackId]);
  const canStackSave = !isLaundry || !stackEnabled || Boolean(stackTargetId);
  const formatClock = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };
  const formatTrackTime = (sec?: number) => {
    if (sec == null || !Number.isFinite(sec) || sec < 0) return "--:--";
    return formatClock(sec);
  };
  const sendPatch = (patch: Partial<Device>) => {
    deviceClient
      .sendCommand({ op: "patch", deviceId: device.id, patch })
      .catch(() => {});
  };
  const renderAirAlertSlider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    valueText: string,
    onChange: (value: number) => void,
  ) => {
    const pct =
      max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
    const trackFillStyle: StyleProp<ViewStyle> = [
      styles.airAlertTrackFill,
      { width: `${Math.round(pct * 100)}%` },
    ];
    return (
      <View style={styles.airAlertSliderBlock}>
        <View style={styles.airAlertSliderRow}>
          <Text style={styles.airAlertSliderLabel}>{label}</Text>
          <Text style={styles.airAlertSliderValue}>{valueText}</Text>
        </View>
        <View style={styles.airAlertSliderWrap}>
          <View style={styles.airAlertTrack}>
            <View style={trackFillStyle} />
          </View>
          <Slider
            value={value}
            minimumValue={min}
            maximumValue={max}
            step={step}
            onSlidingComplete={onChange}
            minimumTrackTintColor="transparent"
            maximumTrackTintColor="transparent"
            thumbTintColor="rgba(255,255,255,0.92)"
            style={styles.airAlertSlider}
          />
        </View>
      </View>
    );
  };
  const setOpenTarget = (target: number) => {
    sendPatch({
      openPercent: target,
      isOn: target > 0,
      openLastActor: activeHouseholdMember?.name ?? "Unknown",
    });
  };
  const handlePowerToggle = () => {
    if (isOpenable) {
      setOpenTarget(openPercent > 0 ? 0 : 100);
      return;
    }
    const nextOn = !device.isOn;
    if (device.kind === "tv") {
      const patch: Partial<Device> = { isOn: nextOn };
      if (nextOn) {
        patch.source = device.source ?? "Live TV";
        patch.channel = device.channel ?? 1;
      }
      deviceClient
        .sendCommand({ op: "patch", deviceId: device.id, patch })
        .catch(() => {});
      return;
    }
    deviceClient
      .sendCommand({
        op: "patch",
        deviceId: device.id,
        patch: { isOn: nextOn },
      })
      .catch(() => {});
  };
  const hasCustom = [
    "light",
    "garage",
    "gate",
    "door",
    "fridge",
    "fan",
    "window",
    "vacuum",
    "camera",
    "stove",
    "washer",
    "dryer",
    "microwave",
    "energy",
    "water",
    "water-heater",
    "air",
    "sprinkler",
    "speaker",
    "smoke",
    "tv",
    "coffee",
  ].includes(device.kind);
  const bulbScale = useRef(new Animated.Value(1)).current;
  const [openMotion, setOpenMotion] = useState<
    "opening" | "closing" | null
  >(null);
  const [openDisplayPercent, setOpenDisplayPercent] = useState(openPercent);
  const [openLastActivityAt, setOpenLastActivityAt] = useState<number | null>(
    null,
  );
  const [pressureLowDraft, setPressureLowDraft] = useState(waterPressureLow);
  const [pressureHighDraft, setPressureHighDraft] =
    useState(waterPressureHigh);
  const [speakerBassDraft, setSpeakerBassDraft] = useState(speakerBass);
  const [speakerTrebleDraft, setSpeakerTrebleDraft] = useState(speakerTreble);
  const [showEdit, setShowEdit] = useState(false);
  const [draftName, setDraftName] = useState(device.name);
  const [showSchedule, setShowSchedule] = useState(false);
  const [cameraEvents, setCameraEvents] = useState<
    Array<{ id: string; label: string; kind: "known" | "unknown"; ts: number }>
  >([]);
  const [schedHour, setSchedHour] = useState("06");
  const [schedMinute, setSchedMinute] = useState("00");
  const [schedDays, setSchedDays] = useState<
    Array<SprinklerSchedule["days"][number]>
  >(["Mon", "Wed", "Fri"]);
  const handleEditSave = () => {
    if (!draftName.trim() || !canStackSave) return;
    const basePatch: Partial<Device> = {
      name: draftName.trim(),
      roomId: draftRoomId,
    };
    if (!isLaundry) {
      sendPatch(basePatch);
      setShowEdit(false);
      return;
    }
    if (stackEnabled && stackTargetId) {
      const partner = devicesAll.find((d) => d.id === stackTargetId);
      if (partner) {
        const nextStackId =
          device.stackId ?? partner.stackId ?? `stack-${Date.now()}`;
        const clearIds = new Set<string>();
        if (
          device.stackId &&
          currentStackPartner &&
          currentStackPartner.id !== partner.id
        ) {
          devicesAll.forEach((d) => {
            if (
              d.stackId === device.stackId &&
              d.id !== device.id &&
              d.id !== partner.id
            ) {
              clearIds.add(d.id);
            }
          });
        }
        if (partner.stackId && partner.stackId !== nextStackId) {
          devicesAll.forEach((d) => {
            if (
              d.stackId === partner.stackId &&
              d.id !== partner.id &&
              d.id !== device.id
            ) {
              clearIds.add(d.id);
            }
          });
        }
        const selfPosition = device.kind === "dryer" ? "top" : "bottom";
        const partnerPosition = partner.kind === "dryer" ? "top" : "bottom";
        sendPatch({
          ...basePatch,
          stackId: nextStackId,
          stackPosition: selfPosition,
        });
        deviceClient
          .sendCommand({
            op: "patch",
            deviceId: partner.id,
            patch: {
              stackId: nextStackId,
              stackPosition: partnerPosition,
            },
          })
          .catch(() => {});
        clearIds.forEach((id) => {
          deviceClient
            .sendCommand({
              op: "patch",
              deviceId: id,
              patch: {
                stackId: undefined,
                stackPosition: undefined,
              },
            })
            .catch(() => {});
        });
      } else {
        sendPatch({
          ...basePatch,
          stackId: undefined,
          stackPosition: undefined,
        });
      }
      setShowEdit(false);
      return;
    }
    const idsToClear = new Set<string>();
    if (device.stackId) {
      devicesAll.forEach((d) => {
        if (d.stackId === device.stackId) idsToClear.add(d.id);
      });
    }
    idsToClear.add(device.id);
    idsToClear.forEach((id) => {
      if (id === device.id) {
        sendPatch({
          ...basePatch,
          stackId: undefined,
          stackPosition: undefined,
        });
        return;
      }
      deviceClient
        .sendCommand({
          op: "patch",
          deviceId: id,
          patch: {
            stackId: undefined,
            stackPosition: undefined,
          },
        })
        .catch(() => {});
    });
    setShowEdit(false);
  };
  const handleEditDelete = () => {
    removeDevice(device.id);
    setShowEdit(false);
    navigation.goBack();
  };
  const handleScheduleSave = () => {
    if (schedDays.length === 0) return;
    const h = Math.max(0, Math.min(23, parseInt(schedHour || "0", 10)));
    const m = Math.max(0, Math.min(59, parseInt(schedMinute || "0", 10)));
    const next = [
      ...(device.schedule ?? []),
      {
        id: `sch${Date.now()}`,
        hour: h,
        minute: m,
        days: schedDays,
        enabled: true,
      },
    ];
    sendPatch({ schedule: next });
    setShowSchedule(false);
  };
  const handleToggleScheduleDay = (
    day: SprinklerSchedule["days"][number],
  ) => {
    setSchedDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day],
    );
  };
  const openDisplayValue = clamp(openDisplayPercent, 0, 100);
  const openStatusLabel =
    openMotion === "opening"
      ? "Opening..."
      : openMotion === "closing"
        ? "Closing..."
        : openDisplayValue === 0
          ? "Closed"
          : openDisplayValue === 100
            ? "Open"
            : "Open";
  const openStatusText =
    openMotion
      ? `${openStatusLabel} ${openDisplayValue}%`
      : openDisplayValue === 0
        ? "Closed"
        : openDisplayValue === 100
          ? "Open"
          : `${openDisplayValue}% open`;
  const openBatteryLabel =
    typeof device.battery === "number"
      ? `${Math.round(device.battery)}%`
      : "—";
  const openLastActorLabel = device.openLastActor ?? "—";
  const openLastActivityLabel = openLastActivityAt
    ? formatTimeAgo(openLastActivityAt)
    : "—";
  const windowHeroCardStyle: StyleProp<ViewStyle> = [
    styles.windowHeroCard,
    { padding: windowHeroPad, borderRadius: controlCardRadius + 6 },
  ];
  const windowHeroPillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.windowHeroPill,
    {
      height: windowPillHeight,
      borderRadius: Math.round(windowPillHeight / 2),
    },
    active && styles.windowHeroPillActive,
  ];
  const windowHeroPillTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.windowHeroPillText,
    { fontSize: windowPillTextSize },
    active && styles.windowHeroPillTextActive,
  ];
  const windowHeroBodyStyle: StyleProp<ViewStyle> = [
    styles.windowHeroBody,
    {
      flexDirection: isTablet || isLandscape ? "row" : "column",
      alignItems: "center",
      gap: windowHeroGap,
    },
  ];
  const windowHeroOrbStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.windowHeroOrb,
    {
      width: windowHeroSize,
      height: windowHeroSize,
      borderRadius: windowHeroRadius,
    },
    !active && styles.windowHeroOrbClosed,
  ];
  const windowHeroControlsStyle: StyleProp<ViewStyle> = [
    styles.windowHeroControls,
    {
      alignItems: isTablet || isLandscape ? "stretch" : "center",
      alignSelf: isTablet || isLandscape ? "auto" : "stretch",
      width: isTablet || isLandscape ? undefined : "100%",
    },
  ];
  const windowHeroTrackFillStyle: StyleProp<ViewStyle> = [
    styles.windowHeroTrackFill,
    { width: `${openDisplayValue}%` },
  ];
  const energyHeroCardStyle: StyleProp<ViewStyle> = [
    styles.energyHeroCard,
    { padding: energyHeroPad, borderRadius: controlCardRadius + 6 },
  ];
  const energyHeroPillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.energyHeroPill,
    {
      height: energyHeroPillHeight,
      borderRadius: Math.round(energyHeroPillHeight / 2),
    },
    active && styles.energyHeroPillActive,
  ];
  const energyHeroPillTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.energyHeroPillText,
    { fontSize: energyHeroPillTextSize },
    active && styles.energyHeroPillTextActive,
  ];
  const energyHeroBodyStyle: StyleProp<ViewStyle> = [
    styles.energyHeroBody,
    {
      flexDirection: isLandscape ? "column" : isTablet ? "row" : "column",
      alignItems: "center",
      gap: energyHeroGap,
    },
  ];
  const energyHeroOrbStyle: StyleProp<ViewStyle> = [
    styles.energyHeroOrb,
    {
      width: energyHeroSize,
      height: energyHeroSize,
      borderRadius: energyHeroRadius,
    },
  ];
  const energyHeroStatValueStyle: StyleProp<TextStyle> = [
    styles.energyHeroStatValue,
    { fontSize: energyHeroStatValueSize },
  ];
  const energyHeroStatLabelStyle: StyleProp<TextStyle> = [
    styles.energyHeroStatLabel,
    { fontSize: energyHeroStatLabelSize },
  ];
  const energyHeroProgressTrackStyle: StyleProp<ViewStyle> = [
    styles.energyHeroProgressTrack,
    { height: energyHeroProgressHeight },
  ];
  const energyHeroProgressFillStyle: StyleProp<ViewStyle> = [
    styles.energyHeroProgressFill,
    { width: `${Math.round(energyBudgetProgress * 100)}%` },
  ];
  const coffeeHeroProgressFillStyle: StyleProp<ViewStyle> = [
    styles.energyHeroProgressFill,
    { width: `${Math.round(coffeeWaterProgress * 100)}%` },
  ];
  const energyHeroMetaTextStyle: StyleProp<TextStyle> = [
    styles.energyHeroMetaText,
    { fontSize: energyHeroStatLabelSize },
  ];
  const energyHeroInfoStyle: StyleProp<ViewStyle> = [
    styles.energyHeroInfo,
    isLandscape
      ? { alignItems: "stretch", alignSelf: "stretch" }
      : {
          alignItems: isTablet ? "flex-start" : "center",
          alignSelf: isTablet ? "auto" : "stretch",
        },
  ];
  const energyHeroStatsRowStyle: StyleProp<ViewStyle> = [
    styles.energyHeroStatsRow,
    isLandscape && styles.energyHeroStatsRowCentered,
  ];
  const energyHeroHeaderStyle: StyleProp<ViewStyle> = [
    styles.energyHeroHeader,
    isLandscape && styles.energyHeroHeaderStack,
  ];
  const utilityHeroCardStyle: StyleProp<ViewStyle> = [
    styles.utilityHeroCard,
    { padding: utilityHeroPad, borderRadius: controlCardRadius + 6 },
  ];
  const openHeroCardStyle: StyleProp<ViewStyle> = isLandscapeSplit
    ? [utilityHeroCardStyle, { flex: 1.08 }]
    : utilityHeroCardStyle;
  const utilityHeroPillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.utilityHeroPill,
    {
      height: utilityHeroPillHeight,
      borderRadius: Math.round(utilityHeroPillHeight / 2),
    },
    active && styles.utilityHeroPillActive,
  ];
  const utilityHeroPillTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.utilityHeroPillText,
    { fontSize: utilityHeroPillTextSize },
    active && styles.utilityHeroPillTextActive,
  ];
  const utilityHeroBodyStyle: StyleProp<ViewStyle> = [
    styles.utilityHeroBody,
    {
      flexDirection: isTablet || isLandscape ? "row" : "column",
      alignItems: "center",
      gap: utilityHeroGap,
    },
  ];
  const utilityHeroOrbStyle: StyleProp<ViewStyle> = [
    styles.utilityHeroOrb,
    {
      width: utilityHeroSize,
      height: utilityHeroSize,
      borderRadius: utilityHeroRadius,
    },
  ];
  const smokeHeroOrbStyle: StyleProp<ViewStyle> = [
    styles.utilityHeroOrb,
    {
      width: smokeHeroSize,
      height: smokeHeroSize,
      borderRadius: smokeHeroRadius,
    },
  ];
  const garageHeroOrbStyle: StyleProp<ViewStyle> = [
    styles.utilityHeroOrb,
    {
      width: garageHeroSize,
      height: garageHeroSize,
      borderRadius: garageHeroRadius,
    },
  ];
  const doorHeroOrbStyle: StyleProp<ViewStyle> = [
    styles.utilityHeroOrb,
    {
      width: doorHeroSize,
      height: doorHeroSize,
      borderRadius: doorHeroRadius,
    },
  ];
  const utilityHeroInfoStyle: StyleProp<ViewStyle> = [
    styles.utilityHeroInfo,
    {
      alignItems: isTablet || isLandscape ? "flex-start" : "center",
      alignSelf: isTablet || isLandscape ? "auto" : "stretch",
    },
  ];
  const vacuumHeroBodyStyle: StyleProp<ViewStyle> = [
    styles.utilityHeroBody,
    {
      flexDirection: isLandscape ? "column" : isTablet ? "row" : "column",
      alignItems: "center",
      gap: utilityHeroGap,
    },
  ];
  const vacuumHeroInfoStyle: StyleProp<ViewStyle> = [
    styles.utilityHeroInfo,
    isLandscape
      ? { alignItems: "center", alignSelf: "stretch" }
      : {
          alignItems: isTablet ? "flex-start" : "center",
          alignSelf: isTablet ? "auto" : "stretch",
        },
  ];
  const coffeeHeroCupStyle: StyleProp<ViewStyle> = [
    styles.coffeeCup,
    {
      width: coffeeHeroCupSize,
      height: coffeeHeroCupSize,
      borderRadius: coffeeHeroCupRadius,
    },
  ];
  const coffeeHeroNameStyle: StyleProp<TextStyle> = [
    styles.coffeeName,
    { fontSize: Math.round((isTablet ? 15 : 13) * scale) },
  ];
  const coffeeHeroRoomStyle: StyleProp<TextStyle> = [
    styles.coffeeRoom,
    { fontSize: Math.round((isTablet ? 12 : 11) * scale) },
  ];
  const utilityHeroActionRowStyle: StyleProp<ViewStyle> = [
    styles.actionRow,
    styles.utilityHeroActionRow,
    (isTablet || isLandscape) && styles.utilityHeroActionRowLeft,
  ];
  const utilityHeroMetricRowStyle: StyleProp<ViewStyle> = [
    styles.metricRow,
    styles.utilityHeroMetricRow,
    (isTablet || isLandscape) && styles.utilityHeroMetricRowLeft,
  ];
  const garageActionRowStyle: StyleProp<ViewStyle> = [
    styles.actionRow,
    styles.utilityHeroActionRow,
    { marginTop: 0, paddingHorizontal: 0, justifyContent: "center" },
  ];
  const doorActionRowStyle: StyleProp<ViewStyle> = [
    styles.actionRow,
    styles.utilityHeroActionRow,
    { marginTop: 0, paddingHorizontal: 0, justifyContent: "center" },
  ];
  const garageHeroBodyStyle: StyleProp<ViewStyle> = [
    utilityHeroBodyStyle,
    isLandscapeSplit && { flex: 1, justifyContent: "center" },
  ];
  const openHeroBodyPortraitStyle: StyleProp<ViewStyle> = [
    styles.utilityHeroBody,
    {
      flexDirection: "column",
      alignItems: "center",
      gap: Math.max(12, Math.round(utilityHeroGap * 0.7)),
    },
  ];
  const openPortraitMetaRowStyle: StyleProp<ViewStyle> = [
    styles.metricRow,
    {
      marginTop: Math.max(10, Math.round(utilityHeroGap * 0.6)),
      justifyContent: "center",
      alignSelf: "stretch",
    },
  ];
  const openPortraitActionRowStyle: StyleProp<ViewStyle> = [
    styles.actionRow,
    styles.utilityHeroActionRow,
    {
      marginTop: Math.max(14, Math.round(utilityHeroGap * 0.9)),
      paddingHorizontal: 0,
      justifyContent: "center",
    },
  ];
  const doorHeroBodyStyle: StyleProp<ViewStyle> = [
    utilityHeroBodyStyle,
    isLandscapeSplit && { flex: 1, justifyContent: "center" },
  ];
  const smokeHeroBodyStyle: StyleProp<ViewStyle> = [
    styles.utilityHeroBody,
    {
      flexDirection: "column",
      alignItems: "center",
      gap: utilityHeroGap,
    },
  ];
  const smokeHeroMetricRowStyle: StyleProp<ViewStyle> = [
    utilityHeroMetricRowStyle,
    {
      marginTop: 0,
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "stretch",
    },
  ];
  const smokeHeroActionRowStyle: StyleProp<ViewStyle> = [
    utilityHeroActionRowStyle,
    {
      marginTop: 0,
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "stretch",
    },
  ];
  const coffeeHeroActionRowStyle: StyleProp<ViewStyle> = [
    styles.energyHeroPillRow,
    styles.coffeeHeroActionRow,
  ];
  const coffeeHeroActionPillStyle = (active: boolean): StyleProp<ViewStyle> => [
    energyHeroPillStyle(active),
    styles.coffeeHeroActionPill,
  ];
  const energyCardGap = Math.round(16 * scale);
  const energyBudgetCardStyle: StyleProp<ViewStyle> = [
    controlCardStyle,
    isLandscape && { marginTop: 0 },
  ];
  const waterOrbStyle: StyleProp<ViewStyle> = [
    styles.waterOrb,
    {
      width: compactDialSize,
      height: compactDialSize,
      borderRadius: Math.round(compactDialSize / 2),
    },
  ];
  const airHeroCardStyle: StyleProp<ViewStyle> = [
    styles.airHeroCard,
    { padding: airHeroPad, borderRadius: controlCardRadius + 8 },
  ];
  const airHeroGlowStyle: StyleProp<ViewStyle> = [
    styles.airHeroGlow,
    { backgroundColor: airBand.color },
  ];
  const airHeroBadgeStyle: StyleProp<ViewStyle> = [
    styles.airHeroBadge,
    { borderColor: airBand.color },
  ];
  const airHeroBadgeDotStyle: StyleProp<ViewStyle> = [
    styles.airHeroBadgeDot,
    { backgroundColor: airBand.color },
  ];
  const airHeroBadgeTextStyle: StyleProp<TextStyle> = [
    styles.airHeroBadgeText,
    { fontSize: airHeroBadgeTextSize },
  ];
  const airHeroBodyStyle: StyleProp<ViewStyle> = [
    styles.airHeroBody,
    {
      flexDirection: isTablet || isLandscape ? "row" : "column",
      alignItems: isTablet || isLandscape ? "center" : "stretch",
      gap: airHeroGap,
    },
  ];
  const airHeroScoreStyle: StyleProp<ViewStyle> = [
    styles.airHeroScore,
    { alignItems: isTablet || isLandscape ? "flex-start" : "center" },
  ];
  const airHeroLabelStyle: StyleProp<TextStyle> = [
    styles.airHeroLabel,
    { fontSize: airHeroLabelSize },
  ];
  const airHeroValueStyle: StyleProp<TextStyle> = [
    styles.airHeroValue,
    { fontSize: airHeroValueSize },
  ];
  const airHeroGaugeRingStyle: StyleProp<ViewStyle> = [
    styles.airHeroGaugeRing,
    {
      width: airGaugeSize,
      height: airGaugeSize,
      borderRadius: airGaugeRadius,
      borderColor: airBand.color,
    },
  ];
  const airHeroGaugeValueStyle: StyleProp<TextStyle> = [
    styles.airHeroGaugeValue,
    { fontSize: airGaugeValueSize },
  ];
  const airHeroGaugeLabelStyle: StyleProp<TextStyle> = [
    styles.airHeroGaugeLabel,
    { fontSize: airGaugeLabelSize },
  ];
  const airTrendCardStyle: StyleProp<ViewStyle> = [
    controlCardStyle,
    styles.airTrendCard,
  ];
  const airSurfaceCardStyle: StyleProp<ViewStyle> = [
    controlCardStyle,
    styles.airSurfaceCard,
  ];
  const airTrendPillStyle: StyleProp<ViewStyle> = [
    styles.airTrendPill,
    { borderColor: airBand.color },
  ];
  const airChartBarStyle = (
    height: number,
    color: string,
    opacity: number,
  ): StyleProp<ViewStyle> => [
    styles.airChartBar,
    { height, backgroundColor: color, opacity },
  ];
  const airLegendDotStyle = (color: string): StyleProp<ViewStyle> => [
    styles.airLegendDot,
    { backgroundColor: color },
  ];
  const airMetricCardStyle: StyleProp<ViewStyle> = [
    styles.airMetricCard,
    { width: airMetricWidth },
  ];
  const airSensorRowStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.airSensorRow,
    active && styles.airSensorRowActive,
  ];
  const airSensorDotStyle = (color: string): StyleProp<ViewStyle> => [
    styles.airSensorDot,
    { backgroundColor: color },
  ];
  const scheduleToggleStyle = (enabled: boolean): StyleProp<ViewStyle> => [
    styles.scheduleToggle,
    enabled && styles.scheduleToggleActive,
  ];
  const scheduleToggleTextStyle = (enabled: boolean): StyleProp<TextStyle> => [
    styles.scheduleToggleText,
    enabled && styles.scheduleToggleTextActive,
  ];
  const infoOrbCompactStyle: StyleProp<ViewStyle> = [
    styles.infoOrb,
    {
      width: speakerOrbSize,
      height: speakerOrbSize,
      borderRadius: Math.round(speakerOrbSize / 2),
      marginBottom: 0,
    },
  ];
  const speakerCoverStyle: StyleProp<ViewStyle> = [
    styles.speakerCover,
    {
      width: speakerCoverSize,
      height: speakerCoverSize,
      borderRadius: Math.round(speakerCoverSize * 0.22),
    },
  ];
  const speakerProgressFillStyle: StyleProp<ViewStyle> = [
    styles.speakerProgressFill,
    {
      width: `${Math.round(speakerTrackProgressPct * 100)}%`,
    },
  ];
  const speakerVisualizerRowStyle: StyleProp<ViewStyle> = [
    styles.speakerVisualizerRow,
    { height: speakerBarMax },
  ];
  const speakerVisualizerBarStyle = (
    bar: Animated.Value,
  ): StyleProp<ViewStyle> => [
    styles.speakerVisualizerBar,
    {
      height: bar.interpolate({
        inputRange: [0, 1],
        outputRange: [speakerBarBase, speakerBarMax],
      }),
      opacity: device.isOn ? 1 : 0.4,
    },
  ];
  const mediaBtnStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.mediaBtn,
    active && styles.mediaBtnActive,
  ];
  const isOpen = isOpenable && openPercent > 0;
  const isClosed = isOpenable && openPercent === 0;
  const windowFlowLabel =
    openDisplayValue >= 80
      ? "Max Vent"
      : openDisplayValue >= 45
        ? "Breeze"
        : openDisplayValue > 0
          ? "Crack"
          : "Sealed";
  const windowFlowHint =
    openDisplayValue >= 80
      ? "Maximum airflow"
      : openDisplayValue >= 45
        ? "Fresh breeze"
        : openDisplayValue > 0
          ? "Light airflow"
          : "Window sealed";
  const renderOpenDeviceLottie = (source: any, size: number) => {
    const dockStyle: StyleProp<ViewStyle> = [
      styles.deviceLottieDock,
      {
        width: size,
        height: size,
        borderRadius: Math.round(size / 2),
      },
    ];
    return (
      <View style={dockStyle}>
        <AnimatedLottieView
          source={source}
          progress={openProgress}
          autoPlay={false}
          loop={false}
          resizeMode="contain"
          style={styles.deviceLottie}
        />
        <View style={styles.openStatusOverlay} pointerEvents="none">
          <Text style={styles.openStatusValue}>{openDisplayValue}%</Text>
          <Text style={styles.openStatusLabel}>{openStatusLabel}</Text>
        </View>
      </View>
    );
  };

  useEffect(() => {
    setDraftName(device.name);
    setDraftRoomId(device.roomId);
  }, [device.id, device.name, device.roomId, showEdit]);

  useEffect(() => {
    if (!showEdit) return;
    if (!isLaundry) {
      setStackEnabled(false);
      setStackTargetId(null);
      return;
    }
    setStackEnabled(Boolean(device.stackId));
    setStackTargetId(currentStackPartner?.id ?? null);
  }, [showEdit, isLaundry, device.stackId, currentStackPartner?.id]);

  useEffect(() => {
    if (!showEdit || !isLaundry || !stackEnabled) return;
    const hasTarget =
      stackTargetId && stackCandidates.some((d) => d.id === stackTargetId);
    if (hasTarget) return;
    setStackTargetId(stackCandidates[0]?.id ?? null);
  }, [showEdit, isLaundry, stackEnabled, stackTargetId, stackCandidates]);

  useEffect(() => {
    if (!showSchedule) return;
    setSchedHour("06");
    setSchedMinute("00");
    setSchedDays(["Mon", "Wed", "Fri"]);
  }, [showSchedule]);

  useEffect(() => {
    const listenerId = openProgress.addListener(({ value }) => {
      setOpenDisplayPercent(Math.round(value * 100));
    });
    return () => {
      openProgress.removeListener(listenerId);
    };
  }, [openProgress]);

  useEffect(() => {
    if (!isOpenable) {
      openDeviceIdRef.current = device.id;
      openPercentRef.current = null;
      openProgress.setValue(0);
      setOpenDisplayPercent(0);
      setOpenMotion(null);
      setOpenLastActivityAt(null);
      return;
    }

    if (openDeviceIdRef.current !== device.id) {
      openDeviceIdRef.current = device.id;
      openPercentRef.current = openPercent;
      openProgress.setValue(openPercent / 100);
      setOpenDisplayPercent(Math.round(openPercent));
      setOpenMotion(null);
      setOpenLastActivityAt(null);
      return;
    }

    const prev = openPercentRef.current;
    if (prev == null || prev === openPercent) return;

    setOpenMotion(openPercent > prev ? "opening" : "closing");
    setOpenLastActivityAt(Date.now());
    openPercentRef.current = openPercent;
    const distance = Math.abs(openPercent - prev);
    const duration = Math.max(600, Math.min(2400, Math.round(distance * 18)));

    openProgress.stopAnimation();
    Animated.timing(openProgress, {
      toValue: openPercent / 100,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        setOpenMotion(null);
      }
    });
  }, [device.id, isOpenable, openPercent, openProgress]);

  const logCameraEvent = (label: string, kind: "known" | "unknown") => {
    // Maintain a short, most-recent-first log for the UI preview.
    setCameraEvents((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          label,
          kind,
          ts: Date.now(),
        },
        ...prev,
      ].slice(0, 6),
    );
  };

  const setGateTarget = (target: number) => {
    if (device.kind === "gate") {
      setOpenTarget(target);
      return;
    }
    if (!gateDevice) return;
    deviceClient
      .sendCommand({
        op: "patch",
        deviceId: gateDevice.id,
        patch: { openPercent: target, isOn: target > 0 },
      })
      .catch(() => {});
  };

  const setPressureLow = (value: number) => {
    const nextHigh =
      waterPressureHigh > 0 && value >= waterPressureHigh
        ? Math.min(100, value + 10)
        : waterPressureHigh;
    sendPatch({
      waterPressureLowPsi: value,
      waterPressureHighPsi: nextHigh,
    });
  };

  const setPressureHigh = (value: number) => {
    const nextLow =
      waterPressureLow >= value ? Math.max(20, value - 10) : waterPressureLow;
    sendPatch({
      waterPressureHighPsi: value,
      waterPressureLowPsi: nextLow,
    });
  };

  const openGate = () => {
    setGateTarget(100);
  };

  const closeGate = () => {
    setGateTarget(0);
  };

  const handleKnownFace = (memberId: string, name: string) => {
    setHouseholdPresence(memberId, "home");
    logCameraEvent(`${name} recognized`, "known");
    // Auto-open only when a known face is detected and the gate toggle is enabled.
    if (gateDevice?.autoOpenEnabled) {
      openGate();
      logCameraEvent("Front gate auto-opened", "known");
    }
  };

  const handleUnknownFace = () => {
    logCameraEvent("Unrecognized visitor detected", "unknown");
  };

  const animateBulb = () => {
    Animated.sequence([
      Animated.timing(bulbScale, {
        toValue: 1.05,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.spring(bulbScale, { toValue: 1, useNativeDriver: true }),
    ]).start();
  };

  const animateCoffee = (on: boolean) => {
    if (device.kind !== "coffee") return;

    if (!on) {
      coffeeLoop.current?.stop();
      coffeeLoop.current = null;
      coffeeFill.stopAnimation();
      Animated.timing(coffeeFill, {
        toValue: 0,
        duration: 400,
        useNativeDriver: false,
      }).start();
      return;
    }
    if (coffeeLoop.current) return;
    coffeeFill.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(coffeeFill, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(coffeeFill, {
          toValue: 0.15,
          duration: 1600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    );
    coffeeLoop.current = loop;
    loop.start();
  };

  useEffect(() => {
    if (device.kind !== "coffee") return;
    animateCoffee(device.isOn);
    return () => {
      coffeeLoop.current?.stop();
      coffeeLoop.current = null;
    };
  }, [device.kind, device.isOn]);

  useEffect(() => {
    if (device.kind !== "water") return;
    if (!waterBudget || waterBudget <= 0) {
      waterLoop.current?.stop();
      waterLoop.current = null;
      waterFill.setValue(0);
      return;
    }
    const max = Math.min(Math.max(waterBudgetProgress, 0), 1);
    const min = Math.max(0, max - 0.05);
    waterLoop.current?.stop();
    waterFill.setValue(min);
    waterLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(waterFill, {
          toValue: max,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(waterFill, {
          toValue: min,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    );
    waterLoop.current.start();
    return () => {
      waterLoop.current?.stop();
      waterLoop.current = null;
    };
  }, [device.kind, waterBudget, waterBudgetProgress, waterFill]);

  useEffect(() => {
    if (device.kind !== "speaker") return;
    const base = (idx: number) => 0.2 + (idx % 3) * 0.08;
    const loops = speakerBars.map((bar, idx) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue: 1,
            duration: 240 + idx * 30,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(bar, {
            toValue: base(idx),
            duration: 220 + idx * 28,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
        ]),
      ),
    );

    if (device.isOn) {
      loops.forEach((loop) => loop.start());
    } else {
      loops.forEach((loop) => loop.stop());
      speakerBars.forEach((bar, idx) => bar.setValue(base(idx)));
    }

    return () => {
      loops.forEach((loop) => loop.stop());
    };
  }, [device.kind, device.isOn, speakerBars]);

  useEffect(() => {
    if (device.kind !== "water") return;
    setPressureLowDraft(waterPressureLow);
    setPressureHighDraft(waterPressureHigh);
  }, [device.kind, waterPressureLow, waterPressureHigh]);

  useEffect(() => {
    if (device.kind !== "speaker") return;
    setSpeakerBassDraft(speakerBass);
    setSpeakerTrebleDraft(speakerTreble);
  }, [device.kind, speakerBass, speakerTreble]);

  const moodLabelStyle: StyleProp<TextStyle> = [
    styles.moodLabel,
    { fontSize: moodLabelSize },
  ];
  const moodValueStyle: StyleProp<TextStyle> = [
    styles.moodValue,
    { fontSize: moodValueSize },
  ];
  const chipStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.chip,
    active && styles.chipActive,
  ];
  const chipTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.chipText,
    active && styles.chipTextActive,
  ];
  const controlCardRowTopStyle: StyleProp<ViewStyle> = [
    controlCardRowStyle,
    { marginTop: 8 },
  ];
  const controlCardRowTightStyle: StyleProp<ViewStyle> = [
    controlCardRowStyle,
    { marginTop: 10 },
  ];
  const openStatusCardStyle: StyleProp<ViewStyle> = [
    controlCardStyle,
    { paddingVertical: Math.round(controlCardPad * 2.5) },
  ];
  const laundryCardStyle = (
    order: number,
    fullWidth = false,
  ): StyleProp<ViewStyle> => [
    controlCardStyle,
    isTabletLandscape && { order },
    isTabletLandscape && styles.laundryGridItem,
    isTabletLandscape && fullWidth && styles.laundryGridItemFull,
  ];
  const laundryActionRowStyle: StyleProp<ViewStyle> = [
    styles.actionRow,
    isTabletLandscape && styles.laundryActionRow,
  ];
  const controlPillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.controlPill,
    active && styles.controlPillActive,
  ];
  const controlPillTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.controlPillText,
    active && styles.controlPillTextActive,
  ];
  const chipRowTopStyle: StyleProp<ViewStyle> = [
    styles.chipRow,
    { marginTop: 6 },
  ];
  const lightLayoutStyle: StyleProp<ViewStyle> = [
    styles.lightLayout,
    lightLayoutRow && styles.lightLayoutRow,
    !isTabletLandscape && { gap: lightCardGap },
    isTabletLandscape && landscapeGridStyle,
  ];
  const lightDialColumnStyle: StyleProp<ViewStyle> = [
    styles.lightDialColumn,
    isTabletLandscape && landscapeColumnPrimaryStyle,
  ];
  const lightCardHintStyle: StyleProp<TextStyle> = [
    styles.cardHint,
    { fontSize: lightSubLabelSize },
  ];
  const lightCardHintTopStyle: StyleProp<TextStyle> = [
    styles.cardHint,
    { fontSize: lightSubLabelSize, marginTop: 6 },
  ];
  const lightColorRowStyle: StyleProp<ViewStyle> = [
    styles.colorRow,
    { gap: lightCardGap },
  ];
  const lightSceneRowStyle: StyleProp<ViewStyle> = [
    styles.sceneRow,
    { gap: lightCardGap },
  ];
  const lightSceneIconWrapSize = lightSceneIconSize + 16;
  const lightSceneIconWrapStyle: StyleProp<ViewStyle> = [
    styles.sceneIconWrap,
    {
      width: lightSceneIconWrapSize,
      height: lightSceneIconWrapSize,
      borderRadius: Math.round(lightSceneIconWrapSize / 2),
    },
  ];
  const lightSceneTextStyle: StyleProp<TextStyle> = [
    styles.sceneText,
    { fontSize: lightSubLabelSize },
  ];
  const lightSceneCardStyle: StyleProp<ViewStyle> = [
    styles.sceneCardItem,
    lightSceneItemStyle,
    { minWidth: lightSceneMinWidth },
  ];
  const lightControlsGridStyle: StyleProp<ViewStyle> = [
    styles.lightControlsGrid,
    { gap: lightCardGap },
  ];
  const lightControlsColumnLayoutStyle: StyleProp<ViewStyle> = [
    lightControlsColumnStyle,
    isTabletLandscape && landscapeColumnSecondaryStyle,
  ];
  const lightControlCompactStyle: StyleProp<ViewStyle> = [
    lightControlCardStyle,
    styles.lightControlCompact,
  ];
  const lightCenterOrbStyle: StyleProp<ViewStyle> = [
    styles.lightCenterOrb,
    {
      width: lightCenterSize,
      height: lightCenterSize,
      borderRadius: lightCenterSize / 2,
    },
    bulbIsLight && styles.lightCenterOrbLight,
    { transform: [{ scale: bulbScale }] },
  ];
  const lightCenterInnerStyle: StyleProp<ViewStyle> = [
    styles.lightCenterInner,
    bulbIsLight && styles.lightCenterInnerLight,
    {
      borderColor: bulbInnerBorder,
      borderRadius: lightCenterSize / 2,
    },
  ];
  const lightCenterValueStyle: StyleProp<TextStyle> = [
    styles.lightCenterValue,
    {
      color: bulbTextColor,
      fontSize: lightCenterValueSize,
      marginTop: lightCenterValueMargin,
    },
  ];
  const lightCenterRoomStyle: StyleProp<TextStyle> = [
    styles.lightCenterRoom,
    {
      color: bulbSubColor,
      fontSize: lightCenterRoomSize,
      marginTop: lightCenterRoomMargin,
    },
  ];
  const lightSwatchStyleFor = (
    color: string,
    active: boolean,
  ): StyleProp<ViewStyle> => [
    styles.swatch,
    lightSwatchStyle,
    { backgroundColor: color },
    active && styles.swatchActive,
  ];
  const chipRowItemStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.chip,
    styles.chipRowItem,
    active && styles.chipActive,
  ];
  const modeTileStyle = (active?: boolean): StyleProp<ViewStyle> => [
    styles.modeTile,
    Boolean(active) && styles.modeTileActive,
  ];
  const modeTextStyle = (active?: boolean): StyleProp<TextStyle> => [
    styles.modeText,
    Boolean(active) && styles.modeTextActive,
  ];
  const gateAutoCardStyle: StyleProp<ViewStyle> = [
    controlCardStyle,
    isPortrait && {
      marginTop: gateAutoOpenPortraitTop,
      padding: gateAutoOpenCardPad,
      borderRadius: gateAutoOpenCardRadius,
    },
  ];
  const gateAutoLabelStyle: StyleProp<TextStyle> = [
    styles.cardLabel,
    isPortrait && styles.gateAutoLabel,
  ];
  const gateAutoHintStyle: StyleProp<TextStyle> = [
    styles.cardHint,
    isPortrait && styles.gateAutoHint,
  ];
  const gateAutoChipRowStyle: StyleProp<ViewStyle> = [
    styles.chipRow,
    isPortrait && styles.gateAutoChipRow,
  ];
  const tvOrbStyle: StyleProp<ViewStyle> = [
    styles.tvOrb,
    { width: tvOrbSize, height: tvOrbSize, borderRadius: tvOrbRadius },
  ];
  const tvHeroCardStyle: StyleProp<ViewStyle> = [
    styles.tvHeroCard,
    { padding: tvHeroPad, borderRadius: controlCardRadius + 8 },
  ];
  const tvHeroPillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.tvHeroPill,
    {
      height: tvHeroPillHeight,
      borderRadius: Math.round(tvHeroPillHeight / 2),
    },
    active && styles.tvHeroPillActive,
  ];
  const tvHeroPillTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.tvHeroPillText,
    { fontSize: tvHeroPillTextSize },
    active && styles.tvHeroPillTextActive,
  ];
  const tvScreenFrameStyle: StyleProp<ViewStyle> = [
    styles.tvScreenFrame,
    { borderRadius: tvScreenRadius },
  ];
  const tvScreenInnerStyle: StyleProp<ViewStyle> = [
    styles.tvScreenInner,
    {
      height: tvScreenHeight,
      padding: tvScreenInset,
      borderRadius: Math.max(8, tvScreenRadius - 2),
    },
  ];
  const tvScreenOffInnerStyle: StyleProp<ViewStyle> = [
    styles.tvScreenOffInner,
    {
      height: tvScreenHeight,
      padding: isLandscape ? 0 : tvScreenInset,
      borderRadius: Math.max(8, tvScreenRadius - 2),
    },
  ];
  const tvScreenBadgeStyle: StyleProp<ViewStyle> = [
    styles.tvScreenBadge,
    {
      height: tvScreenBadgeHeight,
      borderRadius: Math.round(tvScreenBadgeHeight / 2),
    },
  ];
  const tvScreenBadgeTextStyle: StyleProp<TextStyle> = [
    styles.tvScreenBadgeText,
    { fontSize: tvScreenBadgeTextSize },
  ];
  const tvScreenTitleStyle: StyleProp<TextStyle> = [
    styles.tvScreenTitle,
    { fontSize: tvScreenTitleSize },
  ];
  const tvScreenSubtitleStyle: StyleProp<TextStyle> = [
    styles.tvScreenSubtitle,
    { fontSize: tvScreenSubtitleSize },
  ];
  const tvScreenMetaStyle: StyleProp<TextStyle> = [
    styles.tvScreenMeta,
    { fontSize: tvScreenMetaSize },
  ];
  const tvScreenFooterLabelStyle: StyleProp<TextStyle> = [
    styles.tvScreenFooterLabel,
    { fontSize: tvScreenFooterLabelSize },
  ];
  const tvScreenFooterValueStyle: StyleProp<TextStyle> = [
    styles.tvScreenFooterValue,
    { fontSize: tvScreenFooterValueSize },
  ];
  const tvVolumeCardStyle: StyleProp<ViewStyle> = [
    controlCardStyle,
    styles.tvVolumeCard,
  ];
  const tvVolumeMutePillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.tvVolumeMutePill,
    {
      height: tvHeroPillHeight,
      borderRadius: Math.round(tvHeroPillHeight / 2),
    },
    active && styles.tvVolumeMutePillActive,
  ];
  const tvVolumeMuteTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.tvVolumeMuteText,
    { fontSize: tvHeroPillTextSize },
    active && styles.tvVolumeMuteTextActive,
  ];
  const tvVolumeValueStyle: StyleProp<TextStyle> = [
    styles.tvVolumeValue,
    { fontSize: tvVolumeValueSize },
  ];
  const tvVolumeLabelStyle: StyleProp<TextStyle> = [
    styles.tvVolumeLabel,
    { fontSize: tvVolumeLabelSize },
  ];
  const tvOffLottieStyle: StyleProp<ViewStyle> = [
    styles.tvOffLottie,
    isLandscape
      ? { width: "100%", height: "100%" }
      : {
          width: Math.round(tvScreenHeight * 0.75),
          height: Math.round(tvScreenHeight * 0.75),
        },
  ];
  const tvVolumeTitleStyle: StyleProp<TextStyle> = [
    styles.cardLabel,
    { marginBottom: 0 },
  ];
  const remoteCardStyle: StyleProp<ViewStyle> = [
    controlCardStyle,
    styles.remoteCard,
  ];
  const remoteBtnWideStyle: StyleProp<ViewStyle> = [
    styles.remoteBtn,
    styles.remoteBtnWide,
  ];
  const remoteRowTop8Style: StyleProp<ViewStyle> = [
    styles.remoteRow,
    { marginTop: 8 },
  ];
  const remoteRowTop6Style: StyleProp<ViewStyle> = [
    styles.remoteRow,
    { marginTop: 6 },
  ];
  const remoteSideLeftStyle: StyleProp<ViewStyle> = [
    styles.orbActionBtn,
    styles.remoteSideLeft,
  ];
  const remoteSideRightStyle: StyleProp<ViewStyle> = [
    styles.orbActionBtn,
    styles.remoteSideRight,
  ];
  const navUpStyle: StyleProp<ViewStyle> = [styles.navBtn, styles.navUp];
  const navLeftStyle: StyleProp<ViewStyle> = [styles.navBtn, styles.navLeft];
  const navRightStyle: StyleProp<ViewStyle> = [styles.navBtn, styles.navRight];
  const navDownStyle: StyleProp<ViewStyle> = [styles.navBtn, styles.navDown];
  const coffeeFillStyle: StyleProp<ViewStyle> = [
    styles.coffeeFill,
    {
      height: coffeeFill.interpolate({
        inputRange: [0, 1],
        outputRange: ["10%", "90%"],
      }),
    },
  ];
  const powerDockStyle: StyleProp<ViewStyle> = [
    styles.powerDock,
    {
      left: 0,
      right: 0,
      bottom: powerDockOffset,
      height: powerDockHeight,
      borderRadius: Math.round(powerDockHeight / 2),
      paddingVertical: powerDockInset,
    },
  ];
  const powerRingStyle: StyleProp<ViewStyle> = [
    styles.powerRing,
    device.isOn && styles.powerRingOn,
  ];
  const editCardStyle: StyleProp<ViewStyle> = [
    styles.editCard,
    {
      padding: editPad,
      borderRadius: editRadius,
      maxWidth: isTablet ? 560 : undefined,
      width: isTablet ? Math.min(contentWidth - gutter * 2, 560) : undefined,
      alignSelf: isTablet ? "center" : "stretch",
    },
  ];
  const scheduleCardStyle: StyleProp<ViewStyle> = [
    styles.scheduleCard,
    {
      padding: editPad,
      borderRadius: editRadius,
      maxWidth: isTablet ? 520 : undefined,
      width: isTablet ? Math.min(contentWidth - gutter * 2, 520) : undefined,
      alignSelf: isTablet ? "center" : "stretch",
    },
  ];
  const editTitleTextStyle: StyleProp<TextStyle> = [
    styles.editTitle,
    { fontSize: editTitleSize },
  ];
  const editSubTextStyle: StyleProp<TextStyle> = [
    styles.editSub,
    { fontSize: editSubSize },
  ];
  const editLabelTextStyle: StyleProp<TextStyle> = [
    styles.editLabel,
    { fontSize: editLabelSize },
  ];
  const editInputStyle: StyleProp<ViewStyle> = [
    styles.editInput,
    {
      height: editInputHeight,
      borderRadius: Math.round(editInputHeight * 0.28),
    },
  ];
  const editButtonFrameStyle = {
    height: editButtonHeight,
    borderRadius: Math.round(editButtonHeight * 0.28),
  };
  const editGhostButtonStyle: StyleProp<ViewStyle> = [
    styles.editGhost,
    editButtonFrameStyle,
  ];
  const editGhostTextStyle: StyleProp<TextStyle> = [
    styles.editGhostText,
    { fontSize: editLabelSize },
  ];
  const editPrimaryButtonStyle = (disabled: boolean): StyleProp<ViewStyle> => [
    styles.editPrimary,
    editButtonFrameStyle,
    disabled && styles.editPrimaryDisabled,
  ];
  const editPrimaryTextStyle: StyleProp<TextStyle> = [
    styles.editPrimaryText,
    { fontSize: editLabelSize },
  ];
  const editDeleteButtonStyle: StyleProp<ViewStyle> = [
    styles.editDelete,
    editButtonFrameStyle,
  ];
  const editDeleteTextStyle: StyleProp<TextStyle> = [
    styles.editDeleteText,
    { fontSize: editLabelSize },
  ];
  const roomPillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.roomPill,
    {
      height: editInputHeight,
      borderRadius: Math.round(editInputHeight / 2),
    },
    active && styles.roomPillActive,
  ];
  const roomPillTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.roomPillText,
    { fontSize: editLabelSize },
    active && styles.roomPillTextActive,
  ];
  const stackPillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.stackPill,
    active && styles.stackPillActive,
  ];
  const stackPillTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.stackPillText,
    active && styles.stackPillTextActive,
  ];
  const stackTargetPillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.stackTargetPill,
    active && styles.stackTargetPillActive,
  ];
  const stackTargetTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.stackTargetText,
    active && styles.stackTargetTextActive,
  ];
  const timeInputStyle: StyleProp<ViewStyle> = [
    styles.timeInput,
    {
      height: editInputHeight,
      borderRadius: Math.round(editInputHeight * 0.28),
    },
  ];
  const dayChipStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.dayChip,
    {
      height: editInputHeight,
      borderRadius: Math.round(editInputHeight / 2),
    },
    active && styles.dayChipActive,
  ];
  const dayChipTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.dayChipText,
    { fontSize: editLabelSize },
    active && styles.dayChipTextActive,
  ];
  const cameraDetectAlertTextStyle: StyleProp<TextStyle> = [
    styles.cameraDetectText,
    { color: "#C4384C" },
  ];
  const cameraPresencePillStyle = (isHome: boolean): StyleProp<ViewStyle> => [
    styles.cameraPresencePill,
    isHome ? styles.cameraPresenceHome : styles.cameraPresenceAway,
  ];
  const cameraEventDotStyle = (isKnown: boolean): StyleProp<ViewStyle> => [
    styles.cameraEventDot,
    isKnown ? styles.cameraEventDotKnown : styles.cameraEventDotUnknown,
  ];
  const acHeroNodes = (
    <>
      <View style={isTabletLandscape ? styles.acDialWrap : undefined}>
        {device.isOn ? (
          <RadialDial
            size={dialSize}
            value={temp}
            min={AC_TEMP_MIN_C}
            max={AC_TEMP_MAX_C}
            tickValues={[
              AC_TEMP_MIN_C,
              AC_TEMP_MIN_C + 2,
              AC_TEMP_MIN_C + 4,
              AC_TEMP_MAX_C - 5,
            ]}
            centerValue={roomTemp}
            centerLabel="Room Temperature"
            dimmed={!device.isOn}
            onChange={(v) => sendPatch({ tempC: v, isOn: true })}
          />
        ) : (
          renderDeviceLottie(AC_LOTTIE_SOURCE, dialSize)
        )}
      </View>
      <View style={isTabletLandscape ? styles.acMoodStack : undefined}>
        <Text style={moodLabelStyle}>Mood</Text>
        <Text style={moodValueStyle}>{mode[0].toUpperCase() + mode.slice(1)}</Text>
      </View>
      <ModeTiles
        value={mode}
        onChange={(m) => sendPatch({ mode: m, isOn: true })}
      />
      <View style={styles.metricRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{acFanSpeed}%</Text>
          <Text style={styles.metricLabel}>Fan speed</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{acTargetHumidity}%</Text>
          <Text style={styles.metricLabel}>Target humidity</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{acFilterLife}%</Text>
          <Text style={styles.metricLabel}>Filter life</Text>
        </View>
      </View>
    </>
  );

  const acControlNodes = (
    <>
      <View style={controlCardStyle}>
        <Text style={styles.cardLabel}>Airflow</Text>
        <View style={styles.pressureSliderRow}>
          <Text style={styles.pressureSliderLabel}>Fan</Text>
          <Text style={styles.pressureSliderValue}>{acFanSpeed}%</Text>
        </View>
        <Slider
          value={acFanSpeed}
          minimumValue={0}
          maximumValue={100}
          step={1}
          onSlidingComplete={(value) =>
            sendPatch({
              acFanSpeed: Math.round(value),
              isOn: true,
            })
          }
          minimumTrackTintColor="rgba(122,92,255,0.9)"
          maximumTrackTintColor="rgba(12,12,18,0.12)"
          thumbTintColor="rgba(255,255,255,0.92)"
          style={styles.pressureSlider}
        />
        <Text style={styles.cardHint}>Swing</Text>
        <View style={styles.chipRow}>
          {[
            { label: "Off", value: "off" },
            { label: "Vertical", value: "vertical" },
            { label: "Horizontal", value: "horizontal" },
            { label: "Both", value: "both" },
          ].map((option) => {
            const active = acSwingMode === option.value;
            return (
              <Pressable
                key={option.value}
                style={chipStyle(active)}
                onPress={() =>
                  sendPatch({
                    acSwingMode: option.value as Device["acSwingMode"],
                    isOn: true,
                  })
                }
              >
                <Text style={chipTextStyle(active)}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={controlCardStyle}>
        <Text style={styles.cardLabel}>Efficiency</Text>
        <View style={controlCardRowTopStyle}>
          <Pressable
            style={controlPillStyle(acEcoMode)}
            onPress={() => sendPatch({ acEcoMode: !acEcoMode, isOn: true })}
          >
            <Text style={controlPillTextStyle(acEcoMode)}>
              {acEcoMode ? "Eco" : "Eco Off"}
            </Text>
          </Pressable>
          <Pressable
            style={controlPillStyle(acTurboMode)}
            onPress={() =>
              sendPatch({ acTurboMode: !acTurboMode, isOn: true })
            }
          >
            <Text style={controlPillTextStyle(acTurboMode)}>
              {acTurboMode ? "Turbo" : "Turbo Off"}
            </Text>
          </Pressable>
          <Pressable
            style={controlPillStyle(acQuietMode)}
            onPress={() =>
              sendPatch({ acQuietMode: !acQuietMode, isOn: true })
            }
          >
            <Text style={controlPillTextStyle(acQuietMode)}>
              {acQuietMode ? "Quiet" : "Quiet Off"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={controlCardStyle}>
        <Text style={styles.cardLabel}>Humidity target</Text>
        <View style={styles.pressureSliderRow}>
          <Text style={styles.pressureSliderLabel}>Target</Text>
          <Text style={styles.pressureSliderValue}>{acTargetHumidity}%</Text>
        </View>
        <Slider
          value={acTargetHumidity}
          minimumValue={30}
          maximumValue={60}
          step={1}
          onSlidingComplete={(value) =>
            sendPatch({
              acTargetHumidity: Math.round(value),
              isOn: true,
            })
          }
          minimumTrackTintColor="rgba(122,92,255,0.9)"
          maximumTrackTintColor="rgba(12,12,18,0.12)"
          thumbTintColor="rgba(255,255,255,0.92)"
          style={styles.pressureSlider}
        />
        <Text style={styles.budgetHint}>
          Adjust target humidity for comfort.
        </Text>
      </View>
    </>
  );

  const coffeeHeroCard = (
    <LinearGradient
      colors={[
        "rgba(255,255,255,0.96)",
        "rgba(224,236,255,0.9)",
        "rgba(204,218,255,0.86)",
      ]}
      start={{ x: 0.1, y: 0.05 }}
      end={{ x: 1, y: 1 }}
      style={energyHeroCardStyle}
    >
      <View style={energyHeroHeaderStyle}>
        <View style={styles.energyHeroTitleWrap}>
          <Text style={styles.energyHeroTitle}>{device.name}</Text>
          <Text style={styles.energyHeroSub}>
            {device.isOn ? "Brewing now" : "Ready to brew"} •{" "}
            {roomName || "Coffee"}
          </Text>
        </View>
        <View style={styles.energyHeroPillRow}>
          <View style={energyHeroPillStyle(device.isOn)}>
            <Ionicons
              name={device.isOn ? "cafe" : "cafe-outline"}
              size={14}
              color={
                device.isOn ? theme.colors.accent2 : stylesVars.subtext
              }
            />
            <Text style={energyHeroPillTextStyle(device.isOn)}>
              {device.isOn ? "Brewing" : "Idle"}
            </Text>
          </View>
          <View style={energyHeroPillStyle(coffeeAutoBrewActive)}>
            <Ionicons
              name={coffeeAutoBrewActive ? "time" : "time-outline"}
              size={14}
              color={
                coffeeAutoBrewActive ? "#D6A545" : stylesVars.subtext
              }
            />
            <Text style={energyHeroPillTextStyle(coffeeAutoBrewActive)}>
              {coffeeAutoBrewActive ? `Auto ${coffeeAutoBrewTime}` : "Auto Off"}
            </Text>
          </View>
        </View>
      </View>
      <View style={energyHeroBodyStyle}>
        <View style={energyHeroOrbStyle}>
          <LinearGradient
            colors={[
              "rgba(122,92,255,0.24)",
              "rgba(180,107,255,0.18)",
              "rgba(255,255,255,0.9)",
            ]}
            start={{ x: 0.2, y: 0.1 }}
            end={{ x: 1, y: 1 }}
            style={styles.energyHeroOrbGlow}
          />
          <View style={styles.coffeeOrbInner}>
            <Ionicons name="cafe" size={utilityHeroIconSize} color="#fff" />
            <Text style={coffeeHeroNameStyle}>{device.name}</Text>
            <Text style={coffeeHeroRoomStyle}>{roomName || "Coffee"}</Text>
            <View style={coffeeHeroCupStyle}>
              <Animated.View style={coffeeFillStyle} />
            </View>
          </View>
        </View>
        <View style={energyHeroInfoStyle}>
          <View style={energyHeroStatsRowStyle}>
            {[
              { label: "Water", value: `${coffeeWaterLevel}%` },
              { label: "Beans", value: `${coffeeBeanLevel}%` },
              { label: "Temp", value: `${coffeeTempC}°C` },
            ].map((stat) => (
              <View key={stat.label} style={styles.energyHeroStat}>
                <Text style={energyHeroStatValueStyle}>{stat.value}</Text>
                <Text style={energyHeroStatLabelStyle}>{stat.label}</Text>
              </View>
            ))}
          </View>
          <View
            style={[
              energyHeroStatsRowStyle,
              styles.energyHeroStatsRowCompact,
            ]}
          >
            {[
              { label: "Size", value: `${coffeeSizeOz} oz` },
              { label: "Strength", value: coffeeStrengthLabel },
              { label: "Cups", value: `${coffeeCupCount}` },
            ].map((stat) => (
              <View key={stat.label} style={styles.energyHeroStat}>
                <Text style={energyHeroStatValueStyle}>{stat.value}</Text>
                <Text style={energyHeroStatLabelStyle}>{stat.label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.energyHeroProgressWrap}>
            <View style={energyHeroProgressTrackStyle}>
              <View style={coffeeHeroProgressFillStyle} />
            </View>
            <View style={styles.energyHeroProgressMeta}>
              <Text style={energyHeroMetaTextStyle}>
                Water {coffeeWaterLevel}% • Beans {coffeeBeanLevel}%
              </Text>
              <Text style={energyHeroMetaTextStyle}>
                {coffeeKeepWarmMin > 0
                  ? `Keep warm ${coffeeKeepWarmMin} min`
                  : "Keep warm off"}
              </Text>
            </View>
          </View>
          <Text style={styles.energyHeroHint}>
            {device.isOn ? "Brewing in progress" : "Ready to brew"}
          </Text>
          <View style={coffeeHeroActionRowStyle}>
            <Pressable
              style={coffeeHeroActionPillStyle(!device.isOn)}
              onPress={() => {
                animateCoffee(true);
                sendPatch({ isOn: true });
              }}
            >
              <Text style={energyHeroPillTextStyle(!device.isOn)}>
                Brew now
              </Text>
            </Pressable>
            <Pressable
              style={coffeeHeroActionPillStyle(device.isOn)}
              onPress={() => {
                animateCoffee(false);
                sendPatch({ isOn: false });
              }}
            >
              <Text style={energyHeroPillTextStyle(device.isOn)}>Stop</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </LinearGradient>
  );

  const coffeeControlCards = (
    <>
      <View style={controlCardStyle}>
        <Text style={styles.cardLabel}>Brew profile</Text>
        <Text style={styles.cardHint}>Size</Text>
        <View style={styles.chipRow}>
          {[6, 8, 10, 12].map((value) => {
            const active = coffeeSizeOz === value;
            return (
              <Pressable
                key={value}
                style={chipStyle(active)}
                onPress={() => sendPatch({ coffeeSizeOz: value })}
              >
                <Text style={chipTextStyle(active)}>{value} oz</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.cardHint}>Strength</Text>
        <View style={styles.chipRow}>
          {[
            { label: "Mild", value: "mild" },
            { label: "Normal", value: "normal" },
            { label: "Strong", value: "strong" },
          ].map((option) => {
            const active = coffeeStrength === option.value;
            return (
              <Pressable
                key={option.value}
                style={chipStyle(active)}
                onPress={() =>
                  sendPatch({
                    coffeeStrength: option.value as Device["coffeeStrength"],
                  })
                }
              >
                <Text style={chipTextStyle(active)}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.cardHint}>Cups</Text>
        <View style={styles.chipRow}>
          {[1, 2, 4, 6].map((value) => {
            const active = coffeeCupCount === value;
            return (
              <Pressable
                key={value}
                style={chipStyle(active)}
                onPress={() => sendPatch({ coffeeCupCount: value })}
              >
                <Text style={chipTextStyle(active)}>{value}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={controlCardStyle}>
        <Text style={styles.cardLabel}>Temperature</Text>
        <View style={styles.pressureSliderRow}>
          <Text style={styles.pressureSliderLabel}>Brew</Text>
          <Text style={styles.pressureSliderValue}>{coffeeTempC}°C</Text>
        </View>
        <Slider
          value={coffeeTempC}
          minimumValue={80}
          maximumValue={98}
          step={1}
          onSlidingComplete={(value) =>
            sendPatch({ coffeeTempC: Math.round(value) })
          }
          minimumTrackTintColor="rgba(122,92,255,0.9)"
          maximumTrackTintColor="rgba(12,12,18,0.12)"
          thumbTintColor="rgba(255,255,255,0.92)"
          style={styles.pressureSlider}
        />
        <Text style={styles.cardHint}>Keep warm</Text>
        <View style={styles.chipRow}>
          {[0, 10, 20, 30].map((value) => {
            const active = coffeeKeepWarmMin === value;
            return (
              <Pressable
                key={value}
                style={chipStyle(active)}
                onPress={() => sendPatch({ coffeeKeepWarmMin: value })}
              >
                <Text style={chipTextStyle(active)}>
                  {value === 0 ? "Off" : `${value}m`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={controlCardStyle}>
        <Text style={styles.cardLabel}>Extras</Text>
        <View style={controlCardRowTopStyle}>
          <Pressable
            style={controlPillStyle(coffeeGrinder)}
            onPress={() => sendPatch({ coffeeGrinder: !coffeeGrinder })}
          >
            <Text style={controlPillTextStyle(coffeeGrinder)}>
              {coffeeGrinder ? "Grinder" : "Grinder Off"}
            </Text>
          </Pressable>
          <Pressable
            style={controlPillStyle(coffeeMilkFrother)}
            onPress={() =>
              sendPatch({ coffeeMilkFrother: !coffeeMilkFrother })
            }
          >
            <Text style={controlPillTextStyle(coffeeMilkFrother)}>
              {coffeeMilkFrother ? "Frother" : "Frother Off"}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.cardHint}>Auto brew</Text>
        <View style={styles.chipRow}>
          {["06:30", "07:00", "07:30", "08:00"].map((time) => {
            const active = coffeeAutoBrewTime === time;
            return (
              <Pressable
                key={time}
                style={chipStyle(active)}
                onPress={() => sendPatch({ coffeeAutoBrewTime: time })}
              >
                <Text style={chipTextStyle(active)}>{time}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </>
  );

  const vacuumHeroCard = (
    <LinearGradient
      colors={[
        "rgba(255,255,255,0.96)",
        "rgba(229,240,255,0.92)",
        "rgba(206,223,255,0.86)",
      ]}
      start={{ x: 0.1, y: 0.05 }}
      end={{ x: 1, y: 1 }}
      style={openHeroCardStyle}
    >
      <View style={styles.utilityHeroHeader}>
        <View style={styles.utilityHeroTitleWrap}>
          <Text style={styles.utilityHeroTitle}>{device.name}</Text>
          <Text style={styles.utilityHeroSub}>
            {vacuumStatusLabel} • Battery {vacuumBattery}%
          </Text>
        </View>
        <View style={styles.utilityHeroPillRow}>
          <View style={utilityHeroPillStyle(vacuumStatus !== "docked")}>
            <Ionicons
              name={vacuumStatus === "docked" ? "home" : "flash"}
              size={14}
              color={
                vacuumStatus === "docked"
                  ? stylesVars.subtext
                  : theme.colors.accent2
              }
            />
            <Text style={utilityHeroPillTextStyle(vacuumStatus !== "docked")}>
              {vacuumStatus === "docked" ? "Docked" : "Active"}
            </Text>
          </View>
        </View>
      </View>
      <View style={vacuumHeroBodyStyle}>
        <View style={utilityHeroOrbStyle}>
          <LinearGradient
            colors={["rgba(122,92,255,0.3)", "rgba(107,60,255,0.75)"]}
            start={{ x: 0.2, y: 0.1 }}
            end={{ x: 1, y: 1 }}
            style={styles.utilityHeroOrbGlow}
          />
          <View style={styles.utilityHeroOrbContent}>
            <DeviceIcon kind="vacuum" size={utilityHeroIconSize} color="#fff" />
            <Text style={styles.utilityHeroOrbValue}>
              {vacuumStatusLabel.toUpperCase()}
            </Text>
            <Text style={styles.utilityHeroOrbSub}>
              Battery {vacuumBattery}%
            </Text>
          </View>
        </View>
        <View style={vacuumHeroInfoStyle}>
          <View style={utilityHeroActionRowStyle}>
            {[
              {
                label: "Clean",
                icon: "play",
                status: "cleaning" as const,
                on: true,
              },
              {
                label: "Pause",
                icon: "pause",
                status: "paused" as const,
                on: false,
              },
              {
                label: "Dock",
                icon: "home",
                status: "docked" as const,
                on: false,
              },
            ].map((action) => {
              const active = vacuumStatus === action.status;
              return (
                <Pressable
                  key={action.label}
                  style={modeTileStyle(active)}
                  onPress={() =>
                    sendPatch({
                      status: action.status,
                      isOn: action.on,
                    })
                  }
                >
                  {active ? (
                    <LinearGradient
                      colors={[theme.colors.accent2, theme.colors.accent]}
                      start={{ x: 0.1, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.modeIconBubbleActive}
                    >
                      <Ionicons
                        name={action.icon as any}
                        size={18}
                        color="#FFFFFF"
                      />
                    </LinearGradient>
                  ) : (
                    <View style={styles.modeIconBubble}>
                      <Ionicons
                        name={action.icon as any}
                        size={18}
                        color="rgba(12,12,18,0.65)"
                      />
                    </View>
                  )}
                  <Text style={modeTextStyle(active)}>{action.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={utilityHeroMetricRowStyle}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{vacuumAreaM2} m2</Text>
              <Text style={styles.metricLabel}>Area</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{vacuumRuntimeMin} min</Text>
              <Text style={styles.metricLabel}>Runtime</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{vacuumFilterLife}%</Text>
              <Text style={styles.metricLabel}>Filter</Text>
            </View>
          </View>
        </View>
      </View>
    </LinearGradient>
  );

  const vacuumControlCards = (
    <>
      <View style={controlCardStyle}>
        <Text style={styles.cardLabel}>Cleaning mode</Text>
        <View style={styles.chipRow}>
          {[
            { label: "Auto", value: "auto" },
            { label: "Spot", value: "spot" },
            { label: "Edge", value: "edge" },
            { label: "Room", value: "room" },
          ].map((option) => {
            const active = vacuumMode === option.value;
            return (
              <Pressable
                key={option.value}
                style={chipStyle(active)}
                onPress={() =>
                  sendPatch({
                    vacuumMode: option.value as Device["vacuumMode"],
                    isOn: true,
                  })
                }
              >
                <Text style={chipTextStyle(active)}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.pressureSliderRow}>
          <Text style={styles.pressureSliderLabel}>Suction</Text>
          <Text style={styles.pressureSliderValue}>{vacuumSuction}%</Text>
        </View>
        <Slider
          value={vacuumSuction}
          minimumValue={0}
          maximumValue={100}
          step={1}
          onSlidingComplete={(value) =>
            sendPatch({
              vacuumSuction: Math.round(value),
              isOn: true,
            })
          }
          minimumTrackTintColor="rgba(122,92,255,0.9)"
          maximumTrackTintColor="rgba(12,12,18,0.12)"
          thumbTintColor="rgba(255,255,255,0.92)"
          style={styles.pressureSlider}
        />
        <View style={controlCardRowTopStyle}>
          <Pressable
            style={controlPillStyle(vacuumMop)}
            onPress={() =>
              sendPatch({
                vacuumMop: !vacuumMop,
                isOn: true,
              })
            }
          >
            <Text style={controlPillTextStyle(vacuumMop)}>
              {vacuumMop ? "Mop on" : "Mop off"}
            </Text>
          </Pressable>
          <Pressable
            style={controlPillStyle(vacuumQuietMode)}
            onPress={() =>
              sendPatch({
                vacuumQuietMode: !vacuumQuietMode,
                isOn: true,
              })
            }
          >
            <Text style={controlPillTextStyle(vacuumQuietMode)}>
              {vacuumQuietMode ? "Quiet" : "Quiet off"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={controlCardStyle}>
        <Text style={styles.cardLabel}>Maintenance</Text>
        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>
              {vacuumBinFull ? "Full" : "OK"}
            </Text>
            <Text style={styles.metricLabel}>Bin</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>
              {vacuumBrushDirty ? "Dirty" : "OK"}
            </Text>
            <Text style={styles.metricLabel}>Brush</Text>
          </View>
        </View>
        {(vacuumBinFull || vacuumBrushDirty) && (
          <View style={styles.alertRow}>
            <Ionicons name="warning" size={14} color="#D8465B" />
            <Text style={styles.alertText}>Service the bin/brush</Text>
          </View>
        )}
      </View>
    </>
  );

  const laundryHeroStats = laundryStats.map((stat) => (
    <View key={stat.label} style={styles.laundryStat}>
      <Text style={laundryStatValueStyle}>{stat.value}</Text>
      <Text style={laundryStatLabelStyle}>{stat.label}</Text>
    </View>
  ));
  const laundryHeroStatsLandscape = laundryStats.map((stat) => (
    <View
      key={stat.label}
      style={[styles.laundryStat, styles.laundryStatLandscape]}
    >
      <Text style={laundryStatValueStyle}>{stat.value}</Text>
      <Text style={laundryStatLabelStyle}>{stat.label}</Text>
    </View>
  ));
  const laundryHeroOrb = (
    <View style={laundryHeroLottieWrapStyle}>
      <LinearGradient
        colors={[
          "rgba(180,107,255,0.35)",
          "rgba(122,92,255,0.2)",
          "rgba(255,255,255,0.92)",
        ]}
        start={{ x: 0.2, y: 0.1 }}
        end={{ x: 1, y: 1 }}
        style={styles.laundryHeroLottieGlow}
      />
      <LottieView
        source={DRYER_LOTTIE_SOURCE}
        autoPlay
        loop
        resizeMode="contain"
        style={laundryHeroLottieStyle}
      />
      {laundryOverlayLabel ? (
        <View style={styles.laundryHeroOverlay} pointerEvents="none">
          <Text style={laundryHeroPhaseStyle}>{laundryOverlayLabel}</Text>
        </View>
      ) : null}
    </View>
  );
  const laundryHeroCard = (
    <LinearGradient
      colors={[
        "rgba(255,255,255,0.96)",
        "rgba(236,228,255,0.88)",
        "rgba(214,200,255,0.82)",
      ]}
      start={{ x: 0.05, y: 0.1 }}
      end={{ x: 1, y: 1 }}
      style={laundryHeroCardStyle}
    >
      <View style={laundryHeroHeaderStyle}>
        {laundryStatus ? (
          <View style={laundryHeroStatusPillStyle}>
            <Text style={laundryHeroStatusTextStyle}>{laundryStatus}</Text>
          </View>
        ) : null}
        <View style={laundryHeroBadgeStyle}>
          <Text style={laundryHeroBadgeTextStyle}>{laundryBadge}</Text>
        </View>
      </View>
      {showLaundryNotice && (
        <View style={styles.laundryNoticeRow}>
          <Ionicons
            name={
              laundryPhaseNotice === "Done"
                ? "checkmark-circle"
                : "notifications"
            }
            size={14}
            color={
              laundryPhaseNotice === "Done"
                ? "#2F8A5B"
                : theme.colors.accent2
            }
          />
          <Text style={laundryNoticeTextStyle}>{laundryNoticeLabel}</Text>
        </View>
      )}
      <View style={laundryHeroBodyStyle}>
        {isLandscape ? (
          <View style={laundryHeroLeftColumnStyle}>
            {laundryHeroOrb}
            <View style={laundryHeroStackStyle}>
              <Text style={laundryCycleTextStyle}>{laundryCycleLabel}</Text>
              <Text style={laundryCycleSubTextStyle}>{laundryTimeLabel}</Text>
              <View style={laundryProgressTrackStyle}>
                <View style={laundryProgressFillStyle} />
              </View>
            </View>
            <View style={laundryHeroMetricsStyle}>
              {laundryHeroStatsLandscape}
            </View>
          </View>
        ) : (
          <>
            {laundryHeroOrb}
            <View style={laundryHeroInfoStyle}>
              <Text style={laundryCycleTextStyle}>{laundryCycleLabel}</Text>
              <Text style={laundryCycleSubTextStyle}>{laundryTimeLabel}</Text>
              <View style={laundryProgressTrackStyle}>
                <View style={laundryProgressFillStyle} />
              </View>
              <View style={laundryStatsRowStyle}>{laundryHeroStats}</View>
            </View>
          </>
        )}
      </View>
    </LinearGradient>
  );

  const laundryCycleCard = (
    <View style={laundryCardStyle(1)}>
      <Text style={styles.cardLabel}>Cycle</Text>
      <View style={styles.chipRow}>
        {laundryCycles.map((label) => {
          const active = (device.cycle ?? "Normal") === label;
          return (
            <Pressable
              key={label}
              style={chipStyle(active)}
              onPress={() => sendPatch({ cycle: label })}
            >
              <Text style={chipTextStyle(active)}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const laundryLoadSizeCard =
    device.kind === "washer" ? (
      <View style={laundryCardStyle(6)}>
        <Text style={styles.cardLabel}>Load size</Text>
        <View style={styles.chipRow}>
          {["Small", "Medium", "Large"].map((label) => {
            const active = loadSize === label;
            return (
              <Pressable
                key={label}
                style={chipStyle(active)}
                onPress={() =>
                  sendPatch({ loadSize: label as Device["loadSize"] })
                }
              >
                <Text style={chipTextStyle(active)}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    ) : null;

  const laundryControlCards = (
    <>
      {!isTabletLandscape && laundryCycleCard}

      {device.kind === "washer" && (
        <>
          <View style={laundryCardStyle(3)}>
            <Text style={styles.cardLabel}>Temperature</Text>
            <View style={styles.chipRow}>
              {washTempOptions.map((label) => {
                const active = washTemp === label;
                return (
                  <Pressable
                    key={label}
                    style={chipStyle(active)}
                    onPress={() => sendPatch({ washTemp: label })}
                  >
                    <Text style={chipTextStyle(active)}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={laundryCardStyle(4)}>
            <Text style={styles.cardLabel}>Spin speed</Text>
            <View style={styles.chipRow}>
              {[800, 1000, 1200].map((value) => {
                const active = spinSpeed === value;
                return (
                  <Pressable
                    key={value}
                    style={chipStyle(active)}
                    onPress={() => sendPatch({ spinSpeedRpm: value })}
                  >
                    <Text style={chipTextStyle(active)}>{value} rpm</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={laundryCardStyle(5)}>
            <Text style={styles.cardLabel}>Soil level</Text>
            <View style={styles.chipRow}>
              {soilLevelOptions.map((label) => {
                const active = soilLevel === label;
                return (
                  <Pressable
                    key={label}
                    style={chipStyle(active)}
                    onPress={() => sendPatch({ soilLevel: label })}
                  >
                    <Text style={chipTextStyle(active)}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {!isTabletLandscape && laundryLoadSizeCard}

          <View style={laundryCardStyle(7)}>
            <Text style={styles.cardLabel}>Rinse</Text>
            <View style={styles.chipRow}>
              {[1, 2, 3].map((value) => {
                const active = rinseCount === value;
                return (
                  <Pressable
                    key={value}
                    style={chipStyle(active)}
                    onPress={() =>
                      sendPatch({ rinseCount: value as Device["rinseCount"] })
                    }
                  >
                    <Text style={chipTextStyle(active)}>{value}x</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={laundryCardStyle(8)}>
            <Text style={styles.cardLabel}>Enhancements</Text>
            <View style={controlCardRowStyle}>
              <Pressable
                style={controlPillStyle(prewash)}
                onPress={() => sendPatch({ prewash: !prewash })}
              >
                <Text style={controlPillTextStyle(prewash)}>Prewash</Text>
              </Pressable>
              <Pressable
                style={controlPillStyle(steamWash)}
                onPress={() => sendPatch({ steamWash: !steamWash })}
              >
                <Text style={controlPillTextStyle(steamWash)}>Steam</Text>
              </Pressable>
            </View>
            <View style={controlCardRowStyle}>
              <Pressable
                style={controlPillStyle(sanitizeWash)}
                onPress={() => sendPatch({ sanitizeWash: !sanitizeWash })}
              >
                <Text style={controlPillTextStyle(sanitizeWash)}>
                  Sanitize
                </Text>
              </Pressable>
              <Pressable
                style={controlPillStyle(extraSpin)}
                onPress={() => sendPatch({ extraSpin: !extraSpin })}
              >
                <Text style={controlPillTextStyle(extraSpin)}>
                  Extra Spin
                </Text>
              </Pressable>
            </View>
            <View style={controlCardRowStyle}>
              <Pressable
                style={controlPillStyle(smartDispense)}
                onPress={() => sendPatch({ smartDispense: !smartDispense })}
              >
                <Text style={controlPillTextStyle(smartDispense)}>
                  Smart Dose
                </Text>
              </Pressable>
              <Pressable
                style={controlPillStyle(ecoWash)}
                onPress={() => sendPatch({ ecoWash: !ecoWash })}
              >
                <Text style={controlPillTextStyle(ecoWash)}>Eco Boost</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}

      {device.kind === "dryer" && (
        <>
          <View style={laundryCardStyle(3)}>
            <Text style={styles.cardLabel}>Heat</Text>
            <View style={styles.chipRow}>
              {heatLevelOptions.map((label) => {
                const active = heatLevel === label;
                return (
                  <Pressable
                    key={label}
                    style={chipStyle(active)}
                    onPress={() => sendPatch({ heatLevel: label })}
                  >
                    <Text style={chipTextStyle(active)}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={laundryCardStyle(4)}>
            <Text style={styles.cardLabel}>Dryness</Text>
            <View style={styles.chipRow}>
              {drynessOptions.map((label) => {
                const active = drynessLevel === label;
                return (
                  <Pressable
                    key={label}
                    style={chipStyle(active)}
                    onPress={() => sendPatch({ drynessLevel: label })}
                  >
                    <Text style={chipTextStyle(active)}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={laundryCardStyle(5)}>
            <Text style={styles.cardLabel}>Dryer options</Text>
            <View style={controlCardRowStyle}>
              <Pressable
                style={controlPillStyle(sensorDry)}
                onPress={() => sendPatch({ sensorDry: !sensorDry })}
              >
                <Text style={controlPillTextStyle(sensorDry)}>
                  Sensor Dry
                </Text>
              </Pressable>
              <Pressable
                style={controlPillStyle(wrinkleGuard)}
                onPress={() => sendPatch({ wrinkleGuard: !wrinkleGuard })}
              >
                <Text style={controlPillTextStyle(wrinkleGuard)}>
                  Wrinkle Guard
                </Text>
              </Pressable>
            </View>
            <View style={controlCardRowStyle}>
              <Pressable
                style={controlPillStyle(steamRefresh)}
                onPress={() => sendPatch({ steamRefresh: !steamRefresh })}
              >
                <Text style={controlPillTextStyle(steamRefresh)}>
                  Steam Refresh
                </Text>
              </Pressable>
              <Pressable
                style={controlPillStyle(ecoDry)}
                onPress={() => sendPatch({ ecoDry: !ecoDry })}
              >
                <Text style={controlPillTextStyle(ecoDry)}>Eco Dry</Text>
              </Pressable>
            </View>
            <View style={controlCardRowStyle}>
              <Pressable
                style={controlPillStyle(airFluff)}
                onPress={() => sendPatch({ airFluff: !airFluff })}
              >
                <Text style={controlPillTextStyle(airFluff)}>Air Fluff</Text>
              </Pressable>
              <Pressable
                style={controlPillStyle(coolDown)}
                onPress={() => sendPatch({ coolDown: !coolDown })}
              >
                <Text style={controlPillTextStyle(coolDown)}>Cool Down</Text>
              </Pressable>
            </View>
          </View>

          <View style={laundryCardStyle(6)}>
            <Text style={styles.cardLabel}>Maintenance</Text>
            <View style={controlCardRowStyle}>
              <Pressable
                style={controlPillStyle(lintFilterOk)}
                onPress={() => sendPatch({ lintFilterOk: !lintFilterOk })}
              >
                <Text style={controlPillTextStyle(lintFilterOk)}>
                  {lintFilterOk ? "Filter OK" : "Clean Filter"}
                </Text>
              </Pressable>
              <Pressable
                style={controlPillStyle(antiStatic)}
                onPress={() => sendPatch({ antiStatic: !antiStatic })}
              >
                <Text style={controlPillTextStyle(antiStatic)}>
                  Anti-Static
                </Text>
              </Pressable>
            </View>
          </View>
        </>
      )}

      <View style={laundryCardStyle(2)}>
        <Text style={styles.cardLabel}>Time remaining</Text>
        <View style={styles.chipRow}>
          {[
            { label: "-10", value: -10 },
            { label: "+10", value: 10 },
            { label: "+20", value: 20 },
          ].map((preset) => (
            <Pressable
              key={preset.label}
              style={styles.chip}
              onPress={() => {
                const next = clamp(
                  laundryRemainingMin + preset.value,
                  0,
                  laundryTotalMin,
                );
                const nextProgress =
                  laundryTotalMin > 0
                    ? clamp(
                        Math.round(100 - (next / laundryTotalMin) * 100),
                        0,
                        100,
                      )
                    : 0;
                sendPatch({
                  progress: nextProgress,
                  remainingMin: next,
                  isOn: device.isOn && next > 0,
                });
              }}
            >
              <Text style={styles.chipText}>{preset.label} min</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.budgetHint}>
          {washerProgress >= 100
            ? "Done"
            : device.isOn || washerProgress > 0
              ? `${laundryRemainingMin} min left`
              : `Preset ${laundryTotalMin} min`}
        </Text>
      </View>
    </>
  );

  const laundryActionRow = (
    <View style={laundryActionRowStyle}>
      <Pressable
        style={modeTileStyle(device.isOn)}
        onPress={() => sendPatch({ isOn: true })}
      >
        {device.isOn ? (
          <LinearGradient
            colors={[theme.colors.accent2, theme.colors.accent]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modeIconBubbleActive}
          >
            <Ionicons name="play" size={18} color="#FFFFFF" />
          </LinearGradient>
        ) : (
          <View style={styles.modeIconBubble}>
            <Ionicons name="play" size={18} color="rgba(12,12,18,0.65)" />
          </View>
        )}
        <Text style={modeTextStyle(device.isOn)}>Start</Text>
      </Pressable>
      <Pressable
        style={modeTileStyle(!device.isOn)}
        onPress={() => sendPatch({ isOn: false })}
      >
        {!device.isOn ? (
          <LinearGradient
            colors={[theme.colors.accent2, theme.colors.accent]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modeIconBubbleActive}
          >
            <Ionicons name="pause" size={18} color="#FFFFFF" />
          </LinearGradient>
        ) : (
          <View style={styles.modeIconBubble}>
            <Ionicons name="pause" size={18} color="rgba(12,12,18,0.65)" />
          </View>
        )}
        <Text style={modeTextStyle(!device.isOn)}>Pause</Text>
      </Pressable>
    </View>
  );
  const garageActionButtons = (
    <>
      <Pressable style={modeTileStyle(isOpen)} onPress={() => setOpenTarget(100)}>
        {isOpen ? (
          <LinearGradient
            colors={[theme.colors.accent2, theme.colors.accent]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modeIconBubbleActive}
          >
            <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
          </LinearGradient>
        ) : (
          <View style={styles.modeIconBubble}>
            <Ionicons name="arrow-up" size={18} color="rgba(12,12,18,0.65)" />
          </View>
        )}
        <Text style={modeTextStyle(isOpen)}>Open</Text>
      </Pressable>
      <Pressable
        style={modeTileStyle(isClosed)}
        onPress={() => setOpenTarget(0)}
      >
        {isClosed ? (
          <LinearGradient
            colors={[theme.colors.accent2, theme.colors.accent]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modeIconBubbleActive}
          >
            <Ionicons name="arrow-down" size={18} color="#FFFFFF" />
          </LinearGradient>
        ) : (
          <View style={styles.modeIconBubble}>
            <Ionicons name="arrow-down" size={18} color="rgba(12,12,18,0.65)" />
          </View>
        )}
        <Text style={modeTextStyle(isClosed)}>Close</Text>
      </Pressable>
    </>
  );
  const garageActionRow = (
    <View style={utilityHeroActionRowStyle}>{garageActionButtons}</View>
  );
  const garageActionCard = (
    <View style={controlCardStyle}>
      <Text style={styles.cardLabel}>Controls</Text>
      <View style={garageActionRowStyle}>{garageActionButtons}</View>
    </View>
  );
  const garageStatusCard = (
    <View style={openStatusCardStyle}>
      <Text style={styles.cardLabel}>Status</Text>
      <Text style={styles.metricValue}>{openDisplayValue}%</Text>
      <Text style={styles.metricLabel}>{openStatusLabel}</Text>
      <Text style={styles.statusMetaText}>
        Last activity: {openLastActivityLabel}
      </Text>
      <Text style={styles.statusMetaText}>
        Last activity by: {openLastActorLabel}
      </Text>
      <Text style={styles.statusMetaText}>
        Battery: {openBatteryLabel}
      </Text>
    </View>
  );
  const garageHeroOrb = (
    <View style={garageHeroOrbStyle}>
      <LinearGradient
        colors={[
          "rgba(122,92,255,0.24)",
          "rgba(180,107,255,0.16)",
          "rgba(255,255,255,0.9)",
        ]}
        start={{ x: 0.2, y: 0.1 }}
        end={{ x: 1, y: 1 }}
        style={styles.utilityHeroOrbGlow}
      />
      <AnimatedLottieView
        source={GARAGE_LOTTIE_SOURCE}
        progress={openProgress}
        autoPlay={false}
        loop={false}
        resizeMode="contain"
        style={styles.deviceLottie}
      />
      <View style={styles.openStatusOverlay} pointerEvents="none">
        <Text style={styles.openStatusValue}>{openDisplayValue}%</Text>
        <Text style={styles.openStatusLabel}>{openStatusLabel}</Text>
      </View>
    </View>
  );
  const garageHeroCard = (
    <LinearGradient
      colors={[
        "rgba(255,255,255,0.96)",
        "rgba(228,240,255,0.92)",
        "rgba(210,224,255,0.86)",
      ]}
      start={{ x: 0.1, y: 0.05 }}
      end={{ x: 1, y: 1 }}
      style={openHeroCardStyle}
    >
      <View style={styles.utilityHeroHeader}>
        <View style={styles.utilityHeroTitleWrap}>
          <Text style={styles.utilityHeroTitle}>{device.name}</Text>
          <Text style={styles.utilityHeroSub}>{openStatusText}</Text>
        </View>
        <View style={styles.utilityHeroPillRow}>
          <View style={utilityHeroPillStyle(isOpen)}>
            <Ionicons
              name={isOpen ? "arrow-up" : "arrow-down"}
              size={14}
              color={isOpen ? theme.colors.accent2 : stylesVars.subtext}
            />
            <Text style={utilityHeroPillTextStyle(isOpen)}>
              {isOpen ? "Open" : "Closed"}
            </Text>
          </View>
        </View>
      </View>
      {isPortrait ? (
        <View style={openHeroBodyPortraitStyle}>
          {garageHeroOrb}
          <Text style={styles.openPortraitStatusText}>{openStatusText}</Text>
          <Text style={styles.openPortraitMetaText}>
            Last activity: {openLastActivityLabel}
          </Text>
          <View style={openPortraitMetaRowStyle}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue} numberOfLines={1}>
                {openLastActorLabel}
              </Text>
              <Text style={styles.metricLabel}>Last by</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{openBatteryLabel}</Text>
              <Text style={styles.metricLabel}>Battery</Text>
            </View>
          </View>
          <View style={openPortraitActionRowStyle}>
            {garageActionButtons}
          </View>
        </View>
      ) : (
        <View style={garageHeroBodyStyle}>
          {garageHeroOrb}
          {!isLandscapeSplit && (
            <View style={utilityHeroInfoStyle}>{garageActionRow}</View>
          )}
        </View>
      )}
    </LinearGradient>
  );
  const doorActionButtons = (
    <>
      <Pressable style={modeTileStyle(isOpen)} onPress={() => setOpenTarget(100)}>
        {isOpen ? (
          <LinearGradient
            colors={[theme.colors.accent2, theme.colors.accent]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modeIconBubbleActive}
          >
            <Ionicons name="lock-open" size={18} color="#FFFFFF" />
          </LinearGradient>
        ) : (
          <View style={styles.modeIconBubble}>
            <Ionicons name="lock-open" size={18} color="rgba(12,12,18,0.65)" />
          </View>
        )}
        <Text style={modeTextStyle(isOpen)}>Open</Text>
      </Pressable>
      <Pressable
        style={modeTileStyle(isClosed)}
        onPress={() => setOpenTarget(0)}
      >
        {isClosed ? (
          <LinearGradient
            colors={[theme.colors.accent2, theme.colors.accent]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modeIconBubbleActive}
          >
            <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
          </LinearGradient>
        ) : (
          <View style={styles.modeIconBubble}>
            <Ionicons name="lock-closed" size={18} color="rgba(12,12,18,0.65)" />
          </View>
        )}
        <Text style={modeTextStyle(isClosed)}>Close</Text>
      </Pressable>
    </>
  );
  const doorActionRow = (
    <View style={utilityHeroActionRowStyle}>{doorActionButtons}</View>
  );
  const doorActionCard = (
    <View style={controlCardStyle}>
      <Text style={styles.cardLabel}>Controls</Text>
      <View style={doorActionRowStyle}>{doorActionButtons}</View>
    </View>
  );
  const doorStatusCard = (
    <View style={openStatusCardStyle}>
      <Text style={styles.cardLabel}>Status</Text>
      <Text style={styles.metricValue}>{openDisplayValue}%</Text>
      <Text style={styles.metricLabel}>{openStatusLabel}</Text>
      <Text style={styles.statusMetaText}>
        Last activity: {openLastActivityLabel}
      </Text>
      <Text style={styles.statusMetaText}>
        Last activity by: {openLastActorLabel}
      </Text>
      <Text style={styles.statusMetaText}>
        Battery: {openBatteryLabel}
      </Text>
    </View>
  );
  const doorHeroOrb = (
    <View style={doorHeroOrbStyle}>
      <LinearGradient
        colors={[
          "rgba(122,92,255,0.24)",
          "rgba(180,107,255,0.16)",
          "rgba(255,255,255,0.9)",
        ]}
        start={{ x: 0.2, y: 0.1 }}
        end={{ x: 1, y: 1 }}
        style={styles.utilityHeroOrbGlow}
      />
      <AnimatedLottieView
        source={DOOR_LOTTIE_SOURCE}
        progress={openProgress}
        autoPlay={false}
        loop={false}
        resizeMode="contain"
        style={styles.deviceLottie}
      />
      <View style={styles.openStatusOverlay} pointerEvents="none">
        <Text style={styles.openStatusValue}>{openDisplayValue}%</Text>
        <Text style={styles.openStatusLabel}>{openStatusLabel}</Text>
      </View>
    </View>
  );
  const doorHeroCard = (
    <LinearGradient
      colors={[
        "rgba(255,255,255,0.96)",
        "rgba(240,236,255,0.92)",
        "rgba(224,214,255,0.86)",
      ]}
      start={{ x: 0.1, y: 0.05 }}
      end={{ x: 1, y: 1 }}
      style={utilityHeroCardStyle}
    >
      <View style={styles.utilityHeroHeader}>
        <View style={styles.utilityHeroTitleWrap}>
          <Text style={styles.utilityHeroTitle}>{device.name}</Text>
          <Text style={styles.utilityHeroSub}>{openStatusText}</Text>
        </View>
        <View style={styles.utilityHeroPillRow}>
          <View style={utilityHeroPillStyle(isOpen)}>
            <Ionicons
              name={isOpen ? "lock-open" : "lock-closed"}
              size={14}
              color={isOpen ? theme.colors.accent2 : stylesVars.subtext}
            />
            <Text style={utilityHeroPillTextStyle(isOpen)}>
              {isOpen ? "Unlocked" : "Locked"}
            </Text>
          </View>
        </View>
      </View>
      {isPortrait ? (
        <View style={openHeroBodyPortraitStyle}>
          {doorHeroOrb}
          <Text style={styles.openPortraitStatusText}>{openStatusText}</Text>
          <Text style={styles.openPortraitMetaText}>
            Last activity: {openLastActivityLabel}
          </Text>
          <View style={openPortraitMetaRowStyle}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue} numberOfLines={1}>
                {openLastActorLabel}
              </Text>
              <Text style={styles.metricLabel}>Last by</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{openBatteryLabel}</Text>
              <Text style={styles.metricLabel}>Battery</Text>
            </View>
          </View>
          <View style={openPortraitActionRowStyle}>{doorActionButtons}</View>
        </View>
      ) : (
        <View style={doorHeroBodyStyle}>
          {doorHeroOrb}
          {!isLandscapeSplit && (
            <View style={utilityHeroInfoStyle}>{doorActionRow}</View>
          )}
        </View>
      )}
    </LinearGradient>
  );
  const smokeMetricsRow = (
    <View
      style={
        isLandscapeSplit ? smokeHeroMetricRowStyle : utilityHeroMetricRowStyle
      }
    >
      <View style={styles.metricCard}>
        <Text style={styles.metricValue}>{coPpm} ppm</Text>
        <Text style={styles.metricLabel}>CO</Text>
      </View>
      <View style={styles.metricCard}>
        <Text style={styles.metricValue}>{smokePpm} ppm</Text>
        <Text style={styles.metricLabel}>Smoke</Text>
      </View>
      <View style={styles.metricCard}>
        <Text style={styles.metricValue}>{smokeBattery}%</Text>
        <Text style={styles.metricLabel}>Battery</Text>
      </View>
    </View>
  );
  const smokeActionRow = (
    <View
      style={
        isLandscapeSplit ? smokeHeroActionRowStyle : utilityHeroActionRowStyle
      }
    >
      <Pressable
        style={styles.controlPill}
        onPress={() =>
          sendPatch({
            smokeDetected: true,
            coDetected: false,
            smokeSilenced: false,
            smokeLastTestAt: Date.now(),
            smokeLastAlarmAt: Date.now(),
          })
        }
      >
        <Text style={styles.controlPillText}>Test alarm</Text>
      </Pressable>
      <Pressable
        style={styles.controlPill}
        onPress={() =>
          sendPatch({
            smokeDetected: false,
            coDetected: false,
            smokeSilenced: true,
          })
        }
      >
        <Text style={styles.controlPillText}>Silence</Text>
      </Pressable>
    </View>
  );
  const smokeHeroCard = (
    <LinearGradient
      colors={[
        "rgba(255,255,255,0.96)",
        "rgba(238,236,255,0.92)",
        "rgba(220,214,255,0.86)",
      ]}
      start={{ x: 0.1, y: 0.05 }}
      end={{ x: 1, y: 1 }}
      style={utilityHeroCardStyle}
    >
      <View style={styles.utilityHeroHeader}>
        <View style={styles.utilityHeroTitleWrap}>
          <Text style={styles.utilityHeroTitle}>{device.name}</Text>
          <Text style={styles.utilityHeroSub}>
            {smokeDetected || coDetected ? "Alert detected" : "Air quality clear"}
          </Text>
        </View>
        <View style={styles.utilityHeroPillRow}>
          <View style={utilityHeroPillStyle(smokeDetected)}>
            <Ionicons
              name="flame"
              size={14}
              color={smokeDetected ? "#D8465B" : stylesVars.subtext}
            />
            <Text style={utilityHeroPillTextStyle(smokeDetected)}>
              {smokeDetected ? "Smoke" : "Smoke OK"}
            </Text>
          </View>
          <View style={utilityHeroPillStyle(coDetected)}>
            <Ionicons
              name="cloud"
              size={14}
              color={coDetected ? "#D8465B" : stylesVars.subtext}
            />
            <Text style={utilityHeroPillTextStyle(coDetected)}>
              {coDetected ? "CO" : "CO OK"}
            </Text>
          </View>
        </View>
      </View>
      <View style={isLandscapeSplit ? smokeHeroBodyStyle : utilityHeroBodyStyle}>
        <View style={smokeHeroOrbStyle}>
          <LinearGradient
            colors={
              smokeDetected || coDetected
                ? ["#FFB4B4", "#B46BFF"]
                : ["#D9F5E6", "#6B3CFF"]
            }
            start={{ x: 0.2, y: 0.1 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.utilityHeroOrbGlow}
          />
          <View style={styles.utilityHeroOrbContent}>
            <Ionicons
              name={smokeDetected || coDetected ? "alert-circle" : "checkmark-circle"}
              size={smokeHeroIconSize}
              color="#fff"
            />
            <Text style={styles.utilityHeroOrbValue}>
              {smokeDetected || coDetected ? "ALERT" : "CLEAR"}
            </Text>
            <Text style={styles.utilityHeroOrbSub}>{device.name}</Text>
          </View>
        </View>
        {!isLandscapeSplit && (
          <View style={utilityHeroInfoStyle}>
            {smokeMetricsRow}
            {smokeActionRow}
          </View>
        )}
      </View>
    </LinearGradient>
  );
  const smokeStatusCard = (
    <View style={controlCardStyle}>
      <Text style={styles.cardLabel}>Status</Text>
      <View style={styles.chipRow}>
        {["ok", "warning", "error"].map((status) => {
          const active = smokeSensorStatus === status;
          const label =
            status === "ok"
              ? "OK"
              : status === "warning"
                ? "Warning"
                : "Error";
          return (
            <Pressable
              key={status}
              style={chipStyle(active)}
              onPress={() =>
                sendPatch({
                  smokeSensorStatus: status as Device["smokeSensorStatus"],
                })
              }
            >
              <Text style={chipTextStyle(active)}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.budgetHint}>
        Last test:{" "}
        {smokeLastTestAt ? formatTimeAgo(smokeLastTestAt) : "Not yet"}
      </Text>
      <Text style={styles.budgetHint}>
        Last alarm:{" "}
        {smokeLastAlarmAt ? formatTimeAgo(smokeLastAlarmAt) : "None"}
      </Text>
    </View>
  );
  const tvHeroCard = (
    <LinearGradient
      colors={[
        "rgba(255,255,255,0.96)",
        "rgba(226,242,255,0.92)",
        "rgba(204,227,255,0.86)",
      ]}
      start={{ x: 0.1, y: 0.05 }}
      end={{ x: 1, y: 1 }}
      style={tvHeroCardStyle}
    >
      <View style={styles.tvHeroHeader}>
        <View style={styles.tvHeroTitleWrap}>
          <Text style={styles.tvHeroTitle}>{device.name}</Text>
          <Text style={styles.tvHeroRoom}>{roomName || "TV"}</Text>
        </View>
        <View style={tvHeroPillStyle(device.isOn)}>
          <Ionicons
            name={device.isOn ? "play" : "power"}
            size={14}
            color={device.isOn ? "#1F7EA9" : stylesVars.subtext}
          />
          <Text style={tvHeroPillTextStyle(device.isOn)} numberOfLines={1}>
            {tvStatusLabel}
          </Text>
        </View>
      </View>
      <View style={tvScreenFrameStyle}>
        {device.isOn ? (
          <LinearGradient
            colors={[
              "rgba(14,22,36,0.88)",
              "rgba(20,90,120,0.65)",
              "rgba(84,180,220,0.45)",
            ]}
            start={{ x: 0.2, y: 0.1 }}
            end={{ x: 1, y: 1 }}
            style={tvScreenInnerStyle}
          >
            <View style={styles.tvScreenTopRow}>
              <View style={tvScreenBadgeStyle}>
                <Ionicons
                  name={tvIsLive ? "radio" : "apps"}
                  size={12}
                  color="#fff"
                />
                <Text style={tvScreenBadgeTextStyle} numberOfLines={1}>
                  {tvSource}
                </Text>
              </View>
              <Text style={tvScreenMetaStyle}>
                {tvIsLive ? `Ch ${channel}` : "Streaming"}
              </Text>
            </View>
            <View style={styles.tvScreenCenter}>
              <Ionicons
                name="play"
                size={Math.round(tvScreenTitleSize * 1.4)}
                color="rgba(255,255,255,0.9)"
              />
              <Text style={tvScreenTitleStyle} numberOfLines={1}>
                {tvDetailLabel}
              </Text>
              <Text style={tvScreenSubtitleStyle}>Now playing</Text>
            </View>
            <View style={styles.tvScreenFooter}>
              <View style={styles.tvScreenFooterItem}>
                <Text style={tvScreenFooterLabelStyle}>Volume</Text>
                <Text style={tvScreenFooterValueStyle}>
                  {device.muted ? "Muted" : `${volume}%`}
                </Text>
              </View>
              <View style={styles.tvScreenFooterItem}>
                <Text style={tvScreenFooterLabelStyle}>Source</Text>
                <Text style={tvScreenFooterValueStyle} numberOfLines={1}>
                  {tvSource}
                </Text>
              </View>
              <View style={styles.tvScreenFooterItem}>
                <Text style={tvScreenFooterLabelStyle}>Channel</Text>
                <Text style={tvScreenFooterValueStyle}>
                  {tvIsLive ? channel : "--"}
                </Text>
              </View>
            </View>
          </LinearGradient>
        ) : (
          <LinearGradient
            colors={["rgba(8,12,18,0.92)", "rgba(20,32,48,0.85)"]}
            start={{ x: 0.2, y: 0.1 }}
            end={{ x: 1, y: 1 }}
            style={tvScreenOffInnerStyle}
          >
            <LottieView
              source={TV_LOTTIE_SOURCE}
              autoPlay
              loop
              resizeMode="contain"
              style={tvOffLottieStyle}
            />
          </LinearGradient>
        )}
      </View>
    </LinearGradient>
  );
  const tvVolumeCard = (
    <View style={tvVolumeCardStyle}>
      <View style={styles.tvVolumeHeader}>
        <Text style={tvVolumeTitleStyle}>Volume</Text>
        <Pressable
          style={tvVolumeMutePillStyle(device.muted)}
          onPress={() => {
            const next = !device.muted;
            deviceClient
              .sendCommand({
                op: "set-muted",
                deviceId: device.id,
                value: next,
              })
              .catch(() => {});
          }}
        >
          <Ionicons
            name={device.muted ? "volume-mute" : "volume-high"}
            size={14}
            color={device.muted ? "#C44C4C" : stylesVars.subtext}
          />
          <Text style={tvVolumeMuteTextStyle(device.muted)}>
            {device.muted ? "Muted" : "Mute"}
          </Text>
        </Pressable>
      </View>
      <RadialDial
        size={tvDialSize}
        value={volume}
        min={0}
        max={100}
        tickValues={[0, 25, 50, 75, 100]}
        dimmed={!device.isOn}
        formatValue={(v) => `Vol ${v}`}
        formatTick={(v) => `${v}`}
        onChange={(v) => {
          const next = clamp(v, 0, 100);
          deviceClient
            .sendCommand({
              op: "set-volume",
              deviceId: device.id,
              value: next,
            })
            .catch(() => {});
        }}
        centerContent={
          <View style={tvOrbStyle}>
            <LinearGradient
              colors={["#4BC6E6", "#1F7EA9"]}
              start={{ x: 0.2, y: 0.1 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.tvOrbInner}
            >
              <Ionicons
                name={device.muted ? "volume-mute" : "volume-high"}
                size={28}
                color="#fff"
              />
              <Text style={tvVolumeValueStyle}>
                {device.muted ? "Muted" : `${volume}%`}
              </Text>
              <Text style={tvVolumeLabelStyle}>
                {device.muted ? "Sound off" : "Volume"}
              </Text>
            </LinearGradient>
          </View>
        }
      />
      <Text style={styles.tvVolumeHint}>
        {device.isOn ? "Swipe the ring to fine-tune." : "TV off - volume ready"}
      </Text>
    </View>
  );
  const tvRemoteCard = (
    <View style={remoteCardStyle}>
      <View style={styles.tvRemoteHeader}>
        <Text style={styles.tvRemoteTitle}>Remote</Text>
        <View style={styles.tvRemoteBadge}>
          <Ionicons
            name={tvIsLive ? "radio" : "apps"}
            size={12}
            color={stylesVars.ink}
          />
          <Text style={styles.tvRemoteBadgeText} numberOfLines={1}>
            {device.isOn && tvIsLive ? `Ch ${channel}` : tvSource}
          </Text>
        </View>
      </View>
      <View style={styles.remoteGrid}>
        {[
          { label: "Guide", icon: "list", app: "Guide" },
          {
            label: "YouTube",
            icon: "logo-youtube",
            app: "YouTube",
          },
          { label: "Netflix", icon: "film", app: "Netflix" },
          {
            label: "Settings",
            icon: "settings",
            app: "Settings",
          },
        ].map((item) => (
          <Pressable
            key={item.label}
            style={remoteBtnWideStyle}
            onPress={() => {
              deviceClient
                .sendCommand({
                  op: "launch-app",
                  deviceId: device.id,
                  app: item.app,
                })
                .catch(() => {});
            }}
          >
            <Ionicons
              name={item.icon as any}
              size={18}
              color="#0c0c12"
            />
            <Text style={styles.remoteText} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={remoteRowTop8Style}>
        <Pressable
          style={styles.remoteBtnCompact}
          onPress={() =>
            deviceClient
              .sendCommand({
                op: "media",
                deviceId: device.id,
                action: "rewind",
              })
              .catch(() => {})
          }
        >
          <Ionicons name="play-back" size={16} color="#0c0c12" />
          <Text style={styles.remoteText}>Rew</Text>
        </Pressable>
        <Pressable
          style={styles.remoteBtnCompact}
          onPress={() =>
            deviceClient
              .sendCommand({
                op: "media",
                deviceId: device.id,
                action: "play-pause",
              })
              .catch(() => {})
          }
        >
          <Ionicons name="play" size={16} color="#0c0c12" />
          <Text style={styles.remoteText}>Play/Pause</Text>
        </Pressable>
        <Pressable
          style={styles.remoteBtnCompact}
          onPress={() =>
            deviceClient
              .sendCommand({
                op: "media",
                deviceId: device.id,
                action: "fast-forward",
              })
              .catch(() => {})
          }
        >
          <Ionicons name="play-forward" size={16} color="#0c0c12" />
          <Text style={styles.remoteText}>Fwd</Text>
        </Pressable>
      </View>
      <View style={remoteRowTop6Style}>
        <Pressable
          style={styles.remoteBtnCompact}
          onPress={() =>
            deviceClient
              .sendCommand({
                op: "media",
                deviceId: device.id,
                action: "previous",
              })
              .catch(() => {})
          }
        >
          <Ionicons name="play-skip-back" size={16} color="#0c0c12" />
          <Text style={styles.remoteText}>Prev</Text>
        </Pressable>
        <Pressable
          style={styles.remoteBtnCompact}
          onPress={() =>
            deviceClient
              .sendCommand({
                op: "media",
                deviceId: device.id,
                action: "next",
              })
              .catch(() => {})
          }
        >
          <Ionicons name="play-skip-forward" size={16} color="#0c0c12" />
          <Text style={styles.remoteText}>Next</Text>
        </Pressable>
      </View>
      <View style={styles.remotePadWrap}>
        <View style={styles.remotePadArea}>
          <Pressable
            style={remoteSideLeftStyle}
            onPress={() => {
              const next = !device.muted;
              deviceClient
                .sendCommand({
                  op: "set-muted",
                  deviceId: device.id,
                  value: next,
                })
                .catch(() => {});
            }}
          >
            <Ionicons
              name={device.muted ? "volume-mute" : "volume-mute-outline"}
              size={18}
              color={stylesVars.ink}
            />
          </Pressable>
          <View style={styles.navPad}>
            <Pressable
              style={navUpStyle}
              onPress={() =>
                deviceClient
                  .sendCommand({
                    op: "nav",
                    deviceId: device.id,
                    action: "up",
                  })
                  .catch(() => {})
              }
            >
              <Ionicons name="chevron-up" size={18} color="#0c0c12" />
            </Pressable>
            <Pressable
              style={navLeftStyle}
              onPress={() =>
                deviceClient
                  .sendCommand({
                    op: "nav",
                    deviceId: device.id,
                    action: "left",
                  })
                  .catch(() => {})
              }
            >
              <Ionicons name="chevron-back" size={18} color="#0c0c12" />
            </Pressable>
            <Pressable
              style={styles.navCenter}
              onPress={() =>
                deviceClient
                  .sendCommand({
                    op: "nav",
                    deviceId: device.id,
                    action: "select",
                  })
                  .catch(() => {})
              }
            >
              <Text style={styles.navCenterText}>OK</Text>
            </Pressable>
            <Pressable
              style={navRightStyle}
              onPress={() =>
                deviceClient
                  .sendCommand({
                    op: "nav",
                    deviceId: device.id,
                    action: "right",
                  })
                  .catch(() => {})
              }
            >
              <Ionicons name="chevron-forward" size={18} color="#0c0c12" />
            </Pressable>
            <Pressable
              style={navDownStyle}
              onPress={() =>
                deviceClient
                  .sendCommand({
                    op: "nav",
                    deviceId: device.id,
                    action: "down",
                  })
                  .catch(() => {})
              }
            >
              <Ionicons name="chevron-down" size={18} color="#0c0c12" />
            </Pressable>
          </View>
          <Pressable
            style={remoteSideRightStyle}
            onPress={() => {
              sendPatch({ source: "Home", isOn: true });
              deviceClient
                .sendCommand({
                  op: "nav",
                  deviceId: device.id,
                  action: "home",
                })
                .catch(() => {});
            }}
          >
            <Ionicons name="home" size={18} color={stylesVars.ink} />
          </Pressable>
        </View>
      </View>
      <View style={remoteRowTop6Style}>
        <Pressable
          style={styles.remoteBtnCompact}
          onPress={() => {
            const next = clamp(channel + 1, 1, 999);
            deviceClient
              .sendCommand({
                op: "patch",
                deviceId: device.id,
                patch: {
                  channel: next,
                  source: "Live TV",
                  isOn: true,
                },
              })
              .catch(() => {});
          }}
        >
          <Ionicons name="caret-up" size={18} color="#0c0c12" />
          <Text style={styles.remoteText}>Ch +</Text>
        </Pressable>
        <Pressable
          style={styles.remoteBtnCompact}
          onPress={() => {
            const next = clamp(channel - 1, 1, 999);
            deviceClient
              .sendCommand({
                op: "patch",
                deviceId: device.id,
                patch: {
                  channel: next,
                  source: "Live TV",
                  isOn: true,
                },
              })
              .catch(() => {});
          }}
        >
          <Ionicons name="caret-down" size={18} color="#0c0c12" />
          <Text style={styles.remoteText}>Ch -</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={outerStyle}
    >
      <BackgroundLines />

      <SafeAreaView style={styles.safe} edges={["top"]}>
        <>
          <LinearGradient
            colors={[
              "rgba(255,255,255,0.92)",
              "rgba(246,238,255,0.88)",
              "rgba(238,228,255,0.86)",
            ]}
            start={{ x: 0.1, y: 0.1 }}
            end={{ x: 1, y: 1 }}
            style={panelStyle}
          >
          <View style={styles.panelBody}>
            <View style={headerPillStyle}>
              <Pressable
                onPress={() => navigation.goBack()}
                style={headerBtnStyle}
                hitSlop={10}
              >
                <Ionicons
                  name="chevron-back"
                  size={Math.round(20 * scale)}
                  color={stylesVars.ink}
                />
              </Pressable>

              <Text
                style={headerTitleStyle}
                numberOfLines={1}
                pointerEvents="none"
              >
                {device.name}
              </Text>

              <Pressable
                style={headerBtnStyle}
                hitSlop={10}
                onPress={() => setShowEdit(true)}
                testID="device-options-button"
              >
                <Ionicons
                  name="options-outline"
                  size={Math.round(20 * scale)}
                  color={stylesVars.ink}
                />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={panelScrollContentStyle}
            >
              {renderLandscapeContent(
                showCapabilities ? (
                  <View style={sectionTopStyle}>
                    <View style={styles.genericHero}>
                      <View style={styles.genericIcon}>
                        <DeviceIcon
                          kind={device.kind}
                          size={32}
                          color={stylesVars.ink}
                        />
                      </View>
                      <View style={flex1Style}>
                        <Text style={styles.heroTitle}>{device.name}</Text>
                        <Text style={styles.heroSub}>
                          {device.isOn ? "Running" : "Off"}
                          {roomName ? ` • ${roomName}` : ""}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.capabilitiesWrap}>
                      <DeviceCapabilityControls
                        device={device}
                        context="detail"
                        variant="light"
                        layout="cards"
                      />
                    </View>
                  </View>
                ) : isAC ? (
                  isTabletLandscape ? (
                    <>
                      <View style={landscapeColumnGapStyle}>
                        {acHeroNodes}
                      </View>
                      <View style={landscapeColumnGapStyle}>
                        {acControlNodes}
                      </View>
                    </>
                  ) : (
                    <>
                      {acHeroNodes}
                      {acControlNodes}
                    </>
                  )
                ) : (
                <View style={sectionTopStyle}>
                  {!hasCustom && (
                    <View style={styles.genericHero}>
                      <View style={styles.genericIcon}>
                        <DeviceIcon
                          kind={device.kind}
                          size={32}
                          color={stylesVars.ink}
                        />
                      </View>
                      <View style={flex1Style}>
                        <Text style={styles.heroTitle}>{device.name}</Text>
                        <Text style={styles.heroSub}>
                          {device.isOn ? "Running" : "Off"}
                        </Text>
                      </View>
                    </View>
                  )}

                  {device.kind === "light" && (
                    <View
                      style={lightLayoutStyle}
                    >
                      <View
                        style={lightDialColumnStyle}
                      >
                        <View style={lightDialCardStyle}>
                          <RadialDial
                            size={lightDialSize}
                            value={brightness}
                            min={0}
                            max={100}
                            tickValues={[0, 25, 50, 75, 100]}
                            centerContent={
                              <Animated.View
                                style={lightCenterOrbStyle}
                              >
                                <LinearGradient
                                  colors={bulbGradient}
                                  start={{ x: 0.2, y: 0.1 }}
                                  end={{ x: 0.9, y: 1 }}
                                  style={lightCenterInnerStyle}
                                >
                                  <Ionicons
                                    name="bulb"
                                    size={lightCenterIcon}
                                    color={bulbIconColor}
                                  />
                                  <Text
                                    style={lightCenterValueStyle}
                                  >
                                    {device.brightness ?? 60}%
                                  </Text>
                                  <Text
                                    style={lightCenterRoomStyle}
                                  >
                                    {roomName || "Light"}
                                  </Text>
                                </LinearGradient>
                              </Animated.View>
                            }
                            formatTick={(v) => `${v}`}
                            formatValue={(v) => `${v}%`}
                            formatCenterValue={(v) => `${v}%`}
                            dimmed={!device.isOn}
                            onChange={(v) => {
                              animateBulb();
                              sendPatch({
                                brightness: clamp(v, 0, 100),
                                isOn: v > 0,
                              });
                            }}
                          />

                          <Text
                            style={lightCardHintStyle}
                          >
                            Color
                          </Text>
                          <View style={lightColorRowStyle}>
                            {[
                              "#FFD166",
                              "#A0E9FF",
                              "#FF9AA2",
                              "#B69CFF",
                              "#A5FF9B",
                              "#FFFFFF",
                            ].map((c) => (
                              <Pressable
                                key={c}
                                onPress={() =>
                                  sendPatch({ color: c, isOn: true })
                                }
                                style={lightSwatchStyleFor(c, device.color === c)}
                              />
                            ))}
                          </View>

                          <Text
                            style={lightCardHintStyle}
                          >
                            Scenes
                          </Text>
                          <View style={lightSceneRowStyle}>
                            {[
                              {
                                label: "Warm",
                                brightness: 60,
                                color: "#FFD166",
                                icon: "sunny" as const,
                              },
                              {
                                label: "Cool",
                                brightness: 70,
                                color: "#A0E9FF",
                                icon: "snow" as const,
                              },
                              {
                                label: "Focus",
                                brightness: 80,
                                color: "#FFFFFF",
                                icon: "flash" as const,
                              },
                            ].map((scene) => (
                              <Pressable
                                key={scene.label}
                                style={lightSceneCardStyle}
                                onPress={() => {
                                  animateBulb();
                                  sendPatch({
                                    brightness: scene.brightness,
                                    color: scene.color,
                                    isOn: true,
                                  });
                                }}
                              >
                                <View style={lightSceneIconWrapStyle}>
                                  <Ionicons
                                    name={scene.icon}
                                    size={lightSceneIconSize}
                                    color={stylesVars.ink}
                                  />
                                </View>
                                <Text style={lightSceneTextStyle}>
                                  {scene.label}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      </View>

                      <View style={lightControlsColumnLayoutStyle}>
                        {isTablet ? (
                          <>
                            <View style={lightControlCardStyle}>
                              <Text style={styles.cardLabel}>Temperature</Text>
                              <Text
                                style={lightCardHintStyle}
                              >
                                {colorTempK}K
                              </Text>
                              <View style={styles.chipRow}>
                                {LIGHT_TEMP_PRESETS.map((preset) => {
                                  const active =
                                    Math.abs(colorTempK - preset.value) <= 200;
                                  return (
                                    <Pressable
                                      key={preset.label}
                                      style={chipStyle(active)}
                                      onPress={() =>
                                        sendPatch({
                                          colorTempK: preset.value,
                                          isOn: true,
                                        })
                                      }
                                    >
                                      <Text
                                        style={chipTextStyle(active)}
                                      >
                                        {preset.label}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>

                              <Text
                                style={lightCardHintTopStyle}
                              >
                                Effects
                              </Text>
                              <View style={chipRowTopStyle}>
                                {LIGHT_EFFECTS.map((effect) => {
                                  const active = lightEffect === effect.value;
                                  return (
                                    <Pressable
                                      key={effect.value}
                                      style={chipRowItemStyle(active)}
                                      onPress={() =>
                                        sendPatch({
                                          lightEffect: effect.value,
                                          isOn: true,
                                        })
                                      }
                                    >
                                      <Ionicons
                                        name={effect.icon}
                                        size={lightSceneIconSize}
                                        color={
                                          active
                                            ? stylesVars.ink
                                            : stylesVars.subtext
                                        }
                                      />
                                      <Text
                                        style={chipTextStyle(active)}
                                      >
                                        {effect.label}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>

                            <View style={lightControlCardStyle}>
                              <Text style={styles.cardLabel}>Automation</Text>
                              <View style={styles.chipRow}>
                                <Pressable
                                  style={chipStyle(adaptiveLighting)}
                                  onPress={() =>
                                    sendPatch({
                                      adaptiveLighting: !adaptiveLighting,
                                    })
                                  }
                                >
                                  <Text
                                    style={chipTextStyle(adaptiveLighting)}
                                  >
                                    Adaptive
                                  </Text>
                                </Pressable>
                                <Pressable
                                  style={chipStyle(motionBoost)}
                                  onPress={() =>
                                    sendPatch({ motionBoost: !motionBoost })
                                  }
                                >
                                  <Text
                                    style={chipTextStyle(motionBoost)}
                                  >
                                    Motion
                                  </Text>
                                </Pressable>
                                <Pressable
                                  style={chipStyle(nightShift)}
                                  onPress={() =>
                                    sendPatch({ nightShift: !nightShift })
                                  }
                                >
                                  <Text
                                    style={chipTextStyle(nightShift)}
                                  >
                                    Night Shift
                                  </Text>
                                </Pressable>
                              </View>

                              <Text
                                style={lightCardHintTopStyle}
                              >
                                Auto-off
                              </Text>
                              <View style={chipRowTopStyle}>
                                {LIGHT_AUTO_OFF.map((minutes) => {
                                  const active = autoOffMin === minutes;
                                  return (
                                    <Pressable
                                      key={minutes}
                                      style={chipStyle(active)}
                                      onPress={() =>
                                        sendPatch({ autoOffMin: minutes })
                                      }
                                    >
                                      <Text
                                        style={chipTextStyle(active)}
                                      >
                                        {minutes === 0 ? "Off" : `${minutes}m`}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>
                          </>
                        ) : lightControlsCompact ? (
                          <View style={lightControlsGridStyle}>
                            <View style={lightControlCompactStyle}>
                              <View style={styles.lightControlHeaderRow}>
                                <Text style={styles.cardLabel}>
                                  Temperature
                                </Text>
                                <Text style={lightCardHintStyle}>
                                  {colorTempK}K
                                </Text>
                              </View>
                              <View style={styles.chipRow}>
                                {LIGHT_TEMP_PRESETS.map((preset) => {
                                  const active =
                                    Math.abs(colorTempK - preset.value) <= 200;
                                  return (
                                    <Pressable
                                      key={preset.label}
                                      style={chipStyle(active)}
                                      onPress={() =>
                                        sendPatch({
                                          colorTempK: preset.value,
                                          isOn: true,
                                        })
                                      }
                                    >
                                      <Text style={chipTextStyle(active)}>
                                        {preset.label}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>

                              <Text
                                style={lightCardHintTopStyle}
                              >
                                Effects
                              </Text>
                              <View style={chipRowTopStyle}>
                                {LIGHT_EFFECTS.map((effect) => {
                                  const active = lightEffect === effect.value;
                                  return (
                                    <Pressable
                                      key={effect.value}
                                      style={chipRowItemStyle(active)}
                                      onPress={() =>
                                        sendPatch({
                                          lightEffect: effect.value,
                                          isOn: true,
                                        })
                                      }
                                    >
                                      <Ionicons
                                        name={effect.icon}
                                        size={lightSceneIconSize}
                                        color={
                                          active
                                            ? stylesVars.ink
                                            : stylesVars.subtext
                                        }
                                      />
                                      <Text
                                        style={chipTextStyle(active)}
                                      >
                                        {effect.label}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>

                            <View style={lightControlCompactStyle}>
                              <Text style={styles.cardLabel}>Automation</Text>
                              <View style={styles.chipRow}>
                                <Pressable
                                  style={chipStyle(adaptiveLighting)}
                                  onPress={() =>
                                    sendPatch({
                                      adaptiveLighting: !adaptiveLighting,
                                    })
                                  }
                                >
                                  <Text
                                    style={chipTextStyle(adaptiveLighting)}
                                  >
                                    Adaptive
                                  </Text>
                                </Pressable>
                                <Pressable
                                  style={chipStyle(motionBoost)}
                                  onPress={() =>
                                    sendPatch({ motionBoost: !motionBoost })
                                  }
                                >
                                  <Text
                                    style={chipTextStyle(motionBoost)}
                                  >
                                    Motion
                                  </Text>
                                </Pressable>
                                <Pressable
                                  style={chipStyle(nightShift)}
                                  onPress={() =>
                                    sendPatch({ nightShift: !nightShift })
                                  }
                                >
                                  <Text
                                    style={chipTextStyle(nightShift)}
                                  >
                                    Night Shift
                                  </Text>
                                </Pressable>
                              </View>

                              <Text
                                style={lightCardHintTopStyle}
                              >
                                Auto-off
                              </Text>
                              <View style={chipRowTopStyle}>
                                {LIGHT_AUTO_OFF.map((minutes) => {
                                  const active = autoOffMin === minutes;
                                  return (
                                    <Pressable
                                      key={minutes}
                                      style={chipStyle(active)}
                                      onPress={() =>
                                        sendPatch({ autoOffMin: minutes })
                                      }
                                    >
                                      <Text
                                        style={chipTextStyle(active)}
                                      >
                                        {minutes === 0 ? "Off" : `${minutes}m`}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>
                          </View>
                        ) : (
                          <View style={lightControlCardStyle}>
                            <Text style={styles.cardLabel}>Temperature</Text>
                            <Text
                              style={lightCardHintStyle}
                            >
                              {colorTempK}K
                            </Text>
                            <View style={styles.chipRow}>
                              {LIGHT_TEMP_PRESETS.map((preset) => {
                                const active =
                                  Math.abs(colorTempK - preset.value) <= 200;
                                return (
                                  <Pressable
                                    key={preset.label}
                                    style={chipStyle(active)}
                                    onPress={() =>
                                      sendPatch({
                                        colorTempK: preset.value,
                                        isOn: true,
                                      })
                                    }
                                  >
                                    <Text
                                      style={chipTextStyle(active)}
                                    >
                                      {preset.label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>

                            <Text
                              style={lightCardHintTopStyle}
                            >
                              Effects
                            </Text>
                            <View style={chipRowTopStyle}>
                              {LIGHT_EFFECTS.map((effect) => {
                                const active = lightEffect === effect.value;
                                return (
                                  <Pressable
                                    key={effect.value}
                                    style={chipRowItemStyle(active)}
                                    onPress={() =>
                                      sendPatch({
                                        lightEffect: effect.value,
                                        isOn: true,
                                      })
                                    }
                                  >
                                    <Ionicons
                                      name={effect.icon}
                                      size={lightSceneIconSize}
                                      color={
                                        active
                                          ? stylesVars.ink
                                          : stylesVars.subtext
                                      }
                                    />
                                    <Text
                                      style={chipTextStyle(active)}
                                    >
                                      {effect.label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>

                            <Text
                              style={lightCardHintTopStyle}
                            >
                              Automation
                            </Text>
                            <View style={styles.chipRow}>
                              <Pressable
                                style={chipStyle(adaptiveLighting)}
                                onPress={() =>
                                  sendPatch({
                                    adaptiveLighting: !adaptiveLighting,
                                  })
                                }
                              >
                                <Text
                                  style={chipTextStyle(adaptiveLighting)}
                                >
                                  Adaptive
                                </Text>
                              </Pressable>
                              <Pressable
                                style={chipStyle(motionBoost)}
                                onPress={() =>
                                  sendPatch({ motionBoost: !motionBoost })
                                }
                              >
                                <Text
                                  style={chipTextStyle(motionBoost)}
                                >
                                  Motion
                                </Text>
                              </Pressable>
                              <Pressable
                                style={chipStyle(nightShift)}
                                onPress={() =>
                                  sendPatch({ nightShift: !nightShift })
                                }
                              >
                                <Text
                                  style={chipTextStyle(nightShift)}
                                >
                                  Night Shift
                                </Text>
                              </Pressable>
                            </View>

                            <Text
                              style={lightCardHintTopStyle}
                            >
                              Auto-off
                            </Text>
                            <View style={chipRowTopStyle}>
                              {LIGHT_AUTO_OFF.map((minutes) => {
                                const active = autoOffMin === minutes;
                                return (
                                  <Pressable
                                    key={minutes}
                                    style={chipStyle(active)}
                                    onPress={() =>
                                      sendPatch({ autoOffMin: minutes })
                                    }
                                  >
                                    <Text
                                      style={chipTextStyle(active)}
                                    >
                                      {minutes === 0 ? "Off" : `${minutes}m`}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                  {device.kind === "garage" &&
                    (isLandscapeSplit ? (
                      <>
                        <View style={openColumnStyle}>
                          {garageHeroCard}
                        </View>
                        <View style={openColumnStyle}>
                          {garageStatusCard}
                          {garageActionCard}
                        </View>
                      </>
                    ) : (
                      <>
                        {garageHeroCard}
                      </>
                    ))}

                  {device.kind === "door" &&
                    (isLandscapeSplit ? (
                      <>
                        <View style={openColumnStyle}>
                          {doorHeroCard}
                        </View>
                        <View style={openColumnStyle}>
                          {doorStatusCard}
                          {doorActionCard}
                        </View>
                      </>
                    ) : (
                      <>
                        {doorHeroCard}
                      </>
                    ))}

                  {device.kind === "gate" && (
                    <>
                      <View style={styles.doorWrap}>
                        {renderOpenDeviceLottie(
                          GATE_LOTTIE_SOURCE,
                          gateLottieSize,
                        )}
                        <Text style={styles.doorTitle}>Front Gate</Text>
                        <Text style={styles.doorStatus}>{openStatusText}</Text>
                      </View>

                      <View style={styles.actionRow}>
                        <Pressable
                          style={modeTileStyle(isOpen)}
                          onPress={openGate}
                        >
                          {isOpen ? (
                            <LinearGradient
                              colors={[
                                theme.colors.accent2,
                                theme.colors.accent,
                              ]}
                              start={{ x: 0.1, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.modeIconBubbleActive}
                            >
                              <Ionicons
                                name="lock-open"
                                size={18}
                                color="#FFFFFF"
                              />
                            </LinearGradient>
                          ) : (
                            <View style={styles.modeIconBubble}>
                              <Ionicons
                                name="lock-open"
                                size={18}
                                color="rgba(12,12,18,0.65)"
                              />
                            </View>
                          )}
                          <Text
                            style={modeTextStyle(isOpen)}
                          >
                            Open
                          </Text>
                        </Pressable>
                        <Pressable
                          style={modeTileStyle(isClosed)}
                          onPress={closeGate}
                        >
                          {isClosed ? (
                            <LinearGradient
                              colors={[
                                theme.colors.accent2,
                                theme.colors.accent,
                              ]}
                              start={{ x: 0.1, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.modeIconBubbleActive}
                            >
                              <Ionicons
                                name="lock-closed"
                                size={18}
                                color="#FFFFFF"
                              />
                            </LinearGradient>
                          ) : (
                            <View style={styles.modeIconBubble}>
                              <Ionicons
                                name="lock-closed"
                                size={18}
                                color="rgba(12,12,18,0.65)"
                              />
                            </View>
                          )}
                          <Text
                            style={modeTextStyle(isClosed)}
                          >
                            Close
                          </Text>
                        </Pressable>
                      </View>

                      <View style={gateAutoCardStyle}>
                        <Text
                          style={gateAutoLabelStyle}
                        >
                          Auto-open
                        </Text>
                        <Text
                          style={gateAutoHintStyle}
                        >
                          Use recognition + proximity to unlock for known faces.
                        </Text>
                        <View
                          style={gateAutoChipRowStyle}
                        >
                          <Pressable
                            style={chipStyle(gateAutoOpen)}
                            onPress={() =>
                              sendPatch({ autoOpenEnabled: !gateAutoOpen })
                            }
                          >
                            <Text
                              style={chipTextStyle(gateAutoOpen)}
                            >
                              {gateAutoOpen ? "Enabled" : "Disabled"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </>
                  )}

                  {device.kind === "fridge" && (
                    <>
                      <RadialDial
                        size={compactDialSize}
                        value={fridgeTemp}
                        min={1}
                        max={8}
                        tickValues={[1, 3, 5, 7, 8]}
                        centerLabel="Fridge Temp"
                        centerIcon={
                          <View style={marginBottom6Style}>
                            <Ionicons
                              name="thermometer"
                              size={28}
                              color={stylesVars.ink}
                            />
                          </View>
                        }
                        formatTick={(v) => `${v}`}
                        formatValue={(v) => `${v}`}
                        formatCenterValue={(v) => `${v}°C`}
                        dimmed={!device.isOn}
                        onChange={(v) =>
                          sendPatch({ tempC: clamp(v, 1, 8), isOn: true })
                        }
                      />

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Presets</Text>
                        <View style={styles.chipRow}>
                          {[
                            { label: "Eco", value: 5 },
                            { label: "Normal", value: 4 },
                            { label: "Boost", value: 2 },
                          ].map((preset) => {
                            const active = fridgeTemp === preset.value;
                            return (
                              <Pressable
                                key={preset.label}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({ tempC: preset.value, isOn: true })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {preset.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={styles.metricRow}>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {freezerTemp}°C
                          </Text>
                          <Text style={styles.metricLabel}>Freezer</Text>
                        </View>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {fridgeFilterLife}%
                          </Text>
                          <Text style={styles.metricLabel}>Filter life</Text>
                        </View>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {fridgeHumidity}%
                          </Text>
                          <Text style={styles.metricLabel}>Humidity</Text>
                        </View>
                      </View>

                      {fridgeDoorOpen && (
                        <View style={styles.alertRow}>
                          <Ionicons name="warning" size={14} color="#D8465B" />
                          <Text style={styles.alertText}>
                            Door left open
                          </Text>
                        </View>
                      )}

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Freezer</Text>
                        <View style={styles.pressureSliderRow}>
                          <Text style={styles.pressureSliderLabel}>Temp</Text>
                          <Text style={styles.pressureSliderValue}>
                            {freezerTemp}°C
                          </Text>
                        </View>
                        <Slider
                          value={freezerTemp}
                          minimumValue={-24}
                          maximumValue={-12}
                          step={1}
                          onSlidingComplete={(value) =>
                            sendPatch({
                              freezerTempC: Math.round(value),
                              isOn: true,
                            })
                          }
                          minimumTrackTintColor="rgba(122,92,255,0.9)"
                          maximumTrackTintColor="rgba(12,12,18,0.12)"
                          thumbTintColor="rgba(255,255,255,0.92)"
                          style={styles.pressureSlider}
                        />
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Modes</Text>
                        <View style={styles.chipRow}>
                          {[
                            { label: "Eco", value: "eco" },
                            { label: "Normal", value: "normal" },
                            { label: "Boost", value: "boost" },
                            { label: "Vacation", value: "vacation" },
                          ].map((option) => {
                            const active = fridgeMode === option.value;
                            return (
                              <Pressable
                                key={option.value}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({
                                    fridgeMode:
                                      option.value as Device["fridgeMode"],
                                    isOn: true,
                                  })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {option.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Quick actions</Text>
                        <View style={controlCardRowTopStyle}>
                          <Pressable
                            style={controlPillStyle(fridgeQuickCool)}
                            onPress={() =>
                              sendPatch({
                                fridgeQuickCool: !fridgeQuickCool,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(fridgeQuickCool)}
                            >
                              {fridgeQuickCool ? "Quick cool" : "Cool Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={controlPillStyle(fridgeQuickFreeze)}
                            onPress={() =>
                              sendPatch({
                                fridgeQuickFreeze: !fridgeQuickFreeze,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(fridgeQuickFreeze)}
                            >
                              {fridgeQuickFreeze
                                ? "Quick freeze"
                                : "Freeze Off"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Hardware</Text>
                        <View style={controlCardRowTopStyle}>
                          <Pressable
                            style={controlPillStyle(fridgeIceMaker)}
                            onPress={() =>
                              sendPatch({
                                fridgeIceMaker: !fridgeIceMaker,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(fridgeIceMaker)}
                            >
                              {fridgeIceMaker ? "Ice maker" : "Ice Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={controlPillStyle(fridgeDoorAlarm)}
                            onPress={() =>
                              sendPatch({
                                fridgeDoorAlarm: !fridgeDoorAlarm,
                              })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(fridgeDoorAlarm)}
                            >
                              {fridgeDoorAlarm ? "Door alarm" : "Alarm Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={controlPillStyle(fridgeEnergySaver)}
                            onPress={() =>
                              sendPatch({
                                fridgeEnergySaver: !fridgeEnergySaver,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(fridgeEnergySaver)}
                            >
                              {fridgeEnergySaver
                                ? "Energy saver"
                                : "Saver Off"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Humidity drawers</Text>
                        <View style={styles.chipRow}>
                          {[40, 50, 60].map((value) => {
                            const active = fridgeHumidity === value;
                            return (
                              <Pressable
                                key={value}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({ fridgeHumidity: value })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {value}%
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </>
                  )}

                  {device.kind === "fan" && (
                    <>
                      <RadialDial
                        size={compactDialSize}
                        value={fanSpeed}
                        min={0}
                        max={100}
                        tickValues={[0, 25, 50, 75, 100]}
                        centerLabel="Fan Speed"
                        centerIcon={
                          <View style={marginBottom6Style}>
                            <Ionicons
                              name="aperture"
                              size={28}
                              color={stylesVars.ink}
                            />
                          </View>
                        }
                        formatTick={(v) => `${v}`}
                        formatValue={(v) => `${v}%`}
                        formatCenterValue={(v) => `${v}%`}
                        dimmed={!device.isOn}
                        onChange={(v) =>
                          sendPatch({ speed: clamp(v, 0, 100), isOn: v > 0 })
                        }
                      />

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Modes</Text>
                        <View style={styles.chipRow}>
                          {[
                            { label: "Breeze", value: 35 },
                            { label: "Standard", value: 60 },
                            { label: "Turbo", value: 90 },
                          ].map((preset) => {
                            const active = fanSpeed === preset.value;
                            return (
                              <Pressable
                                key={preset.label}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({ speed: preset.value, isOn: true })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {preset.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Oscillation</Text>
                        <View style={controlCardRowTopStyle}>
                          <Pressable
                            style={controlPillStyle(fanOscillation)}
                            onPress={() =>
                              sendPatch({
                                fanOscillation: !fanOscillation,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(fanOscillation)}
                            >
                              {fanOscillation ? "Oscillate" : "Fixed"}
                            </Text>
                          </Pressable>
                        </View>
                        <Text style={styles.cardHint}>Direction</Text>
                        <View style={styles.chipRow}>
                          {[
                            { label: "Forward", value: "forward" },
                            { label: "Reverse", value: "reverse" },
                          ].map((option) => {
                            const active = fanDirection === option.value;
                            return (
                              <Pressable
                                key={option.value}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({
                                    fanDirection:
                                      option.value as Device["fanDirection"],
                                    isOn: true,
                                  })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {option.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Timer & light</Text>
                        <View style={styles.chipRow}>
                          {[0, 30, 60, 120].map((value) => {
                            const active = fanTimerMin === value;
                            return (
                              <Pressable
                                key={value}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({ fanTimerMin: value, isOn: true })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {value === 0 ? "Off" : `${value}m`}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <View style={controlCardRowTopStyle}>
                          <Pressable
                            style={controlPillStyle(fanLightOn)}
                            onPress={() =>
                              sendPatch({
                                fanLightOn: !fanLightOn,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(fanLightOn)}
                            >
                              {fanLightOn ? "Light on" : "Light off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={controlPillStyle(fanAutoMode)}
                            onPress={() =>
                              sendPatch({
                                fanAutoMode: !fanAutoMode,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(fanAutoMode)}
                            >
                              {fanAutoMode ? "Auto" : "Auto off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={controlPillStyle(fanSleepMode)}
                            onPress={() =>
                              sendPatch({
                                fanSleepMode: !fanSleepMode,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(fanSleepMode)}
                            >
                              {fanSleepMode ? "Sleep" : "Sleep off"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </>
                  )}

                  {device.kind === "window" && (
                    <>
                      <LinearGradient
                        colors={[
                          "rgba(255,255,255,0.95)",
                          "rgba(226,236,255,0.9)",
                          "rgba(214,224,255,0.86)",
                        ]}
                        start={{ x: 0.1, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={windowHeroCardStyle}
                      >
                        <View style={styles.windowHeroHeader}>
                          <View style={styles.windowHeroTitleWrap}>
                            <Text style={styles.windowHeroTitle}>
                              {device.name}
                            </Text>
                            <Text style={styles.windowHeroSub}>
                              {openStatusText}
                            </Text>
                          </View>
                          <View
                            style={windowHeroPillStyle(openDisplayValue > 0)}
                          >
                            <Ionicons
                              name={
                                openDisplayValue > 0 ? "leaf" : "lock-closed"
                              }
                              size={14}
                              color={
                                openDisplayValue > 0
                                  ? theme.colors.accent2
                                  : stylesVars.subtext
                              }
                            />
                            <Text
                              style={windowHeroPillTextStyle(
                                openDisplayValue > 0,
                              )}
                            >
                              {windowFlowLabel}
                            </Text>
                          </View>
                        </View>
                        <View
                          style={windowHeroBodyStyle}
                        >
                          <View
                            style={windowHeroOrbStyle(isOpen)}
                          >
                            <LinearGradient
                              colors={[
                                "rgba(122,92,255,0.24)",
                                "rgba(180,107,255,0.18)",
                                "rgba(255,255,255,0.9)",
                              ]}
                              start={{ x: 0.2, y: 0.1 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.windowHeroOrbGlow}
                            />
                            <AnimatedLottieView
                              source={WINDOW_LOTTIE_SOURCE}
                              progress={openProgress}
                              autoPlay={false}
                              loop={false}
                              resizeMode="contain"
                              style={styles.windowHeroLottie}
                            />
                          </View>
                          <View
                            style={windowHeroControlsStyle}
                          >
                            <View style={styles.windowHeroMeterRow}>
                              <Text style={styles.windowHeroMeterLabel}>
                                Ventilation
                              </Text>
                              <Text style={styles.windowHeroMeterValue}>
                                {openDisplayValue}%
                              </Text>
                            </View>
                            <View style={styles.windowHeroSliderWrap}>
                              <View style={styles.windowHeroTrack}>
                                <View
                                  style={windowHeroTrackFillStyle}
                                />
                              </View>
                              <Slider
                                value={openDisplayValue}
                                minimumValue={0}
                                maximumValue={100}
                                step={1}
                                onSlidingComplete={(value) =>
                                  sendPatch({
                                    openPercent: clamp(value, 0, 100),
                                    isOn: value > 0,
                                  })
                                }
                                minimumTrackTintColor="transparent"
                                maximumTrackTintColor="transparent"
                                thumbTintColor="rgba(255,255,255,0.92)"
                                style={styles.windowHeroSlider}
                              />
                            </View>
                            <Text style={styles.windowHeroHint}>
                              {windowFlowHint}
                            </Text>
                          </View>
                        </View>
                      </LinearGradient>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Quick set</Text>
                        <View style={styles.chipRow}>
                          {[
                            { label: "Open", value: 100 },
                            { label: "Vent", value: 25 },
                            { label: "Close", value: 0 },
                          ].map((preset) => {
                            const active = openPercent === preset.value;
                            return (
                              <Pressable
                                key={preset.label}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({
                                    openPercent: preset.value,
                                    isOn: preset.value > 0,
                                  })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {preset.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </>
                  )}

                  {device.kind === "vacuum" &&
                    (isLandscapeSplit ? (
                      <>
                        <View style={landscapeColumnGapStyle}>
                          {vacuumHeroCard}
                        </View>
                        <View style={landscapeColumnGapStyle}>
                          {vacuumControlCards}
                        </View>
                      </>
                    ) : (
                      <>
                        {vacuumHeroCard}
                        {vacuumControlCards}
                      </>
                    ))}

                  {device.kind === "camera" && (
                    <>
                      {device.isOn ? (
                        <LinearGradient
                          colors={[
                            "rgba(255,255,255,0.9)",
                            "rgba(236,228,255,0.85)",
                          ]}
                          start={{ x: 0.1, y: 0.1 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.cameraFeed}
                        >
                          <View style={styles.cameraFeedHeader}>
                            <View style={styles.cameraLivePill}>
                              <View style={styles.cameraLiveDot} />
                              <Text style={styles.cameraLiveText}>Live</Text>
                            </View>
                            <Text style={styles.cameraStatusText}>
                              {device.isOn ? "Connected" : "Offline"}
                            </Text>
                            {gateDevice ? (
                              <View style={styles.gateStatusPill}>
                                <Text style={styles.gateStatusText}>
                                  Gate{" "}
                                  {gateDevice.openPercent &&
                                  gateDevice.openPercent > 20
                                    ? "Open"
                                    : "Closed"}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={styles.cameraFeedBody}>
                            <Ionicons
                              name="videocam"
                              size={40}
                              color="rgba(12,12,18,0.35)"
                            />
                            <Text style={styles.cameraPreviewText}>
                              Live feed (simulated)
                            </Text>
                          </View>
                        </LinearGradient>
                      ) : (
                        renderDeviceLottie(
                          CAMERA_LOTTIE_SOURCE,
                          compactDialSize,
                        )
                      )}

                      <View style={styles.actionRow}>
                        <Pressable
                          style={modeTileStyle(device.armed)}
                          onPress={() => sendPatch({ armed: !device.armed })}
                        >
                          {device.armed ? (
                            <LinearGradient
                              colors={[
                                theme.colors.accent2,
                                theme.colors.accent,
                              ]}
                              start={{ x: 0.1, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.modeIconBubbleActive}
                            >
                              <Ionicons name="eye" size={18} color="#FFFFFF" />
                            </LinearGradient>
                          ) : (
                            <View style={styles.modeIconBubble}>
                              <Ionicons
                                name="eye"
                                size={18}
                                color="rgba(12,12,18,0.65)"
                              />
                            </View>
                          )}
                          <Text
                            style={modeTextStyle(device.armed)}
                          >
                            {device.armed ? "Armed" : "Arm"}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={modeTileStyle(device.recording)}
                          onPress={() =>
                            sendPatch({ recording: !device.recording })
                          }
                        >
                          {device.recording ? (
                            <LinearGradient
                              colors={[
                                theme.colors.accent2,
                                theme.colors.accent,
                              ]}
                              start={{ x: 0.1, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.modeIconBubbleActive}
                            >
                              <Ionicons
                                name="radio-button-on"
                                size={18}
                                color="#FFFFFF"
                              />
                            </LinearGradient>
                          ) : (
                            <View style={styles.modeIconBubble}>
                              <Ionicons
                                name="radio-button-on"
                                size={18}
                                color="rgba(12,12,18,0.65)"
                              />
                            </View>
                          )}
                          <Text
                            style={modeTextStyle(device.recording)}
                          >
                            {device.recording ? "Recording" : "Record"}
                          </Text>
                        </Pressable>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Recognize faces</Text>
                        <View style={styles.cameraDetectRow}>
                          {household.map((member) => (
                            <Pressable
                              key={member.id}
                              style={styles.cameraDetectPill}
                              onPress={() =>
                                handleKnownFace(member.id, member.name)
                              }
                            >
                              <Ionicons
                                name="person"
                                size={16}
                                color={stylesVars.ink}
                              />
                              <Text style={styles.cameraDetectText}>
                                {member.name.split(" ")[0]}
                              </Text>
                            </Pressable>
                          ))}
                          <Pressable
                            style={styles.cameraDetectPillAlert}
                            onPress={handleUnknownFace}
                          >
                            <Ionicons name="alert" size={16} color="#C4384C" />
                            <Text style={cameraDetectAlertTextStyle}>
                              Unknown
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Household presence</Text>
                        {household.map((member) => (
                          <View key={member.id} style={styles.cameraMemberRow}>
                            <AvatarChip
                              name={member.name}
                              size={32}
                              color={member.avatarColor}
                              uri={member.avatarUri}
                            />
                            <View style={flex1Style}>
                              <Text style={styles.cameraMemberName}>
                                {member.name}
                              </Text>
                              <Text style={styles.cameraMemberRole}>
                                {member.role}
                              </Text>
                            </View>
                            <Pressable
                              style={cameraPresencePillStyle(
                                member.status === "home",
                              )}
                              onPress={() =>
                                setHouseholdPresence(
                                  member.id,
                                  member.status === "home" ? "away" : "home",
                                )
                              }
                            >
                              <Text style={styles.cameraPresenceText}>
                                {member.status === "home" ? "Home" : "Away"}
                              </Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>

                      {gateDevice ? (
                        <View style={controlCardStyle}>
                          <Text style={styles.cardLabel}>
                            Front gate access
                          </Text>
                          <View style={controlCardRowStyle}>
                            <Pressable
                              style={styles.controlPill}
                              onPress={openGate}
                            >
                              <Text style={styles.controlPillText}>
                                Open gate
                              </Text>
                            </Pressable>
                            <Pressable
                              style={styles.controlPill}
                              onPress={closeGate}
                            >
                              <Text style={styles.controlPillText}>
                                Close gate
                              </Text>
                            </Pressable>
                          </View>
                          <View style={styles.chipRow}>
                            <Pressable
                              style={chipStyle(gateAutoOpen)}
                              onPress={() =>
                                deviceClient
                                  .sendCommand({
                                    op: "patch",
                                    deviceId: gateDevice.id,
                                    patch: { autoOpenEnabled: !gateAutoOpen },
                                  })
                                  .catch(() => {})
                              }
                            >
                              <Text
                                style={chipTextStyle(gateAutoOpen)}
                              >
                                Auto-open {gateAutoOpen ? "On" : "Off"}
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}

                      {cameraEvents.length > 0 ? (
                        <View style={controlCardStyle}>
                          <Text style={styles.cardLabel}>
                            Recent detections
                          </Text>
                          {cameraEvents.map((evt) => (
                            <View key={evt.id} style={styles.cameraEventRow}>
                              <View
                                style={cameraEventDotStyle(evt.kind === "known")}
                              />
                              <Text style={styles.cameraEventText}>
                                {evt.label}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Security</Text>
                        <View style={controlCardRowTopStyle}>
                          <Pressable
                            style={controlPillStyle(nightVision)}
                            onPress={() =>
                              sendPatch({ nightVision: !nightVision })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(nightVision)}
                            >
                              {nightVision ? "Night On" : "Night Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={controlPillStyle(motionAlerts)}
                            onPress={() =>
                              sendPatch({ motionAlerts: !motionAlerts })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(motionAlerts)}
                            >
                              {motionAlerts ? "Alerts On" : "Alerts Off"}
                            </Text>
                          </Pressable>
                        </View>
                        <View style={controlCardRowStyle}>
                          <Pressable
                            style={controlPillStyle(micMuted)}
                            onPress={() => sendPatch({ micMuted: !micMuted })}
                          >
                            <Text
                              style={controlPillTextStyle(micMuted)}
                            >
                              {micMuted ? "Mic Muted" : "Mic Live"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={controlPillStyle(twoWayAudio)}
                            onPress={() =>
                              sendPatch({ twoWayAudio: !twoWayAudio })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(twoWayAudio)}
                            >
                              {twoWayAudio ? "Talk On" : "Talk Off"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Motion sensitivity</Text>
                        <View style={styles.chipRow}>
                          {[
                            { label: "Low", value: 3 },
                            { label: "Med", value: 6 },
                            { label: "High", value: 9 },
                          ].map((preset) => {
                            const active = motionSensitivity === preset.value;
                            return (
                              <Pressable
                                key={preset.label}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({ motionSensitivity: preset.value })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {preset.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </>
                  )}

                  {device.kind === "stove" && (
                    <>
                      {device.isOn ? (
                        <RadialDial
                          size={compactDialSize}
                          value={stoveLevel}
                          min={0}
                          max={10}
                          tickValues={[0, 2, 4, 6, 8, 10]}
                          centerLabel="Heat"
                          centerIcon={
                            <View style={marginBottom6Style}>
                              <Ionicons
                                name="flame"
                                size={28}
                                color={stylesVars.ink}
                              />
                            </View>
                          }
                          formatTick={(v) => `${v}`}
                          formatValue={(v) => `${v}`}
                          formatCenterValue={(v) => `Lv ${v}`}
                          dimmed={!device.isOn}
                          onChange={(v) =>
                            sendPatch({
                              burnerLevel: clamp(v, 0, 10),
                              isOn: v > 0,
                            })
                          }
                        />
                      ) : (
                        renderDeviceLottie(STOVE_LOTTIE_SOURCE, compactDialSize)
                      )}

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Presets</Text>
                        <View style={styles.chipRow}>
                          {[
                            { label: "Off", value: 0 },
                            { label: "Low", value: 3 },
                            { label: "Med", value: 6 },
                            { label: "High", value: 9 },
                          ].map((preset) => {
                            const active = stoveLevel === preset.value;
                            return (
                              <Pressable
                                key={preset.label}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({
                                    burnerLevel: preset.value,
                                    isOn: preset.value > 0,
                                  })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {preset.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Mode</Text>
                        <View style={styles.chipRow}>
                          {stoveModeOptions.map((preset) => {
                            const active = stoveMode === preset.value;
                            return (
                              <Pressable
                                key={preset.value}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({ stoveMode: preset.value })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {preset.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Timer</Text>
                        <View style={styles.chipRow}>
                          {[0, 5, 10, 20, 30].map((value) => {
                            const active = stoveTimer === value;
                            const label = value === 0 ? "Off" : `${value} min`;
                            return (
                              <Pressable
                                key={value}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({ stoveTimerMin: value })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <Text style={styles.budgetHint}>
                          {stoveTimer
                            ? `Auto-off in ${stoveTimer} min`
                            : "No timer set"}
                        </Text>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Safety</Text>
                        <View style={controlCardRowTopStyle}>
                          <Pressable
                            style={controlPillStyle(stoveLock)}
                            onPress={() => sendPatch({ stoveLock: !stoveLock })}
                          >
                            <Text
                              style={controlPillTextStyle(stoveLock)}
                            >
                              {stoveLock ? "Child Lock" : "Lock Off"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </>
                  )}

                  {(device.kind === "washer" || device.kind === "dryer") &&
                    (isTabletLandscape ? (
                      <>
                        <View style={landscapeColumnGapStyle}>
                          {laundryHeroCard}
                          {laundryActionRow}
                          {laundryCycleCard}
                          {laundryLoadSizeCard}
                        </View>
                        <View
                          style={[
                            landscapeColumnGapStyle,
                            styles.laundryControlGrid,
                          ]}
                        >
                          {laundryControlCards}
                        </View>
                      </>
                    ) : (
                      <>
                        {laundryHeroCard}
                        {laundryControlCards}
                        {laundryActionRow}
                      </>
                    ))}

                  {device.kind === "microwave" && (
                    <>
                      <RadialDial
                        size={compactDialSize}
                        value={Math.round(microwaveSeconds)}
                        min={0}
                        max={900}
                        tickValues={[0, 300, 600, 900]}
                        centerLabel="Time"
                        centerIcon={
                          <View style={marginBottom6Style}>
                            <DeviceIcon
                              kind="microwave"
                              size={28}
                              color={stylesVars.ink}
                            />
                          </View>
                        }
                        formatTick={(v) => `${Math.round(v / 60)}`}
                        formatValue={(v) => formatClock(v)}
                        formatCenterValue={(v) => formatClock(v)}
                        dimmed={!device.isOn}
                        onChange={(v) =>
                          sendPatch({
                            timeRemainingSec: clamp(v, 0, 900),
                            isOn: v > 0,
                          })
                        }
                      />

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Mode</Text>
                        <View style={styles.chipRow}>
                          {microwaveModeOptions.map((label) => {
                            const active = microwaveMode === label;
                            return (
                              <Pressable
                                key={label}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({ microwaveMode: label })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Power</Text>
                        <View style={styles.chipRow}>
                          {[
                            { label: "Low", value: 3 },
                            { label: "Med", value: 6 },
                            { label: "High", value: 10 },
                          ].map((preset) => {
                            const active = microwavePower === preset.value;
                            return (
                              <Pressable
                                key={preset.label}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({ microwavePower: preset.value })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {preset.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={styles.actionRow}>
                        <Pressable
                          style={modeTileStyle(device.isOn)}
                          onPress={() => sendPatch({ isOn: true })}
                        >
                          {device.isOn ? (
                            <LinearGradient
                              colors={[
                                theme.colors.accent2,
                                theme.colors.accent,
                              ]}
                              start={{ x: 0.1, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.modeIconBubbleActive}
                            >
                              <Ionicons name="play" size={18} color="#FFFFFF" />
                            </LinearGradient>
                          ) : (
                            <View style={styles.modeIconBubble}>
                              <Ionicons
                                name="play"
                                size={18}
                                color="rgba(12,12,18,0.65)"
                              />
                            </View>
                          )}
                          <Text
                            style={modeTextStyle(device.isOn)}
                          >
                            Start
                          </Text>
                        </Pressable>
                        <Pressable
                          style={modeTileStyle(!device.isOn)}
                          onPress={() => sendPatch({ isOn: false })}
                        >
                          {!device.isOn ? (
                            <LinearGradient
                              colors={[
                                theme.colors.accent2,
                                theme.colors.accent,
                              ]}
                              start={{ x: 0.1, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.modeIconBubbleActive}
                            >
                              <Ionicons name="stop" size={18} color="#FFFFFF" />
                            </LinearGradient>
                          ) : (
                            <View style={styles.modeIconBubble}>
                              <Ionicons
                                name="stop"
                                size={18}
                                color="rgba(12,12,18,0.65)"
                              />
                            </View>
                          )}
                          <Text
                            style={modeTextStyle(!device.isOn)}
                          >
                            Stop
                          </Text>
                        </Pressable>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Quick add</Text>
                        <View style={styles.chipRow}>
                          {[
                            { label: "+30s", value: 30 },
                            { label: "+1m", value: 60 },
                            { label: "+2m", value: 120 },
                          ].map((preset) => (
                            <Pressable
                              key={preset.label}
                              style={styles.chip}
                              onPress={() => {
                                const next = clamp(
                                  microwaveSeconds + preset.value,
                                  0,
                                  900,
                                );
                                sendPatch({
                                  timeRemainingSec: next,
                                  isOn: next > 0,
                                });
                              }}
                            >
                              <Text style={styles.chipText}>
                                {preset.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    </>
                  )}

                  {device.kind === "energy" && (
                    <>
                      <LinearGradient
                        colors={[
                          "rgba(255,255,255,0.96)",
                          "rgba(224,236,255,0.9)",
                          "rgba(204,218,255,0.86)",
                        ]}
                        start={{ x: 0.1, y: 0.05 }}
                        end={{ x: 1, y: 1 }}
                        style={energyHeroCardStyle}
                      >
                        <View style={energyHeroHeaderStyle}>
                          <View style={styles.energyHeroTitleWrap}>
                            <Text style={styles.energyHeroTitle}>
                              {device.name}
                            </Text>
                            <Text style={styles.energyHeroSub}>
                              {powerOutage
                                ? "Grid outage detected"
                                : "Live energy flow"}
                            </Text>
                          </View>
                          <View style={styles.energyHeroPillRow}>
                            <View style={energyHeroPillStyle(!powerOutage)}>
                              <Ionicons
                                name={powerOutage ? "alert-circle" : "flash"}
                                size={14}
                                color={
                                  powerOutage
                                    ? "#D8465B"
                                    : theme.colors.accent2
                                }
                              />
                              <Text
                                style={energyHeroPillTextStyle(!powerOutage)}
                              >
                                {powerOutage ? "Outage" : "Grid Online"}
                              </Text>
                            </View>
                            <View style={energyHeroPillStyle(solarActive)}>
                              <Ionicons
                                name={solarActive ? "sunny" : "sunny-outline"}
                                size={14}
                                color={
                                  solarActive ? "#D6A545" : stylesVars.subtext
                                }
                              />
                              <Text style={energyHeroPillTextStyle(solarActive)}>
                                {solarActive ? "Solar Active" : "Solar Idle"}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View style={energyHeroBodyStyle}>
                          <View style={energyHeroOrbStyle}>
                            <LinearGradient
                              colors={[
                                "rgba(122,92,255,0.24)",
                                "rgba(180,107,255,0.18)",
                                "rgba(255,255,255,0.9)",
                              ]}
                              start={{ x: 0.2, y: 0.1 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.energyHeroOrbGlow}
                            />
                            <View
                              pointerEvents="none"
                              style={styles.energyLottieLayer}
                            >
                              <LottieView
                                source={ENERGY_LOTTIE_SOURCE}
                                autoPlay
                                loop
                                resizeMode="contain"
                                style={styles.energyLottie}
                              />
                            </View>
                          </View>
                          <View style={energyHeroInfoStyle}>
                            <View style={energyHeroStatsRowStyle}>
                              {[
                                { label: "Now", value: `${energyPower}W` },
                                { label: "Today", value: `${energyToday} kWh` },
                                { label: "Peak", value: `${energyPeak}W` },
                              ].map((stat) => (
                                <View
                                  key={stat.label}
                                  style={styles.energyHeroStat}
                                >
                                  <Text style={energyHeroStatValueStyle}>
                                    {stat.value}
                                  </Text>
                                  <Text style={energyHeroStatLabelStyle}>
                                    {stat.label}
                                  </Text>
                                </View>
                              ))}
                            </View>
                            <View
                              style={[
                                energyHeroStatsRowStyle,
                                styles.energyHeroStatsRowCompact,
                              ]}
                            >
                              {[
                                {
                                  label: "Solar now",
                                  value: `${solarW}W`,
                                  active: solarW > 0,
                                },
                                {
                                  label: "Solar today",
                                  value: `${solarToday} kWh`,
                                  active: solarToday > 0,
                                },
                                {
                                  label: "Grid",
                                  value: `${gridToday} kWh`,
                                  active: !powerOutage,
                                },
                              ].map((stat) => (
                                <View
                                  key={stat.label}
                                  style={[
                                    styles.energyHeroStat,
                                    stat.active && styles.energyHeroStatActive,
                                  ]}
                                >
                                  <Text style={energyHeroStatValueStyle}>
                                    {stat.value}
                                  </Text>
                                  <Text style={energyHeroStatLabelStyle}>
                                    {stat.label}
                                  </Text>
                                </View>
                              ))}
                            </View>
                            <View style={styles.energyHeroProgressWrap}>
                              <View style={energyHeroProgressTrackStyle}>
                                <View style={energyHeroProgressFillStyle} />
                              </View>
                              <View style={styles.energyHeroProgressMeta}>
                                <Text style={energyHeroMetaTextStyle}>
                                  {energyBudget
                                    ? `${energyMonth} / ${energyBudget} kWh`
                                    : `${energyMonth} kWh this month`}
                                </Text>
                                <Text style={energyHeroMetaTextStyle}>
                                  ${energyCostToday.toFixed(2)} today
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.energyHeroHint}>
                              {solarActive
                                ? "Solar feeding the home"
                                : "Solar idle"}
                            </Text>
                          </View>
                        </View>
                      </LinearGradient>

                      <View style={styles.energySideColumn}>
                        <View style={controlCardStyle}>
                          <Text style={styles.cardLabel}>Main power</Text>
                          <View style={controlCardRowTopStyle}>
                            <Pressable
                              style={controlPillStyle(gridAvailable)}
                              onPress={() =>
                                sendPatch({ gridAvailable: true })
                              }
                            >
                              <Text
                                style={controlPillTextStyle(gridAvailable)}
                              >
                                Online
                              </Text>
                            </Pressable>
                            <Pressable
                              style={controlPillStyle(!gridAvailable)}
                              onPress={() =>
                                sendPatch({ gridAvailable: false })
                              }
                            >
                              <Text
                                style={controlPillTextStyle(!gridAvailable)}
                              >
                                Outage
                              </Text>
                            </Pressable>
                            <Pressable
                              style={controlPillStyle(gridOutageAlerts)}
                              onPress={() =>
                                sendPatch({
                                  gridOutageAlerts: !gridOutageAlerts,
                                })
                              }
                            >
                              <Text
                                style={controlPillTextStyle(gridOutageAlerts)}
                              >
                                {gridOutageAlerts
                                  ? "Alerts On"
                                  : "Alerts Off"}
                              </Text>
                            </Pressable>
                          </View>
                        {powerOutage && (
                          <View style={styles.alertRow}>
                            <Ionicons
                              name="alert-circle"
                              size={14}
                              color="#D8465B"
                            />
                            <Text style={styles.alertText}>
                              Main power offline
                            </Text>
                          </View>
                        )}
                      </View>

                      {isLandscape && (
                        <View style={{ height: energyCardGap }} />
                      )}

                      <View style={energyBudgetCardStyle}>
                        <Text style={styles.cardLabel}>Monthly budget</Text>
                        <View style={styles.chipRow}>
                          {[80, 120, 160].map((value) => {
                            const active = energyBudget === value;
                            return (
                                <Pressable
                                  key={value}
                                  style={chipStyle(active)}
                                  onPress={() =>
                                    sendPatch({ energyBudgetKwh: value })
                                  }
                                >
                                  <Text style={chipTextStyle(active)}>
                                    {value} kWh
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          <Text style={styles.budgetHint}>
                            {energyBudget
                              ? `${energyMonth} / ${energyBudget} kWh used`
                              : `${energyMonth} kWh this month`}
                          </Text>
                        </View>

                        <View style={styles.metricRow}>
                          <View style={styles.metricCard}>
                            <Text style={styles.metricValue}>
                              {energyMonth} kWh
                            </Text>
                            <Text style={styles.metricLabel}>This month</Text>
                          </View>
                          <View style={styles.metricCard}>
                            <Text style={styles.metricValue}>
                              ${energyCostToday.toFixed(2)}
                            </Text>
                            <Text style={styles.metricLabel}>Today cost</Text>
                          </View>
                        </View>
                      </View>
                    </>
                  )}

                  {device.kind === "water" && (
                    <>
                      <View style={waterOrbStyle}>
                        <AnimatedLottieView
                          source={WATER_LOTTIE_SOURCE}
                          autoPlay={waterBudget <= 0}
                          loop={waterBudget <= 0}
                          progress={waterBudget > 0 ? waterFill : undefined}
                          resizeMode="contain"
                          style={styles.deviceLottie}
                        />
                        <View style={styles.waterOrbOverlay}>
                          <Text style={styles.waterOrbValue}>
                            {waterFlow} L/min
                          </Text>
                          <Text style={styles.waterOrbSub}>
                            {waterBudget > 0
                              ? `${waterToday} / ${waterBudget} L`
                              : `${waterToday} L today`}
                          </Text>
                          {waterBudget > 0 && (
                            <Text style={styles.waterOrbPercent}>
                              {Math.round(waterBudgetProgress * 100)}% used
                            </Text>
                          )}
                        </View>
                      </View>

                      <View style={styles.metricRow}>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {waterFlow} L/min
                          </Text>
                          <Text style={styles.metricLabel}>Flow</Text>
                        </View>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {waterPressure} psi
                          </Text>
                          <Text style={styles.metricLabel}>Pressure</Text>
                        </View>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>{waterTemp}C</Text>
                          <Text style={styles.metricLabel}>Temp</Text>
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Daily budget</Text>
                        <View style={styles.chipRow}>
                          {[150, 220, 280].map((value) => {
                            const active = waterBudget === value;
                            return (
                              <Pressable
                                key={value}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({ waterBudgetL: value })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {value} L
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <Text style={styles.budgetHint}>
                          {waterBudget
                            ? `${waterToday} / ${waterBudget} L used`
                            : `${waterToday} L today`}
                        </Text>
                        {waterBudgetExceeded && (
                          <View style={styles.alertRow}>
                            <Ionicons
                              name="warning"
                              size={14}
                              color="#D8465B"
                            />
                            <Text style={styles.alertText}>
                              Daily budget exceeded
                            </Text>
                          </View>
                        )}
                        {waterLeakDetected && (
                          <View style={styles.alertRow}>
                            <Ionicons
                              name="warning"
                              size={14}
                              color="#D8465B"
                            />
                            <Text style={styles.alertText}>Leak detected</Text>
                          </View>
                        )}
                        {lowPressure && (
                          <View style={styles.alertRow}>
                            <Ionicons
                              name="alert-circle"
                              size={14}
                              color="#F4B740"
                            />
                            <Text style={styles.alertTextWarn}>
                              Low pressure
                            </Text>
                          </View>
                        )}
                        {highPressure && (
                          <View style={styles.alertRow}>
                            <Ionicons
                              name="alert-circle"
                              size={14}
                              color="#D8465B"
                            />
                            <Text style={styles.alertText}>
                              High pressure
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Safety</Text>
                        <View style={controlCardRowTopStyle}>
                          <Pressable
                            style={controlPillStyle(waterLeakAlerts)}
                            onPress={() =>
                              sendPatch({ waterLeakAlerts: !waterLeakAlerts })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(waterLeakAlerts)}
                            >
                              {waterLeakAlerts ? "Leak Alerts" : "Alerts Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={controlPillStyle(waterAutoShutoff)}
                            onPress={() =>
                              sendPatch({ waterAutoShutoff: !waterAutoShutoff })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(waterAutoShutoff)}
                            >
                              {waterAutoShutoff
                                ? "Auto Shutoff"
                                : "Shutoff Off"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Pressure alerts</Text>
                        <View style={styles.pressureSliderRow}>
                          <Text style={styles.pressureSliderLabel}>Low</Text>
                          <Text style={styles.pressureSliderValue}>
                            {pressureLowDraft} psi
                          </Text>
                        </View>
                        <Slider
                          value={pressureLowDraft}
                          minimumValue={20}
                          maximumValue={60}
                          step={1}
                          onValueChange={(value) =>
                            setPressureLowDraft(Math.round(value))
                          }
                          onSlidingComplete={(value) =>
                            setPressureLow(Math.round(value))
                          }
                          minimumTrackTintColor="rgba(122,92,255,0.9)"
                          maximumTrackTintColor="rgba(12,12,18,0.12)"
                          thumbTintColor="rgba(255,255,255,0.92)"
                          style={styles.pressureSlider}
                        />
                        <View style={styles.pressureSliderRow}>
                          <Text style={styles.pressureSliderLabel}>High</Text>
                          <Text style={styles.pressureSliderValue}>
                            {pressureHighDraft} psi
                          </Text>
                        </View>
                        <Slider
                          value={pressureHighDraft}
                          minimumValue={60}
                          maximumValue={100}
                          step={1}
                          onValueChange={(value) =>
                            setPressureHighDraft(Math.round(value))
                          }
                          onSlidingComplete={(value) =>
                            setPressureHigh(Math.round(value))
                          }
                          minimumTrackTintColor="rgba(122,92,255,0.9)"
                          maximumTrackTintColor="rgba(12,12,18,0.12)"
                          thumbTintColor="rgba(255,255,255,0.92)"
                          style={styles.pressureSlider}
                        />
                        <View style={controlCardRowTopStyle}>
                          <Pressable
                            style={controlPillStyle(waterPressureAlerts)}
                            onPress={() =>
                              sendPatch({
                                waterPressureAlerts: !waterPressureAlerts,
                              })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(waterPressureAlerts)}
                            >
                              {waterPressureAlerts
                                ? "Pressure Alerts"
                                : "Alerts Off"}
                            </Text>
                          </Pressable>
                        </View>
                        <Text style={styles.budgetHint}>
                          {waterPressureAlerts
                            ? `Alert below ${waterPressureLow} psi or above ${waterPressureHigh} psi`
                            : "Pressure alerts disabled"}
                        </Text>
                      </View>
                    </>
                  )}

                  {device.kind === "water-heater" && (
                    <>
                      <RadialDial
                        size={compactDialSize}
                        value={heaterTemp}
                        min={40}
                        max={70}
                        tickValues={[40, 45, 50, 55, 60, 65, 70]}
                        centerLabel="Setpoint"
                        centerIcon={
                          <View style={marginBottom6Style}>
                            <Ionicons
                              name="thermometer"
                              size={28}
                              color={stylesVars.ink}
                            />
                          </View>
                        }
                        formatTick={(v) => `${v}`}
                        formatValue={(v) => `${v}°C`}
                        formatCenterValue={(v) => `${v}°C`}
                        dimmed={!device.isOn}
                        onChange={(v) =>
                          sendPatch({ tempC: clamp(v, 40, 70), isOn: true })
                        }
                      />
                      <Text style={styles.heaterStatusText}>{heaterStatus}</Text>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Heater type</Text>
                        <View style={styles.chipRow}>
                          {heaterTypeOptions.map((option) => {
                            const active = heaterType === option.value;
                            return (
                              <Pressable
                                key={option.value}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({ waterHeaterType: option.value })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {option.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Mode</Text>
                        <View style={styles.chipRow}>
                          {heaterModeOptions.map((option) => {
                            const active = heaterMode === option.value;
                            return (
                              <Pressable
                                key={option.value}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({ heaterMode: option.value })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {option.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Smart features</Text>
                        <View style={controlCardRowTopStyle}>
                          <Pressable
                            style={controlPillStyle(heaterScheduleEnabled)}
                            onPress={() =>
                              sendPatch({
                                heaterScheduleEnabled: !heaterScheduleEnabled,
                              })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(heaterScheduleEnabled)}
                            >
                              {heaterScheduleEnabled
                                ? "Schedule"
                                : "Schedule Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={controlPillStyle(heaterSanitize)}
                            onPress={() =>
                              sendPatch({ antiLegionella: !heaterSanitize })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(heaterSanitize)}
                            >
                              {heaterSanitize ? "Sanitize" : "Sanitize Off"}
                            </Text>
                          </Pressable>
                        </View>
                        {showRecirculation && (
                          <View
                            style={controlCardRowTightStyle}
                          >
                            <Pressable
                              style={controlPillStyle(heaterRecirculation)}
                              onPress={() =>
                                sendPatch({
                                  recirculation: !heaterRecirculation,
                                })
                              }
                            >
                              <Text
                                style={controlPillTextStyle(heaterRecirculation)}
                              >
                                {heaterRecirculation
                                  ? "Recirculation"
                                  : "Recirc Off"}
                              </Text>
                            </Pressable>
                          </View>
                        )}
                        <Text style={styles.budgetHint}>
                          {heaterType === "tankless"
                            ? "Recirculation keeps hot water ready."
                            : "Schedules reduce standby heat loss."}
                        </Text>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Vacation</Text>
                        <View style={styles.chipRow}>
                          {[0, 3, 7, 14, 30].map((value) => {
                            const active = heaterVacationDays === value;
                            return (
                              <Pressable
                                key={value}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({ vacationDays: value })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {value === 0 ? "Off" : `${value}d`}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <Text style={styles.budgetHint}>
                          {heaterMode === "vacation"
                            ? heaterVacationDays > 0
                              ? `Vacation mode set for ${heaterVacationDays} days.`
                              : "Vacation mode active."
                            : "Set days, then enable Vacation mode."}
                        </Text>
                      </View>
                    </>
                  )}

                  {device.kind === "air" && (
                    <>
                      <LinearGradient
                        colors={[
                          "rgba(255,255,255,0.98)",
                          "rgba(236,242,255,0.92)",
                          "rgba(222,230,255,0.88)",
                        ]}
                        start={{ x: 0.05, y: 0.05 }}
                        end={{ x: 1, y: 1 }}
                        style={airHeroCardStyle}
                      >
                        <View
                          style={airHeroGlowStyle}
                          pointerEvents="none"
                        />
                        <View style={styles.airHeroHeader}>
                          <View>
                            <Text style={styles.airHeroTitle}>Air Quality</Text>
                            <Text style={styles.airHeroSub}>
                              {(roomLookup.get(device.roomId) ?? "Room") +
                                " Sensor"}
                            </Text>
                          </View>
                          <View
                            style={airHeroBadgeStyle}
                          >
                            <View
                              style={airHeroBadgeDotStyle}
                            />
                            <Text
                              style={airHeroBadgeTextStyle}
                            >
                              {airBand.label}
                            </Text>
                          </View>
                        </View>
                        <View
                          style={airHeroBodyStyle}
                        >
                          <View
                            style={airHeroScoreStyle}
                          >
                            <Text
                              style={airHeroLabelStyle}
                            >
                              AQI
                            </Text>
                            <Text
                              style={airHeroValueStyle}
                            >
                              {airQuality > 0 ? airQuality : "--"}
                            </Text>
                            <Text style={styles.airHeroDescriptor}>
                              {airBand.label}
                            </Text>
                            <View style={styles.airHeroMetaRow}>
                              <View style={styles.airHeroMetaPill}>
                                <Ionicons
                                  name="water"
                                  size={12}
                                  color={stylesVars.subtext}
                                />
                                <Text style={styles.airHeroMetaText}>
                                  {formatMetric(humidity, "%")}
                                </Text>
                              </View>
                              <View style={styles.airHeroMetaPill}>
                                <Ionicons
                                  name="thermometer"
                                  size={12}
                                  color={stylesVars.subtext}
                                />
                                <Text style={styles.airHeroMetaText}>
                                  {formatMetric(
                                    device.tempC ?? roomTemp,
                                    "C",
                                    1,
                                  )}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <View style={styles.airHeroGaugeWrap}>
                            <View
                              style={airHeroGaugeRingStyle}
                            >
                              <LinearGradient
                                colors={[airBand.color, "rgba(255,255,255,0.92)"]}
                                start={{ x: 0.2, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.airHeroGaugeInner}
                              >
                                <Ionicons name="leaf" size={24} color="#fff" />
                                <Text
                                  style={airHeroGaugeValueStyle}
                                >
                                  {airConfidence}%
                                </Text>
                                <Text
                                  style={airHeroGaugeLabelStyle}
                                >
                                  Confidence
                                </Text>
                              </LinearGradient>
                            </View>
                            <Text style={styles.airHeroUpdated}>
                              Updated{" "}
                              {airLastUpdatedAt
                                ? formatTimeAgo(airLastUpdatedAt)
                                : "just now"}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.airHeroMetricRow}>
                          {[
                            {
                              label: "CO2",
                              value: formatMetric(airCo2, "ppm"),
                            },
                            {
                              label: "PM2.5",
                              value: formatMetric(airPm25, "ug/m3"),
                            },
                            {
                              label: "VOC",
                              value: formatMetric(airVoc, "ppb"),
                            },
                          ].map((metric) => (
                            <View
                              key={`air-hero-${metric.label}`}
                              style={styles.airHeroMetric}
                            >
                              <Text style={styles.airHeroMetricValue}>
                                {metric.value}
                              </Text>
                              <Text style={styles.airHeroMetricLabel}>
                                {metric.label}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </LinearGradient>

                      <View style={airTrendCardStyle}>
                        <View style={styles.airTrendHeader}>
                          <Text style={styles.cardLabel}>24h trend</Text>
                          <View
                            style={airTrendPillStyle}
                          >
                            <Ionicons
                              name={airTrendIcon as keyof typeof Ionicons.glyphMap}
                              size={14}
                              color={airBand.color}
                            />
                            <Text style={styles.airTrendText}>
                              {airTrendLabel}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.airTrendChartFrame}>
                          <View style={styles.airChart}>
                            {airSeriesAqi.map((value, index) => {
                              const height = Math.max(
                                6,
                                Math.round(
                                  (value / airChartMax) * (isTablet ? 80 : 64),
                                ),
                              );
                              const band = resolveAirBand(value);
                              return (
                                <View
                                  key={`air-bar-${index}`}
                                  style={airChartBarStyle(
                                    height,
                                    band.color,
                                    index === airSeriesAqi.length - 1 ? 1 : 0.6,
                                  )}
                                />
                              );
                            })}
                          </View>
                        </View>
                        <View style={styles.airLegendRow}>
                          {AIR_QUALITY_BANDS.slice(0, 3).map((band) => (
                            <View
                              key={`air-legend-${band.label}`}
                              style={styles.airLegendItem}
                            >
                              <View
                                style={airLegendDotStyle(band.color)}
                              />
                              <Text style={styles.airLegendText}>
                                {band.label}
                              </Text>
                            </View>
                          ))}
                        </View>
                        <Text style={styles.airTrendUpdated}>
                          Updated{" "}
                          {airLastUpdatedAt
                            ? formatTimeAgo(airLastUpdatedAt)
                            : "just now"}
                        </Text>
                      </View>

                      <View style={styles.airMetricGrid}>
                        {[
                          {
                            label: "PM2.5",
                            value: formatMetric(airPm25, "ug/m3"),
                          },
                          {
                            label: "PM10",
                            value: formatMetric(airPm10, "ug/m3"),
                          },
                          {
                            label: "CO2",
                            value: formatMetric(airCo2, "ppm"),
                          },
                          {
                            label: "VOC",
                            value: formatMetric(airVoc, "ppb"),
                          },
                          {
                            label: "HCHO",
                            value: formatMetric(airFormaldehyde, "mg/m3", 2),
                          },
                          {
                            label: "Pollen",
                            value: formatMetric(airPollen, "idx", 1),
                          },
                          {
                            label: "Temp",
                            value: formatMetric(
                              device.tempC ?? roomTemp,
                              "C",
                              1,
                            ),
                          },
                          {
                            label: "Humidity",
                            value: formatMetric(humidity, "%"),
                          },
                          {
                            label: "AQI",
                            value: airQuality > 0 ? `${airQuality}` : "--",
                          },
                        ].map((metric) => (
                          <View
                            key={`air-metric-${metric.label}`}
                            style={airMetricCardStyle}
                          >
                            <Text style={styles.airMetricValue}>
                              {metric.value}
                            </Text>
                            <Text style={styles.airMetricLabel}>
                              {metric.label}
                            </Text>
                          </View>
                        ))}
                      </View>

                      <View style={styles.airKpiRow}>
                        <View style={styles.airKpiCard}>
                          <Text style={styles.airKpiValue}>
                            {airFilterLife}%
                          </Text>
                          <Text style={styles.airKpiLabel}>Filter life</Text>
                        </View>
                        <View style={styles.airKpiCard}>
                          <Text style={styles.airKpiValue}>
                            {airFilterDaysLeft} days
                          </Text>
                          <Text style={styles.airKpiLabel}>Replace in</Text>
                        </View>
                      </View>

                      {airFilterLife <= 20 && (
                        <View style={styles.airAlertCard}>
                          <Ionicons name="warning" size={14} color="#D8465B" />
                          <Text style={styles.airAlertText}>
                            Replace filter soon
                          </Text>
                        </View>
                      )}

                      <View style={airSurfaceCardStyle}>
                        <Text style={styles.cardLabel}>Purifier</Text>
                        <View style={styles.chipRow}>
                          {["auto", "manual", "sleep", "boost"].map((mode) => {
                            const active = airPurifierMode === mode;
                            const label =
                              mode === "auto"
                                ? "Auto"
                                : mode === "manual"
                                  ? "Manual"
                                  : mode === "sleep"
                                    ? "Sleep"
                                    : "Boost";
                            return (
                              <Pressable
                                key={mode}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({
                                    airPurifierMode: mode as Device["airPurifierMode"],
                                    isOn: true,
                                  })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <View style={styles.pressureSliderRow}>
                          <Text style={styles.pressureSliderLabel}>Fan</Text>
                          <Text style={styles.pressureSliderValue}>
                            {airPurifierSpeed}%
                          </Text>
                        </View>
                        <Slider
                          value={airPurifierSpeed}
                          minimumValue={0}
                          maximumValue={100}
                          step={1}
                          onSlidingComplete={(value) =>
                            sendPatch({
                              airPurifierSpeed: Math.round(value),
                              isOn: true,
                            })
                          }
                          minimumTrackTintColor="rgba(122,92,255,0.9)"
                          maximumTrackTintColor="rgba(12,12,18,0.12)"
                          thumbTintColor="rgba(255,255,255,0.92)"
                          style={styles.pressureSlider}
                        />
                        <View style={controlCardRowTopStyle}>
                          <Pressable
                            style={controlPillStyle(airIonizerEnabled)}
                            onPress={() =>
                              sendPatch({
                                airIonizerEnabled: !airIonizerEnabled,
                              })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(airIonizerEnabled)}
                            >
                              {airIonizerEnabled ? "Ionizer" : "Ionizer Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={controlPillStyle(airAutoVentilation)}
                            onPress={() =>
                              sendPatch({
                                airAutoVentilation: !airAutoVentilation,
                              })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(airAutoVentilation)}
                            >
                              {airAutoVentilation
                                ? "Auto Vent"
                                : "Vent Off"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      <View style={airSurfaceCardStyle}>
                        <Text style={styles.cardLabel}>Recommendations</Text>
                        {airRecommendations.map((item, index) => (
                          <View
                            key={`air-rec-${index}`}
                            style={styles.airRecommendationRow}
                          >
                            <Ionicons
                              name="sparkles"
                              size={14}
                              color={stylesVars.ink}
                            />
                            <Text style={styles.airRecommendationText}>
                              {item}
                            </Text>
                          </View>
                        ))}
                      </View>

                      <View style={styles.airCompareRow}>
                        <View style={styles.airCompareCard}>
                          <Text style={styles.airCompareTitle}>Indoor</Text>
                          <Text style={styles.airCompareValue}>
                            AQI {airQuality > 0 ? airQuality : "--"}
                          </Text>
                          <Text style={styles.airCompareSub}>
                            CO2 {formatMetric(airCo2, "ppm")}
                          </Text>
                          <Text style={styles.airCompareSub}>
                            PM2.5 {formatMetric(airPm25, "ug/m3")}
                          </Text>
                          <Text style={styles.airCompareSub}>
                            Humidity {formatMetric(humidity, "%")}
                          </Text>
                          <Text style={styles.airCompareSub}>
                            Temp{" "}
                            {formatMetric(device.tempC ?? roomTemp, "C", 1)}
                          </Text>
                        </View>
                        <View style={styles.airCompareCard}>
                          <Text style={styles.airCompareTitle}>Outdoor</Text>
                          <Text style={styles.airCompareValue}>
                            AQI {airOutdoorAqi > 0 ? airOutdoorAqi : "--"}
                          </Text>
                          <Text style={styles.airCompareSub}>
                            CO2 {formatMetric(airOutdoorCo2, "ppm")}
                          </Text>
                          <Text style={styles.airCompareSub}>
                            PM2.5 {formatMetric(airOutdoorPm25, "ug/m3")}
                          </Text>
                          <Text style={styles.airCompareSub}>
                            Humidity {formatMetric(airOutdoorHumidity, "%")}
                          </Text>
                          <Text style={styles.airCompareSub}>
                            Temp {formatMetric(airOutdoorTempC, "C", 1)}
                          </Text>
                        </View>
                      </View>

                      <View style={airSurfaceCardStyle}>
                        <Text style={styles.cardLabel}>Alerts</Text>
                        <View style={controlCardRowTopStyle}>
                          <Pressable
                            style={controlPillStyle(airAlertsEnabled)}
                            onPress={() =>
                              sendPatch({ airAlertsEnabled: !airAlertsEnabled })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(airAlertsEnabled)}
                            >
                              {airAlertsEnabled ? "Alerts on" : "Alerts off"}
                            </Text>
                          </Pressable>
                        </View>
                        {renderAirAlertSlider(
                          "AQI",
                          airAlertAqi,
                          50,
                          200,
                          1,
                          `${airAlertAqi}`,
                          (value) =>
                            sendPatch({ airAlertAqi: Math.round(value) }),
                        )}
                        {renderAirAlertSlider(
                          "CO2",
                          airAlertCo2,
                          600,
                          2000,
                          10,
                          `${airAlertCo2} ppm`,
                          (value) =>
                            sendPatch({ airAlertCo2: Math.round(value) }),
                        )}
                        {renderAirAlertSlider(
                          "PM2.5",
                          airAlertPm25,
                          10,
                          120,
                          1,
                          `${airAlertPm25} ug/m3`,
                          (value) =>
                            sendPatch({ airAlertPm25: Math.round(value) }),
                        )}
                        {renderAirAlertSlider(
                          "PM10",
                          airAlertPm10,
                          20,
                          160,
                          1,
                          `${airAlertPm10} ug/m3`,
                          (value) =>
                            sendPatch({ airAlertPm10: Math.round(value) }),
                        )}
                        {renderAirAlertSlider(
                          "VOC",
                          airAlertVoc,
                          80,
                          800,
                          10,
                          `${airAlertVoc} ppb`,
                          (value) =>
                            sendPatch({ airAlertVoc: Math.round(value) }),
                        )}
                        {renderAirAlertSlider(
                          "Pollen",
                          airAlertPollen,
                          1,
                          5,
                          1,
                          `${airAlertPollen} idx`,
                          (value) =>
                            sendPatch({ airAlertPollen: Math.round(value) }),
                        )}
                      </View>

                      <View style={airSurfaceCardStyle}>
                        <Text style={styles.cardLabel}>Sensor map</Text>
                        {airSensors.length === 0 ? (
                          <Text style={styles.scheduleEmpty}>
                            No air sensors yet
                          </Text>
                        ) : (
                          <View style={styles.airSensorList}>
                            {airSensors.map((sensor) => {
                              const sensorBand = resolveAirBand(
                                sensor.airQualityIndex ?? 0,
                              );
                              const isActive = sensor.id === device.id;
                              return (
                                <Pressable
                                  key={sensor.id}
                                  style={airSensorRowStyle(isActive)}
                                  onPress={() =>
                                    navigation.navigate("DeviceDetail", {
                                      deviceId: sensor.id,
                                    })
                                  }
                                >
                                  <View
                                    style={airSensorDotStyle(sensorBand.color)}
                                  />
                                  <View style={flex1Style}>
                                    <Text style={styles.airSensorName}>
                                      {sensor.name}
                                    </Text>
                                    <Text style={styles.airSensorSub}>
                                      {roomLookup.get(sensor.roomId) ?? ""}
                                    </Text>
                                  </View>
                                  <Text style={styles.airSensorValue}>
                                    AQI{" "}
                                    {sensor.airQualityIndex
                                      ? sensor.airQualityIndex
                                      : "--"}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    </>
                  )}

                  {device.kind === "sprinkler" && (
                    <>
                      <RadialDial
                        size={compactDialSize}
                        value={sprinklerDuration}
                        min={0}
                        max={60}
                        tickValues={[0, 15, 30, 45, 60]}
                        centerLabel="Minutes"
                        centerIcon={
                          <View style={marginBottom6Style}>
                            <Ionicons
                              name="rainy"
                              size={28}
                              color={stylesVars.ink}
                            />
                          </View>
                        }
                        formatTick={(v) => `${v}`}
                        formatValue={(v) => `${v}`}
                        formatCenterValue={(v) => `${v} min`}
                        dimmed={!device.isOn}
                        onChange={(v) =>
                          sendPatch({ durationMin: clamp(v, 0, 60) })
                        }
                      />

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Zone</Text>
                        <View style={styles.chipRow}>
                          {["Front Yard", "Back Yard", "Garden"].map((zone) => {
                            const active =
                              (device.zone ?? "Front Yard") === zone;
                            return (
                              <Pressable
                                key={zone}
                                style={chipStyle(active)}
                                onPress={() => sendPatch({ zone })}
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {zone}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Schedule</Text>
                        {(device.schedule ?? []).length === 0 ? (
                          <Text style={styles.scheduleEmpty}>
                            No schedules yet
                          </Text>
                        ) : (
                          (device.schedule ?? []).map((s) => (
                            <View key={s.id} style={styles.scheduleRow}>
                              <View>
                                <Text style={styles.scheduleTime}>
                                  {String(s.hour).padStart(2, "0")}:
                                  {String(s.minute).padStart(2, "0")}
                                </Text>
                                <Text style={styles.scheduleDays}>
                                  {s.days.join(" • ")}
                                </Text>
                              </View>
                              <Pressable
                                style={scheduleToggleStyle(s.enabled)}
                                onPress={() => {
                                  const next = (device.schedule ?? []).map(
                                    (row) =>
                                      row.id === s.id
                                        ? { ...row, enabled: !row.enabled }
                                        : row,
                                  );
                                  sendPatch({ schedule: next });
                                }}
                              >
                                <Text
                                  style={scheduleToggleTextStyle(s.enabled)}
                                >
                                  {s.enabled ? "On" : "Off"}
                                </Text>
                              </Pressable>
                            </View>
                          ))
                        )}

                        <Pressable
                          style={styles.addSchedule}
                          onPress={() => setShowSchedule(true)}
                        >
                          <Ionicons
                            name="add"
                            size={16}
                            color={stylesVars.ink}
                          />
                          <Text style={styles.addScheduleText}>
                            Add schedule
                          </Text>
                        </Pressable>
                      </View>

                      <View style={styles.actionRow}>
                        <Pressable
                          style={modeTileStyle(device.isOn)}
                          onPress={() => sendPatch({ isOn: true })}
                        >
                          {device.isOn ? (
                            <LinearGradient
                              colors={[
                                theme.colors.accent2,
                                theme.colors.accent,
                              ]}
                              start={{ x: 0.1, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.modeIconBubbleActive}
                            >
                              <Ionicons name="play" size={18} color="#FFFFFF" />
                            </LinearGradient>
                          ) : (
                            <View style={styles.modeIconBubble}>
                              <Ionicons
                                name="play"
                                size={18}
                                color="rgba(12,12,18,0.65)"
                              />
                            </View>
                          )}
                          <Text
                            style={modeTextStyle(device.isOn)}
                          >
                            Start
                          </Text>
                        </Pressable>
                        <Pressable
                          style={modeTileStyle(!device.isOn)}
                          onPress={() => sendPatch({ isOn: false })}
                        >
                          {!device.isOn ? (
                            <LinearGradient
                              colors={[
                                theme.colors.accent2,
                                theme.colors.accent,
                              ]}
                              start={{ x: 0.1, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.modeIconBubbleActive}
                            >
                              <Ionicons name="stop" size={18} color="#FFFFFF" />
                            </LinearGradient>
                          ) : (
                            <View style={styles.modeIconBubble}>
                              <Ionicons
                                name="stop"
                                size={18}
                                color="rgba(12,12,18,0.65)"
                              />
                            </View>
                          )}
                          <Text
                            style={modeTextStyle(!device.isOn)}
                          >
                            Stop
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  )}

                  {device.kind === "speaker" && (
                    <>
                      <View style={styles.speakerNowCard}>
                        <LinearGradient
                          colors={["#E6DAFF", "#8B5CFF"]}
                          start={{ x: 0.1, y: 0.1 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.speakerNowInner}
                        >
                          <View
                            style={speakerCoverStyle}
                          >
                            <LinearGradient
                              colors={["rgba(255,255,255,0.95)", "#6B3CFF"]}
                              start={{ x: 0.1, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.speakerCoverInner}
                            >
                              <Ionicons
                                name="musical-notes"
                                size={Math.round(speakerCoverSize * 0.36)}
                                color="#2E1B6B"
                              />
                            </LinearGradient>
                          </View>
                          <View style={styles.speakerNowMeta}>
                            <Text
                              style={styles.speakerTrackTitle}
                              numberOfLines={1}
                            >
                              {speakerTrackTitle}
                            </Text>
                            <Text
                              style={styles.speakerTrackArtist}
                              numberOfLines={1}
                            >
                              {speakerTrackArtist}
                            </Text>
                            <Text
                              style={styles.speakerTrackSub}
                              numberOfLines={1}
                            >
                              {speakerTrackAlbum}
                            </Text>
                          </View>
                          <View style={styles.speakerSourcePill}>
                            <Text style={styles.speakerSourceText}>
                              {speakerSource}
                            </Text>
                          </View>
                        </LinearGradient>

                        <View style={styles.speakerProgressRow}>
                          <Text style={styles.speakerTime}>
                            {formatTrackTime(speakerTrackProgress)}
                          </Text>
                          <View style={styles.speakerProgressTrack}>
                            <View
                              style={speakerProgressFillStyle}
                            />
                          </View>
                          <Text style={styles.speakerTime}>
                            {formatTrackTime(speakerTrackDuration)}
                          </Text>
                        </View>

                        <View
                          style={speakerVisualizerRowStyle}
                        >
                          {speakerBars.map((bar, idx) => (
                            <Animated.View
                              key={`speaker-bar-${idx}`}
                              style={speakerVisualizerBarStyle(bar)}
                            />
                          ))}
                        </View>
                      </View>

                      <RadialDial
                        size={compactDialSize}
                        value={speakerVolume}
                        min={0}
                        max={100}
                        tickValues={[0, 25, 50, 75, 100]}
                        dimmed={!device.isOn}
                        formatValue={(v) => `Vol ${v}`}
                        formatTick={(v) => `${v}`}
                        onChange={(v) => {
                          const next = clamp(v, 0, 100);
                          sendPatch({ volume: next, isOn: true });
                        }}
                        centerContent={
                          <View style={infoOrbCompactStyle}>
                            <LinearGradient
                              colors={["#CDBBFF", "#6B3CFF"]}
                              start={{ x: 0.2, y: 0.1 }}
                              end={{ x: 0.9, y: 1 }}
                              style={styles.infoOrbInner}
                            >
                              <Ionicons
                                name="volume-high"
                                size={32}
                                color="#fff"
                              />
                              <Text style={styles.infoValue} numberOfLines={1}>
                                {device.name}
                              </Text>
                              <Text style={styles.infoSub}>
                                {roomName || "Speaker"}
                              </Text>
                            </LinearGradient>
                          </View>
                        }
                      />

                      <View style={styles.mediaRow}>
                        <Pressable
                          style={styles.mediaBtn}
                          onPress={() => sendPatch({ isOn: true })}
                        >
                          <Ionicons
                            name="play-skip-back"
                            size={18}
                            color={stylesVars.ink}
                          />
                        </Pressable>
                        <Pressable
                          style={mediaBtnStyle(device.isOn)}
                          onPress={() => sendPatch({ isOn: !device.isOn })}
                        >
                          <Ionicons
                            name={device.isOn ? "pause" : "play"}
                            size={18}
                            color={stylesVars.ink}
                          />
                        </Pressable>
                        <Pressable
                          style={styles.mediaBtn}
                          onPress={() => sendPatch({ isOn: true })}
                        >
                          <Ionicons
                            name="play-skip-forward"
                            size={18}
                            color={stylesVars.ink}
                          />
                        </Pressable>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Source</Text>
                        <View style={styles.chipRow}>
                          {[
                            "Spotify",
                            "AirPlay",
                            "Bluetooth",
                            "AUX",
                            "TV",
                          ].map((value) => {
                            const active = speakerSource === value;
                            return (
                              <Pressable
                                key={value}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({
                                    speakerSource:
                                      value as Device["speakerSource"],
                                  })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {value}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>EQ Preset</Text>
                        <View style={styles.chipRow}>
                          {["Flat", "Warm", "Bright", "Bass", "Vocal"].map(
                            (value) => {
                              const active = speakerPreset === value;
                              return (
                                <Pressable
                                  key={value}
                                  style={chipStyle(active)}
                                  onPress={() =>
                                    sendPatch({
                                      speakerPreset:
                                        value as Device["speakerPreset"],
                                    })
                                  }
                                >
                                  <Text
                                    style={chipTextStyle(active)}
                                  >
                                    {value}
                                  </Text>
                                </Pressable>
                              );
                            },
                          )}
                        </View>

                        <View style={styles.speakerSliderRow}>
                          <Text style={styles.speakerSliderLabel}>Bass</Text>
                          <Text style={styles.speakerSliderValue}>
                            {speakerBassDraft}%
                          </Text>
                        </View>
                        <Slider
                          value={speakerBassDraft}
                          minimumValue={0}
                          maximumValue={100}
                          step={1}
                          onValueChange={(value) =>
                            setSpeakerBassDraft(Math.round(value))
                          }
                          onSlidingComplete={(value) =>
                            sendPatch({ bass: Math.round(value) })
                          }
                          minimumTrackTintColor="rgba(122,92,255,0.9)"
                          maximumTrackTintColor="rgba(12,12,18,0.12)"
                          thumbTintColor="rgba(255,255,255,0.92)"
                          style={styles.speakerSlider}
                        />

                        <View style={styles.speakerSliderRow}>
                          <Text style={styles.speakerSliderLabel}>Treble</Text>
                          <Text style={styles.speakerSliderValue}>
                            {speakerTrebleDraft}%
                          </Text>
                        </View>
                        <Slider
                          value={speakerTrebleDraft}
                          minimumValue={0}
                          maximumValue={100}
                          step={1}
                          onValueChange={(value) =>
                            setSpeakerTrebleDraft(Math.round(value))
                          }
                          onSlidingComplete={(value) =>
                            sendPatch({ treble: Math.round(value) })
                          }
                          minimumTrackTintColor="rgba(122,92,255,0.9)"
                          maximumTrackTintColor="rgba(12,12,18,0.12)"
                          thumbTintColor="rgba(255,255,255,0.92)"
                          style={styles.speakerSlider}
                        />
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Smart modes</Text>
                        <View style={styles.chipRow}>
                          {[
                            { label: "Spatial", field: "spatialAudio" },
                            { label: "Party", field: "partyMode" },
                            { label: "Night", field: "nightMode" },
                            { label: "Shuffle", field: "shuffle" },
                          ].map((item) => {
                            const active =
                              item.field === "spatialAudio"
                                ? speakerSpatial
                                : item.field === "partyMode"
                                  ? speakerParty
                                  : item.field === "nightMode"
                                    ? speakerNight
                                    : speakerShuffle;
                            return (
                              <Pressable
                                key={item.label}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({
                                    [item.field]: !active,
                                  } as Partial<Device>)
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {item.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <View style={controlCardRowTightStyle}>
                          <Pressable
                            style={controlPillStyle(speakerMic)}
                            onPress={() =>
                              sendPatch({ micEnabled: !speakerMic })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(speakerMic)}
                            >
                              {speakerMic ? "Mic On" : "Mic Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={controlPillStyle(speakerAssistant)}
                            onPress={() =>
                              sendPatch({
                                voiceAssistantEnabled: !speakerAssistant,
                              })
                            }
                          >
                            <Text
                              style={controlPillTextStyle(speakerAssistant)}
                            >
                              {speakerAssistant ? "Assistant" : "Assistant Off"}
                            </Text>
                          </Pressable>
                        </View>
                        <Text style={styles.cardHint}>Repeat</Text>
                        <View style={styles.chipRow}>
                          {[
                            { label: "Off", value: "off" },
                            { label: "All", value: "all" },
                            { label: "One", value: "one" },
                          ].map((option) => {
                            const active = speakerRepeat === option.value;
                            return (
                              <Pressable
                                key={option.value}
                                style={chipStyle(active)}
                                onPress={() =>
                                  sendPatch({
                                    repeat: option.value as Device["repeat"],
                                  })
                                }
                              >
                                <Text
                                  style={chipTextStyle(active)}
                                >
                                  {option.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </>
                  )}

                  {device.kind === "smoke" &&
                    (isLandscapeSplit ? (
                      <>
                        <View style={landscapeColumnGapStyle}>
                          {smokeHeroCard}
                        </View>
                        <View style={landscapeColumnGapStyle}>
                          {smokeStatusCard}
                          {smokeMetricsRow}
                          {smokeActionRow}
                          {smokeSilenced && (
                            <View style={styles.alertRow}>
                              <Ionicons
                                name="alert"
                                size={14}
                                color="#B7791F"
                              />
                              <Text style={styles.alertTextWarn}>
                                Alarm silenced
                              </Text>
                            </View>
                          )}
                        </View>
                      </>
                    ) : (
                      <>
                        {smokeHeroCard}
                        {smokeStatusCard}
                        {smokeSilenced && (
                          <View style={styles.alertRow}>
                            <Ionicons
                              name="alert"
                              size={14}
                              color="#B7791F"
                            />
                            <Text style={styles.alertTextWarn}>
                              Alarm silenced
                            </Text>
                          </View>
                        )}
                      </>
                    ))}

                  {device.kind === "tv" &&
                    (isLandscapeSplit ? (
                      <View style={landscapeGridStyle}>
                        <View style={landscapeColumnPrimaryStyle}>
                          {tvHeroCard}
                          {tvVolumeCard}
                        </View>
                        <View style={landscapeColumnSecondaryStyle}>
                          {tvRemoteCard}
                        </View>
                      </View>
                    ) : (
                      <>
                        {tvHeroCard}
                        {tvVolumeCard}
                        {tvRemoteCard}
                      </>
                    ))}

                  {device.kind === "coffee" &&
                    (isLandscapeSplit ? (
                      <View style={landscapeGridStyle}>
                        <View style={landscapeColumnPrimaryStyle}>
                          {coffeeHeroCard}
                          {coffeeDescaleNeeded && (
                            <View style={styles.alertRow}>
                              <Ionicons
                                name="warning"
                                size={14}
                                color="#D8465B"
                              />
                              <Text style={styles.alertText}>
                                Descale cycle recommended
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={landscapeColumnSecondaryStyle}>
                          {coffeeControlCards}
                        </View>
                      </View>
                    ) : (
                      <>
                        {coffeeHeroCard}
                        {coffeeDescaleNeeded && (
                          <View style={styles.alertRow}>
                            <Ionicons
                              name="warning"
                              size={14}
                              color="#D8465B"
                            />
                            <Text style={styles.alertText}>
                              Descale cycle recommended
                            </Text>
                          </View>
                        )}
                        {coffeeControlCards}
                      </>
                    ))}
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={powerDockStyle}>
            <Pressable style={styles.powerWrap} onPress={handlePowerToggle}>
              <View style={powerRingStyle}>
                <LinearGradient
                  colors={
                    device.isOn
                      ? [theme.colors.accent2, theme.colors.accent]
                      : ["rgba(255,255,255,0.88)", "rgba(255,255,255,0.88)"]
                  }
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.powerInner}
                >
                  <Ionicons
                    name="power"
                    size={24}
                    color={device.isOn ? "#FFFFFF" : "rgba(12,12,18,0.45)"}
                  />
                </LinearGradient>
              </View>
            </Pressable>
          </View>
        </LinearGradient>
        </>
      </SafeAreaView>

      <DeviceEditModal
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        cardStyle={editCardStyle}
        titleStyle={editTitleTextStyle}
        subtitleStyle={editSubTextStyle}
        labelStyle={editLabelTextStyle}
        inputStyle={editInputStyle}
        draftName={draftName}
        onChangeDraftName={setDraftName}
        rooms={rooms}
        draftRoomId={draftRoomId}
        onChangeDraftRoomId={setDraftRoomId}
        roomRowStyle={styles.roomRow}
        roomPillStyle={roomPillStyle}
        roomPillTextStyle={roomPillTextStyle}
        isLaundry={isLaundry}
        stackEnabled={stackEnabled}
        onToggleStack={setStackEnabled}
        stackPartnerKind={stackPartnerKind}
        stackRowStyle={styles.stackRow}
        stackPillStyle={stackPillStyle}
        stackPillTextStyle={stackPillTextStyle}
        stackTargetsRowStyle={styles.stackTargetsRow}
        stackCandidates={stackCandidates}
        stackTargetId={stackTargetId}
        onChangeStackTargetId={setStackTargetId}
        stackTargetPillStyle={stackTargetPillStyle}
        stackTargetTextStyle={stackTargetTextStyle}
        stackHintStyle={styles.stackHint}
        actionsStyle={styles.editActions}
        ghostButtonStyle={editGhostButtonStyle}
        ghostTextStyle={editGhostTextStyle}
        primaryButtonStyle={editPrimaryButtonStyle}
        primaryTextStyle={editPrimaryTextStyle}
        deleteButtonStyle={editDeleteButtonStyle}
        deleteTextStyle={editDeleteTextStyle}
        canSave={draftName.trim().length > 0 && canStackSave}
        onSave={handleEditSave}
        onDelete={handleEditDelete}
      />

      <DeviceScheduleModal
        visible={showSchedule}
        onClose={() => setShowSchedule(false)}
        cardStyle={scheduleCardStyle}
        titleStyle={editTitleTextStyle}
        subtitleStyle={editSubTextStyle}
        labelStyle={editLabelTextStyle}
        timeRowStyle={styles.timeRow}
        timeInputStyle={timeInputStyle}
        timeColonStyle={styles.timeColon}
        dayRowStyle={styles.dayRow}
        dayChipStyle={dayChipStyle}
        dayChipTextStyle={dayChipTextStyle}
        schedHour={schedHour}
        onChangeSchedHour={setSchedHour}
        schedMinute={schedMinute}
        onChangeSchedMinute={setSchedMinute}
        schedDays={schedDays}
        onToggleDay={handleToggleScheduleDay}
        actionsStyle={styles.editActions}
        ghostButtonStyle={editGhostButtonStyle}
        ghostTextStyle={editGhostTextStyle}
        primaryButtonStyle={editPrimaryButtonStyle}
        primaryTextStyle={editPrimaryTextStyle}
        canSave={schedDays.length > 0}
        onSave={handleScheduleSave}
      />
    </LinearGradient>
  );
}

const stylesVars = {
  ink: "rgba(12,12,18,0.88)",
  subtext: "rgba(12,12,18,0.55)",
  muted: "rgba(12,12,18,0.38)",
};

const styles = StyleSheet.create({
  outer: { flex: 1, padding: 18 },
  outerTablet: { paddingTop: 24 },
  safe: { flex: 1 },
  panel: {
    flex: 1,
    borderRadius: 42,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    overflow: "hidden",
  },
  panelPortrait: { borderWidth: 0, borderColor: "transparent" },
  panelBody: { flex: 1 },
  panelScroll: { paddingTop: 12 },
  landscapeGrid: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  landscapeColumn: { flex: 1, minWidth: 0, alignItems: "stretch" },
  landscapeColumnPrimary: {
    flex: 1.05,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  landscapeColumnSecondary: {
    flex: 0.95,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  panelTablet: { maxWidth: 860, width: "100%", alignSelf: "center" },

  headerPill: {
    height: 56,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.60)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: stylesVars.ink,
    fontWeight: "900",
    zIndex: 1,
  },

  acDialWrap: { alignItems: "center" },
  acMoodStack: { alignItems: "center" },
  moodLabel: {
    textAlign: "center",
    color: stylesVars.subtext,
    fontWeight: "800",
    marginTop: 12,
  },
  moodValue: {
    textAlign: "center",
    color: stylesVars.ink,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 6,
  },

  genericIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.70)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },

  powerDock: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  powerWrap: { alignSelf: "center" },
  powerRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  powerRingOn: {
    backgroundColor: "rgba(122,92,255,0.14)",
    borderColor: "rgba(122,92,255,0.25)",
    shadowColor: "rgba(122,92,255,0.55)",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  powerInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.60)",
    alignItems: "center",
    justifyContent: "center",
  },

  genericHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
  },
  capabilitiesWrap: { marginTop: 16 },
  heroTitle: { color: stylesVars.ink, fontWeight: "900", fontSize: 18 },
  heroSub: { color: stylesVars.subtext, fontWeight: "700", marginTop: 4 },
  openPortraitStatusText: {
    marginTop: 10,
    textAlign: "center",
    color: stylesVars.ink,
    fontWeight: "900",
    fontSize: 15,
  },
  openPortraitMetaText: {
    marginTop: 4,
    textAlign: "center",
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 12,
  },
  garageStatusText: {
    marginTop: 6,
    marginBottom: 2,
    textAlign: "center",
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 12,
  },
  heaterStatusText: {
    marginTop: 6,
    marginBottom: 2,
    textAlign: "center",
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 12,
  },

  controlCard: {
    marginTop: 14,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  controlCardLandscape: {
    backgroundColor: "rgba(255,255,255,0.26)",
    borderColor: "rgba(255,255,255,0.5)",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  controlCardRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  cardLabel: { color: stylesVars.subtext, fontWeight: "800", marginBottom: 8 },
  cardHint: {
    color: stylesVars.muted,
    fontWeight: "700",
    marginTop: -2,
    marginBottom: 6,
  },
  controlPill: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(180,107,255,0.20)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlPillText: { color: stylesVars.ink, fontWeight: "900" },
  controlPillActive: {
    backgroundColor: "rgba(122,92,255,0.28)",
    borderColor: "rgba(122,92,255,0.4)",
  },
  controlPillTextActive: { color: stylesVars.ink },
  chipRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  pressureSliderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  pressureSliderLabel: {
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 12,
  },
  pressureSliderValue: {
    color: stylesVars.ink,
    fontWeight: "900",
    fontSize: 12,
  },
  pressureSlider: { marginTop: 6, marginBottom: 2 },
  chip: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.70)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  chipRowItem: { flexDirection: "row", gap: 6 },
  chipActive: {
    backgroundColor: "rgba(180,107,255,0.24)",
    borderColor: "rgba(122,92,255,0.3)",
  },
  chipText: { color: stylesVars.subtext, fontWeight: "900", fontSize: 12 },
  chipTextActive: { color: stylesVars.ink },
  infoOrb: {
    alignSelf: "center",
    width: 190,
    height: 190,
    borderRadius: 95,
    overflow: "hidden",
    shadowColor: "rgba(180,107,255,0.35)",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    marginBottom: 12,
  },
  infoOrbInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  energyLottieLayer: {
    position: "absolute",
    left: -8,
    right: -8,
    top: -8,
    bottom: -8,
    opacity: 0.5,
  },
  energyLottie: { width: "100%", height: "100%" },
  energyOrbContent: { alignItems: "center", justifyContent: "center" },
  infoValue: { marginTop: 8, color: "#fff", fontWeight: "900", fontSize: 24 },
  infoSub: {
    marginTop: 4,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
    fontSize: 12,
  },
  energyHeroCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.25)",
    overflow: "hidden",
    shadowColor: "rgba(122,92,255,0.28)",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  energyHeroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  energyHeroHeaderStack: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  energyHeroTitleWrap: { gap: 2, flexShrink: 1, flex: 1, minWidth: 0 },
  energyHeroTitle: {
    color: stylesVars.ink,
    fontWeight: "900",
    fontSize: 16,
    flexShrink: 1,
  },
  energyHeroSub: {
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 12,
    flexShrink: 1,
  },
  energyHeroPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    flexShrink: 1,
  },
  energyHeroPill: {
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  energyHeroPillActive: {
    backgroundColor: "rgba(122,92,255,0.22)",
    borderColor: "rgba(122,92,255,0.4)",
  },
  energyHeroPillText: { color: stylesVars.subtext, fontWeight: "800" },
  energyHeroPillTextActive: { color: stylesVars.ink },
  energyHeroBody: { marginTop: 12 },
  energyHeroOrb: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.75)",
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.24)",
    overflow: "hidden",
    shadowColor: "rgba(122,92,255,0.35)",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  energyHeroOrbGlow: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  energyHeroInfo: { flex: 1, minWidth: 0 },
  energyHeroStatsRow: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  energyHeroStatsRowCentered: {
    justifyContent: "center",
    alignSelf: "stretch",
  },
  energyHeroStatsRowCompact: { marginTop: 10 },
  energyHeroStat: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  energyHeroStatActive: {
    borderColor: "rgba(122,92,255,0.4)",
    backgroundColor: "rgba(122,92,255,0.14)",
  },
  energyHeroStatValue: { color: stylesVars.ink, fontWeight: "900" },
  energyHeroStatLabel: {
    marginTop: 4,
    color: stylesVars.subtext,
    fontWeight: "800",
  },
  energyHeroProgressWrap: {
    marginTop: 16,
    gap: 8,
    width: "100%",
    alignItems: "flex-start",
  },
  energyHeroProgressTrack: {
    width: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(122,92,255,0.15)",
    overflow: "hidden",
  },
  energyHeroProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(122,92,255,0.7)",
  },
  energyHeroProgressMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
    flexWrap: "wrap",
  },
  energyHeroMetaText: {
    color: stylesVars.subtext,
    fontWeight: "800",
    flexShrink: 1,
  },
  energyHeroHint: { marginTop: 6, color: stylesVars.subtext, fontWeight: "700" },
  utilityHeroCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.22)",
    overflow: "hidden",
    shadowColor: "rgba(122,92,255,0.18)",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  utilityHeroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  utilityHeroTitleWrap: { gap: 2, flexShrink: 1, flex: 1, minWidth: 0 },
  utilityHeroTitle: { color: stylesVars.ink, fontWeight: "900", fontSize: 16 },
  utilityHeroSub: { color: stylesVars.subtext, fontWeight: "800", fontSize: 12 },
  utilityHeroPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    flexShrink: 1,
  },
  utilityHeroPill: {
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  utilityHeroPillActive: {
    backgroundColor: "rgba(122,92,255,0.22)",
    borderColor: "rgba(122,92,255,0.4)",
  },
  utilityHeroPillText: { color: stylesVars.subtext, fontWeight: "800" },
  utilityHeroPillTextActive: { color: stylesVars.ink },
  utilityHeroBody: { marginTop: 12 },
  utilityHeroOrb: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.75)",
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.24)",
    overflow: "hidden",
    shadowColor: "rgba(122,92,255,0.35)",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  utilityHeroOrbGlow: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  utilityHeroOrbContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  utilityHeroOrbValue: {
    marginTop: 8,
    color: "#fff",
    fontWeight: "900",
    fontSize: 20,
    textAlign: "center",
  },
  utilityHeroOrbSub: {
    marginTop: 4,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
    fontSize: 12,
    textAlign: "center",
  },
  utilityHeroInfo: { flex: 1, minWidth: 0 },
  utilityHeroActionRow: {
    marginTop: 12,
    paddingHorizontal: 0,
    flexWrap: "wrap",
  },
  utilityHeroActionRowLeft: { justifyContent: "flex-start" },
  utilityHeroMetricRow: {
    marginTop: 12,
    paddingHorizontal: 0,
    flexWrap: "wrap",
  },
  utilityHeroMetricRowLeft: { justifyContent: "flex-start" },
  coffeeHeroActionRow: {
    marginTop: 12,
    width: "100%",
    justifyContent: "space-between",
    alignSelf: "stretch",
  },
  coffeeHeroActionPill: { flex: 1 },
  energySideColumn: { alignSelf: "stretch" },
  waterOrb: {
    alignSelf: "center",
    overflow: "hidden",
    shadowColor: "rgba(180,107,255,0.35)",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    marginBottom: 12,
  },
  waterOrbOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  waterOrbValue: { color: "#fff", fontWeight: "900", fontSize: 22 },
  waterOrbSub: {
    marginTop: 6,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
    fontSize: 12,
  },
  waterOrbPercent: {
    marginTop: 6,
    color: "rgba(255,255,255,0.9)",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.4,
  },
  metricRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  metricCard: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: { color: stylesVars.ink, fontWeight: "900", fontSize: 16 },
  metricLabel: {
    marginTop: 4,
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 11,
  },
  airHeroCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.22)",
    overflow: "hidden",
    shadowColor: "rgba(122,92,255,0.28)",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  airHeroGlow: {
    position: "absolute",
    width: "140%",
    height: "120%",
    top: -80,
    right: -120,
    opacity: 0.12,
    borderRadius: 999,
  },
  airHeroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  airHeroTitle: { color: stylesVars.ink, fontWeight: "900", fontSize: 18 },
  airHeroSub: {
    marginTop: 2,
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 12,
  },
  airHeroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
  },
  airHeroBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  airHeroBadgeText: { color: stylesVars.ink, fontWeight: "800" },
  airHeroBody: { marginTop: 16, alignItems: "center" },
  airHeroScore: { flex: 1, minWidth: 0 },
  airHeroLabel: { color: stylesVars.subtext, fontWeight: "800" },
  airHeroValue: { color: stylesVars.ink, fontWeight: "900" },
  airHeroDescriptor: {
    marginTop: 4,
    color: stylesVars.subtext,
    fontWeight: "800",
  },
  airHeroMetaRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  airHeroMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  airHeroMetaText: { color: stylesVars.ink, fontWeight: "800", fontSize: 12 },
  airHeroGaugeWrap: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 140,
  },
  airHeroGaugeRing: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  airHeroGaugeInner: {
    flex: 1,
    margin: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  airHeroGaugeValue: { color: "#fff", fontWeight: "900" },
  airHeroGaugeLabel: {
    marginTop: 2,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
  },
  airHeroUpdated: {
    marginTop: 10,
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 11,
  },
  airHeroMetricRow: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  airHeroMetric: {
    flex: 1,
    minWidth: 90,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  airHeroMetricValue: { color: stylesVars.ink, fontWeight: "900", fontSize: 14 },
  airHeroMetricLabel: {
    marginTop: 4,
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 11,
  },
  airMetricGrid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  airMetricCard: {
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "rgba(122,92,255,0.2)",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  airMetricValue: { color: stylesVars.ink, fontWeight: "900", fontSize: 15 },
  airMetricLabel: {
    marginTop: 4,
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 10,
  },
  airSurfaceCard: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderColor: "rgba(122,92,255,0.18)",
    shadowColor: "rgba(122,92,255,0.22)",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  airKpiRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  airKpiCard: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "rgba(122,92,255,0.2)",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  airKpiValue: { color: stylesVars.ink, fontWeight: "900", fontSize: 16 },
  airKpiLabel: {
    marginTop: 4,
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 11,
  },
  airTrendCard: {
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.18)",
    overflow: "hidden",
    shadowColor: "rgba(122,92,255,0.2)",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  airTrendHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  airTrendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
  },
  airTrendText: { color: stylesVars.ink, fontWeight: "900", fontSize: 12 },
  airTrendChartFrame: {
    marginTop: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "rgba(122,92,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.14)",
  },
  airChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
    minHeight: 72,
  },
  airChartBar: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "rgba(122,92,255,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
  },
  airLegendRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  airLegendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  airLegendDot: { width: 8, height: 8, borderRadius: 4 },
  airLegendText: {
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 11,
  },
  airTrendUpdated: {
    marginTop: 10,
    textAlign: "center",
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 11,
  },
  airRecommendationRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.75)",
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.12)",
  },
  airRecommendationText: {
    flex: 1,
    color: stylesVars.subtext,
    fontWeight: "700",
    fontSize: 12,
  },
  airCompareRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  airCompareCard: {
    flex: 1,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.16)",
    shadowColor: "rgba(122,92,255,0.2)",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  airCompareTitle: { color: stylesVars.subtext, fontWeight: "800" },
  airCompareValue: {
    marginTop: 6,
    color: stylesVars.ink,
    fontWeight: "900",
    fontSize: 16,
  },
  airCompareSub: {
    marginTop: 4,
    color: stylesVars.subtext,
    fontWeight: "700",
    fontSize: 11,
  },
  airSensorList: { marginTop: 10, gap: 10 },
  airSensorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.14)",
    shadowColor: "rgba(122,92,255,0.18)",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  airSensorRowActive: {
    borderColor: "rgba(122,92,255,0.4)",
    backgroundColor: "rgba(180,107,255,0.2)",
  },
  airSensorDot: { width: 10, height: 10, borderRadius: 5 },
  airSensorName: { color: stylesVars.ink, fontWeight: "900", fontSize: 13 },
  airSensorSub: {
    marginTop: 2,
    color: stylesVars.subtext,
    fontWeight: "700",
    fontSize: 11,
  },
  airSensorValue: { color: stylesVars.ink, fontWeight: "900", fontSize: 12 },
  airAlertCard: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(216,70,91,0.28)",
  },
  airAlertText: { color: "#D8465B", fontWeight: "800", fontSize: 12 },
  airAlertSliderBlock: { marginTop: 10 },
  airAlertSliderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  airAlertSliderLabel: {
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 12,
  },
  airAlertSliderValue: {
    color: stylesVars.ink,
    fontWeight: "900",
    fontSize: 12,
  },
  airAlertSliderWrap: {
    marginTop: 6,
    height: 40,
    justifyContent: "center",
  },
  airAlertTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(122,92,255,0.14)",
    borderWidth: 0,
    overflow: "hidden",
  },
  airAlertTrackFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(122,92,255,0.72)",
  },
  airAlertSlider: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 40,
  },
  budgetHint: {
    marginTop: 10,
    textAlign: "center",
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 12,
  },
  statusMetaText: {
    marginTop: 8,
    textAlign: "center",
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 12,
  },
  alertRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
  },
  alertText: { color: "#D8465B", fontWeight: "800", fontSize: 12 },
  alertTextWarn: { color: "#B7791F", fontWeight: "800", fontSize: 12 },
  cameraFeed: {
    height: 200,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    shadowColor: "rgba(122,92,255,0.35)",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  cameraFeedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cameraLivePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  cameraLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
  },
  cameraLiveText: { color: stylesVars.ink, fontWeight: "900", fontSize: 12 },
  cameraStatusText: {
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 12,
  },
  gateStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  gateStatusText: { color: stylesVars.ink, fontWeight: "900", fontSize: 12 },
  cameraFeedBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  cameraPreviewText: { color: stylesVars.subtext, fontWeight: "800" },
  cameraDetectRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cameraDetectPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  cameraDetectPillAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,214,214,0.7)",
    borderWidth: 1,
    borderColor: "rgba(200,60,60,0.2)",
  },
  cameraDetectText: { color: stylesVars.ink, fontWeight: "800", fontSize: 12 },
  cameraMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.14)",
  },
  cameraMemberName: { color: stylesVars.ink, fontWeight: "900", fontSize: 13 },
  cameraMemberRole: {
    color: stylesVars.subtext,
    fontWeight: "700",
    fontSize: 11,
  },
  cameraPresencePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  cameraPresenceHome: { backgroundColor: "rgba(180,107,255,0.22)" },
  cameraPresenceAway: { backgroundColor: "rgba(255,255,255,0.6)" },
  cameraPresenceText: {
    color: stylesVars.ink,
    fontWeight: "800",
    fontSize: 11,
  },
  cameraEventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  cameraEventDot: { width: 8, height: 8, borderRadius: 4 },
  cameraEventDotKnown: { backgroundColor: theme.colors.accent },
  cameraEventDotUnknown: { backgroundColor: "#C4384C" },
  cameraEventText: {
    color: stylesVars.subtext,
    fontWeight: "700",
    fontSize: 12,
  },
  mediaRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    justifyContent: "center",
  },
  speakerNowCard: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  speakerNowInner: {
    borderRadius: 18,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  speakerCover: {
    backgroundColor: "rgba(255,255,255,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    overflow: "hidden",
  },
  speakerCoverInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  speakerNowMeta: { flex: 1, minWidth: 0 },
  speakerTrackTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },
  speakerTrackArtist: {
    marginTop: 2,
    color: "rgba(255,255,255,0.9)",
    fontWeight: "700",
    fontSize: 12,
  },
  speakerTrackSub: {
    marginTop: 2,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "700",
    fontSize: 11,
  },
  speakerSourcePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  speakerSourceText: {
    color: "rgba(12,12,18,0.8)",
    fontWeight: "900",
    fontSize: 11,
  },
  speakerProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  speakerProgressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.5)",
    overflow: "hidden",
  },
  speakerProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  speakerTime: {
    width: 42,
    textAlign: "center",
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
    fontSize: 11,
  },
  speakerVisualizerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  speakerVisualizerBar: {
    width: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  speakerSliderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  speakerSliderLabel: {
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 12,
  },
  speakerSliderValue: {
    color: stylesVars.ink,
    fontWeight: "900",
    fontSize: 12,
  },
  speakerSlider: { marginTop: 6, marginBottom: 2 },
  mediaBtn: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaBtnActive: {
    backgroundColor: "rgba(180,107,255,0.22)",
    borderColor: "rgba(122,92,255,0.3)",
  },
  actionRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 22,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  laundryActionRow: {
    marginTop: 0,
    paddingHorizontal: 0,
  },
  modeTile: {
    height: 92,
    width: 92,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.70)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  modeTileActive: {
    backgroundColor: "rgba(255,255,255,0.84)",
    borderColor: "rgba(122,92,255,0.25)",
    shadowColor: "rgba(122,92,255,0.40)",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  modeIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  modeIconBubbleActive: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "rgba(122,92,255,0.65)",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  modeText: { color: "rgba(12,12,18,0.58)", fontWeight: "900", fontSize: 12 },
  modeTextActive: { color: "rgba(12,12,18,0.86)" },
  gateAutoLabel: { marginBottom: 4 },
  gateAutoHint: { marginBottom: 4 },
  gateAutoChipRow: { marginTop: 4 },
  doorWrap: { alignItems: "center", marginTop: 10 },
  doorFrame: {
    width: 170,
    height: 200,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  doorPanel: {
    width: 120,
    height: 170,
    borderRadius: 16,
    backgroundColor: "rgba(180,107,255,0.35)",
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  doorHandle: {
    width: 26,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.8)",
    position: "absolute",
    right: 14,
  },
  doorTitle: {
    marginTop: 12,
    color: stylesVars.ink,
    fontWeight: "900",
    fontSize: 16,
  },
  doorStatus: { marginTop: 4, color: stylesVars.subtext, fontWeight: "800" },

  // Light UI
  lightLayout: { gap: 12 },
  lightLayoutRow: { flexDirection: "row", alignItems: "flex-start" },
  lightDialColumn: { flex: 1 },
  lightDialCard: { alignItems: "center" },
  lightControlsColumn: { flex: 1, minWidth: 0 },
  lightControlsGrid: { flexDirection: "row", flexWrap: "wrap" },
  lightControlCompact: { flex: 1, minWidth: 160 },
  lightControlHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lightControlCard: { alignItems: "stretch" },
  lightCenterOrb: {
    alignSelf: "center",
    overflow: "hidden",
    shadowColor: "rgba(180,107,255,0.55)",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  lightCenterOrbLight: { borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  lightCenterInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  lightCenterInnerLight: {
    borderWidth: 1,
  },
  lightCenterValue: { color: "#fff", fontWeight: "900" },
  lightCenterRoom: { color: "rgba(255,255,255,0.85)", fontWeight: "800" },

  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  swatch: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  swatchActive: { borderColor: "rgba(180,107,255,0.8)", borderWidth: 2 },

  sceneRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  sceneText: { color: stylesVars.ink, fontWeight: "900" },
  sceneCardItem: {
    flex: 1,
    minWidth: 86,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sceneIconWrap: {
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },

  // TV UI
  tvOrb: {
    alignSelf: "center",
    width: 220,
    height: 220,
    borderRadius: 110,
    overflow: "hidden",
    shadowColor: "rgba(43,130,170,0.35)",
    shadowOpacity: 0.26,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  tvOrbInner: { flex: 1, alignItems: "center", justifyContent: "center" },
  tvHeroCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "rgba(90,120,150,0.2)",
    overflow: "hidden",
    shadowColor: "rgba(43,130,170,0.25)",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  tvHeroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  tvHeroTitleWrap: { flex: 1, minWidth: 0 },
  tvHeroTitle: { color: stylesVars.ink, fontWeight: "900", fontSize: 18 },
  tvHeroRoom: {
    marginTop: 2,
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 12,
  },
  tvHeroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  tvHeroPillActive: {
    backgroundColor: "rgba(46,169,201,0.18)",
    borderColor: "rgba(46,169,201,0.32)",
  },
  tvHeroPillText: { color: stylesVars.subtext, fontWeight: "800" },
  tvHeroPillTextActive: { color: stylesVars.ink },
  tvScreenFrame: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(13,20,30,0.12)",
    overflow: "hidden",
  },
  tvScreenInner: { justifyContent: "space-between" },
  tvScreenOffInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  tvScreenTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tvScreenBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  tvScreenBadgeText: { color: "#fff", fontWeight: "800" },
  tvScreenMeta: { color: "rgba(255,255,255,0.72)", fontWeight: "700" },
  tvScreenCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  tvScreenTitle: { color: "#fff", fontWeight: "900", textAlign: "center" },
  tvScreenSubtitle: {
    color: "rgba(255,255,255,0.82)",
    fontWeight: "700",
    textAlign: "center",
  },
  tvScreenFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tvScreenFooterItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  tvScreenFooterLabel: {
    color: "rgba(255,255,255,0.7)",
    fontWeight: "700",
  },
  tvScreenFooterValue: { color: "#fff", fontWeight: "800" },
  tvVolumeCard: { alignItems: "center", gap: 8 },
  tvVolumeHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tvVolumeMutePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  tvVolumeMutePillActive: {
    backgroundColor: "rgba(236,88,88,0.18)",
    borderColor: "rgba(236,88,88,0.35)",
  },
  tvVolumeMuteText: { color: stylesVars.subtext, fontWeight: "800" },
  tvVolumeMuteTextActive: { color: stylesVars.ink },
  tvVolumeValue: { marginTop: 6, color: "#fff", fontWeight: "900" },
  tvVolumeLabel: {
    marginTop: 2,
    color: "rgba(255,255,255,0.82)",
    fontWeight: "700",
  },
  tvVolumeHint: {
    color: stylesVars.subtext,
    fontWeight: "700",
    textAlign: "center",
  },
  tvRemoteHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  tvRemoteTitle: { color: stylesVars.subtext, fontWeight: "800" },
  tvRemoteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  tvRemoteBadgeText: { color: stylesVars.ink, fontWeight: "800", fontSize: 11 },
  tvOffLottie: {},
  deviceLottieDock: {
    alignSelf: "center",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  deviceLottie: { width: "100%", height: "100%" },
  openStatusOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  openStatusValue: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 22,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowRadius: 6,
  },
  openStatusLabel: {
    marginTop: 4,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
    fontSize: 12,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowRadius: 6,
  },
  laundryHeroCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.28)",
    overflow: "hidden",
    shadowColor: "rgba(122,92,255,0.35)",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  laundryHeroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  laundryHeroHeaderSolo: { justifyContent: "flex-end" },
  laundryNoticeRow: {
    marginTop: 10,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(122,92,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.28)",
  },
  laundryNoticeText: {
    color: stylesVars.ink,
    fontWeight: "800",
    fontSize: 12,
  },
  laundryNoticeTextDone: { color: "#2F8A5B" },
  laundryHeroStatusPill: {
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  laundryHeroStatusPillActive: {
    backgroundColor: "rgba(122,92,255,0.22)",
    borderColor: "rgba(122,92,255,0.4)",
  },
  laundryHeroStatusText: { color: stylesVars.subtext, fontWeight: "800" },
  laundryHeroStatusTextActive: { color: stylesVars.ink },
  laundryHeroBadge: {
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  laundryHeroBadgeText: { color: stylesVars.ink, fontWeight: "800" },
  laundryHeroBody: {
    marginTop: 12,
  },
  laundryHeroLottieWrap: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.75)",
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.24)",
    overflow: "hidden",
  },
  laundryHeroLottieGlow: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  laundryHeroLottie: { width: "100%", height: "100%" },
  laundryHeroOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "flex-end",
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  laundryHeroPhase: {
    color: stylesVars.ink,
    fontWeight: "900",
  },
  laundryHeroStack: {
    alignSelf: "stretch",
    alignItems: "center",
  },
  laundryHeroCenterText: { textAlign: "center" },
  laundryHeroLeftColumn: {
    alignItems: "center",
    alignSelf: "center",
  },
  laundryHeroInfo: { flex: 1, minWidth: 0 },
  laundryCycleText: { color: stylesVars.ink, fontWeight: "900" },
  laundryCycleSubText: { color: stylesVars.subtext, fontWeight: "800" },
  laundryProgressTrack: {
    marginTop: 10,
    alignSelf: "stretch",
    backgroundColor: "rgba(122,92,255,0.15)",
    borderRadius: 999,
    overflow: "hidden",
  },
  laundryProgressFill: {
    height: "100%",
    backgroundColor: "rgba(122,92,255,0.7)",
    borderRadius: 999,
  },
  laundryStatsRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
  },
  laundryHeroMetrics: { alignSelf: "stretch" },
  laundryStat: {
    flex: 1,
    minWidth: 70,
    alignItems: "center",
  },
  laundryStatLandscape: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  laundryStatValue: { color: stylesVars.ink, fontWeight: "900" },
  laundryStatLabel: {
    marginTop: 4,
    color: stylesVars.subtext,
    fontWeight: "800",
  },
  laundryControlGrid: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
  },
  laundryGridItem: {
    alignSelf: "stretch",
    width: "100%",
  },
  laundryGridItemFull: {
    alignSelf: "stretch",
    width: "100%",
  },
  windowHeroCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.25)",
    overflow: "hidden",
    shadowColor: "rgba(122,92,255,0.28)",
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  windowHeroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  windowHeroTitleWrap: { gap: 2, flexShrink: 1 },
  windowHeroTitle: { color: stylesVars.ink, fontWeight: "900", fontSize: 16 },
  windowHeroSub: { color: stylesVars.subtext, fontWeight: "800", fontSize: 12 },
  windowHeroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.75)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  windowHeroPillActive: {
    backgroundColor: "rgba(122,92,255,0.18)",
    borderColor: "rgba(122,92,255,0.4)",
  },
  windowHeroPillText: { color: stylesVars.subtext, fontWeight: "800" },
  windowHeroPillTextActive: { color: stylesVars.ink },
  windowHeroBody: {
    marginTop: 14,
  },
  windowHeroOrb: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.75)",
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.2)",
    overflow: "hidden",
  },
  windowHeroOrbClosed: { opacity: 0.7 },
  windowHeroOrbGlow: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  windowHeroLottie: { width: "100%", height: "100%" },
  windowHeroControls: { flex: 1, minWidth: 0 },
  windowHeroMeterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  windowHeroMeterLabel: {
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 12,
  },
  windowHeroMeterValue: {
    color: stylesVars.ink,
    fontWeight: "900",
    fontSize: 18,
  },
  windowHeroSliderWrap: {
    marginTop: 8,
    height: 24,
    justifyContent: "center",
    width: "100%",
  },
  windowHeroSlider: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 24,
  },
  windowHeroTrack: {
    marginTop: 0,
    alignSelf: "stretch",
    height: 10,
    backgroundColor: "rgba(122,92,255,0.14)",
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(122,92,255,0.22)",
  },
  windowHeroTrackFill: {
    height: "100%",
    backgroundColor: "rgba(122,92,255,0.7)",
    borderRadius: 999,
  },
  windowHeroHint: {
    marginTop: 8,
    color: stylesVars.subtext,
    fontWeight: "800",
    textAlign: "center",
  },
  orbActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  remoteRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  remoteGrid: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 6,
    marginTop: 6,
    alignItems: "center",
  },
  remoteBtn: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  remoteBtnWide: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 0,
  },
  remoteBtnCompact: {
    flex: 1,
    height: 38,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  remoteText: { color: stylesVars.ink, fontWeight: "900", fontSize: 9 },
  remotePadWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  remoteCard: { marginTop: 2, paddingBottom: 10, gap: 8 },
  remotePadArea: {
    width: 260,
    height: 176,
    alignItems: "center",
    justifyContent: "center",
  },
  remoteSideLeft: { position: "absolute", top: 0, left: 0 },
  remoteSideRight: { position: "absolute", top: 0, right: 0 },
  navPad: {
    alignSelf: "center",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  navBtn: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  navUp: { top: 8 },
  navDown: { bottom: 8 },
  navLeft: { left: 8 },
  navRight: { right: 8 },
  navCenter: {
    width: 56,
    height: 56,
    borderRadius: 19,
    backgroundColor: "rgba(46,169,201,0.22)",
    borderWidth: 1,
    borderColor: "rgba(46,169,201,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  navCenterText: { color: stylesVars.ink, fontWeight: "900" },

  // Coffee UI
  coffeeOrb: {
    alignSelf: "center",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(180,107,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  coffeeOrbInner: { alignItems: "center", gap: 6 },
  coffeeName: { color: "#fff", fontWeight: "900", marginTop: 6 },
  coffeeRoom: { color: "rgba(255,255,255,0.85)", fontWeight: "800" },
  coffeeCup: {
    marginTop: 8,
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  coffeeFill: {
    width: "100%",
    backgroundColor: "#6B3CFF",
  },

  editCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  editTitle: { color: stylesVars.ink, fontWeight: "900", fontSize: 18 },
  editSub: { color: stylesVars.subtext, fontWeight: "700", marginTop: 6 },
  editLabel: {
    color: stylesVars.subtext,
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 6,
  },
  editInput: {
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(12,12,18,0.04)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    paddingHorizontal: 12,
    color: stylesVars.ink,
    fontWeight: "700",
  },
  roomRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roomPill: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(12,12,18,0.05)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  roomPillActive: {
    backgroundColor: "rgba(107,60,255,0.16)",
    borderColor: "rgba(107,60,255,0.3)",
  },
  roomPillText: { color: stylesVars.subtext, fontWeight: "800", fontSize: 12 },
  roomPillTextActive: { color: stylesVars.ink },
  stackRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    marginBottom: 6,
  },
  stackPill: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  stackPillActive: {
    backgroundColor: "#6B3CFF",
    borderColor: "#6B3CFF",
  },
  stackPillText: { color: "rgba(12,12,18,0.7)", fontWeight: "800" },
  stackPillTextActive: { color: "#fff" },
  stackTargetsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
    marginBottom: 6,
  },
  stackTargetPill: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(12,12,18,0.04)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
  },
  stackTargetPillActive: {
    backgroundColor: "rgba(107,60,255,0.2)",
    borderColor: "rgba(107,60,255,0.5)",
  },
  stackTargetText: { color: stylesVars.ink, fontWeight: "800" },
  stackTargetTextActive: { color: "#6B3CFF" },
  stackHint: {
    color: stylesVars.muted,
    fontWeight: "700",
    marginBottom: 6,
  },
  editActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  editGhost: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  editGhostText: { color: stylesVars.subtext, fontWeight: "800" },
  editPrimary: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#6B3CFF",
    alignItems: "center",
    justifyContent: "center",
  },
  editPrimaryDisabled: { opacity: 0.6 },
  editPrimaryText: { color: "#FFFFFF", fontWeight: "900" },
  scheduleCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  scheduleTime: { color: stylesVars.ink, fontWeight: "900" },
  scheduleDays: {
    color: stylesVars.subtext,
    fontWeight: "700",
    marginTop: 4,
    fontSize: 12,
  },
  scheduleToggle: {
    width: 54,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(12,12,18,0.08)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  scheduleToggleActive: {
    backgroundColor: "rgba(122,92,255,0.28)",
    borderColor: "rgba(122,92,255,0.35)",
  },
  scheduleToggleText: {
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 12,
  },
  scheduleToggleTextActive: { color: stylesVars.ink },
  scheduleEmpty: { color: stylesVars.subtext, fontWeight: "700", marginTop: 6 },
  addSchedule: {
    marginTop: 12,
    height: 40,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  addScheduleText: { color: stylesVars.ink, fontWeight: "900" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  timeInput: {
    width: 60,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(12,12,18,0.04)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    textAlign: "center",
    color: stylesVars.ink,
    fontWeight: "700",
  },
  timeColon: { fontSize: 18, fontWeight: "900", color: stylesVars.ink },
  dayRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  dayChip: {
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 999,
    backgroundColor: "rgba(12,12,18,0.05)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  dayChipActive: {
    backgroundColor: "rgba(107,60,255,0.16)",
    borderColor: "rgba(107,60,255,0.3)",
  },
  dayChipText: { color: stylesVars.subtext, fontWeight: "800", fontSize: 12 },
  dayChipTextActive: { color: stylesVars.ink },
  editDelete: {
    marginTop: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255, 99, 132, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  editDeleteText: { color: "#8b1e3a", fontWeight: "900" },
});
