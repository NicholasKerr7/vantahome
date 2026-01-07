import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
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
const WASHER_LOTTIE_SOURCE = require("../../assets/animations/washer-screen.json");
const DOOR_LOTTIE_SOURCE = require("../../assets/animations/door-screen.json");
const GATE_LOTTIE_SOURCE = require("../../assets/animations/front-gate-screen.json");
const STOVE_LOTTIE_SOURCE = require("../../assets/animations/stove-screen.json");
const ENERGY_LOTTIE_SOURCE = require("../../assets/animations/energy-screen.json");
const WATER_LOTTIE_SOURCE = require("../../assets/animations/water.json");
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
  const airOrbSize = Math.round((isTablet ? 220 : 190) * scale);
  const laundryDialSize = compactDialSize;
  const laundryCenterSize = Math.max(140, Math.round(laundryDialSize * 0.66));
  const laundryCenterRadius = Math.round(laundryCenterSize / 2);
  const laundryCenterValueSize = Math.max(
    20,
    Math.round(laundryCenterSize * 0.26),
  );
  const laundryCenterLabelSize = Math.max(
    11,
    Math.round(laundryCenterSize * 0.12),
  );
  const windowDialSize = compactDialSize;
  const windowCenterSize = Math.max(120, Math.round(windowDialSize * 0.66));
  const windowCenterRadius = Math.round(windowCenterSize / 2);
  const windowCenterValueSize = Math.max(
    18,
    Math.round(windowCenterSize * 0.24),
  );
  const windowCenterLabelSize = Math.max(
    11,
    Math.round(windowCenterSize * 0.12),
  );
  const speakerBarBase = Math.round((isTablet ? 12 : 10) * scale);
  const speakerBarMax = Math.round((isTablet ? 36 : 28) * scale);
  const speakerCoverSize = Math.round((isTablet ? 72 : 60) * scale);
  const controlCardPad = Math.round((isTablet ? 16 : 12) * scale);
  const controlCardRadius = Math.round((isTablet ? 20 : 18) * scale);
  const controlCardRowGap = Math.round((isTablet ? 12 : 10) * scale);
  const isLightCompact = !isTablet;
  const isLightMobile = !isTablet && !isLandscape;
  const lightDialSize = Math.round(
    Math.min(
      dialSize * (isLightMobile ? 0.78 : isLightCompact ? 0.86 : 1),
      contentWidth - panelPad * 2,
      height * (isLandscape ? 0.58 : isTablet ? 0.48 : 0.32),
    ),
  );
  const lightCenterSize = Math.min(
    240,
    Math.max(
      120,
      Math.round(
        lightDialSize * (isLightMobile ? 0.86 : isLightCompact ? 0.84 : 0.88),
      ),
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
  const lightCardPad = Math.round((isTablet ? 16 : 8) * scale);
  const lightCardRadius = Math.round((isTablet ? 20 : 16) * scale);
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
        { padding: controlCardPad, borderRadius: controlCardRadius },
      ]
    : styles.controlCard;
  const controlCardRowStyle = isTablet
    ? [styles.controlCardRow, { gap: controlCardRowGap }]
    : styles.controlCardRow;
  const lightLayoutRow = isLandscape || isTablet;
  const lightCardBaseStyle = {
    padding: lightCardPad,
    borderRadius: lightCardRadius,
    marginTop: 0,
  };
  const lightDialCardStyle = [
    styles.controlCard,
    lightCardBaseStyle,
    styles.lightDialCard,
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
  const renderDeviceLottie = (source: any, size: number) => (
    <View
      style={[
        styles.deviceLottieDock,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size / 2),
        },
      ]}
    >
      <LottieView
        source={source}
        autoPlay
        loop
        resizeMode="contain"
        style={styles.deviceLottie}
      />
    </View>
  );
  const { deviceId } = route.params;
  const device = useHomeStore((s) => s.devices.find((d) => d.id === deviceId));
  const roomName = useHomeStore(
    (s) => s.rooms.find((r) => r.id === device?.roomId)?.name ?? "",
  );
  const removeDevice = useHomeStore((s) => s.removeDevice);
  const household = useHomeStore((s) => s.household);
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
  const bulbGradient = bulbIsLight
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
  const remainingMin = clamp(device.remainingMin ?? 0, 0, 180);
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
  const laundryCycles =
    device.kind === "dryer"
      ? ["Normal", "Quick", "Delicate", "Bedding", "Towels", "Air Fluff"]
      : ["Normal", "Quick", "Delicate", "Bedding", "Eco"];
  const microwaveSeconds = clamp(device.timeRemainingSec ?? 0, 0, 1800);
  const microwavePower = clamp(device.microwavePower ?? 6, 1, 10);
  const microwaveMode = device.microwaveMode ?? "Reheat";
  const sprinklerDuration = clamp(device.durationMin ?? 15, 0, 60);
  const vacuumStatus = device.status ?? "docked";
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
  const gridAvailable = device.gridAvailable ?? true;
  const gridOutageAlerts = device.gridOutageAlerts ?? true;
  const solarW = device.solarW ?? 0;
  const solarToday = device.solarTodayKwh ?? 0;
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
  const setOpenTarget = (target: number) => {
    sendPatch({ openPercent: target, isOn: target > 0 });
  };
  const handlePowerToggle = () => {
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
  const [pressureLowDraft, setPressureLowDraft] = useState(waterPressureLow);
  const [pressureHighDraft, setPressureHighDraft] =
    useState(waterPressureHigh);
  const [speakerBassDraft, setSpeakerBassDraft] = useState(speakerBass);
  const [speakerTrebleDraft, setSpeakerTrebleDraft] = useState(speakerTreble);
  const [showEdit, setShowEdit] = useState(false);
  const [draftName, setDraftName] = useState(device.name);
  const [draftRoomId, setDraftRoomId] = useState(device.roomId);
  const [showSchedule, setShowSchedule] = useState(false);
  const [stackEnabled, setStackEnabled] = useState(false);
  const [stackTargetId, setStackTargetId] = useState<string | null>(null);
  const [cameraEvents, setCameraEvents] = useState<
    Array<{ id: string; label: string; kind: "known" | "unknown"; ts: number }>
  >([]);
  const [schedHour, setSchedHour] = useState("06");
  const [schedMinute, setSchedMinute] = useState("00");
  const [schedDays, setSchedDays] = useState<
    Array<SprinklerSchedule["days"][number]>
  >(["Mon", "Wed", "Fri"]);
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
  const isOpen = isOpenable && openPercent > 0;
  const isClosed = isOpenable && openPercent === 0;
  const renderOpenDeviceLottie = (source: any, size: number) => (
    <View
      style={[
        styles.deviceLottieDock,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size / 2),
        },
      ]}
    >
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
      return;
    }

    if (openDeviceIdRef.current !== device.id) {
      openDeviceIdRef.current = device.id;
      openPercentRef.current = openPercent;
      openProgress.setValue(openPercent / 100);
      setOpenDisplayPercent(Math.round(openPercent));
      setOpenMotion(null);
      return;
    }

    const prev = openPercentRef.current;
    if (prev == null || prev === openPercent) return;

    setOpenMotion(openPercent > prev ? "opening" : "closing");
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

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={[
        styles.outer,
        { padding: gutter },
        isTablet && styles.outerTablet,
      ]}
    >
      <BackgroundLines />

      <SafeAreaView style={styles.safe} edges={["top"]}>
        <LinearGradient
          colors={[
            "rgba(255,255,255,0.92)",
            "rgba(246,238,255,0.88)",
            "rgba(238,228,255,0.86)",
          ]}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 1, y: 1 }}
          style={[
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
          ]}
        >
          <View style={styles.panelBody}>
            <View
              style={[
                styles.headerPill,
                {
                  height: headerHeight,
                  borderRadius: Math.round(headerHeight / 2),
                  paddingHorizontal: Math.round(10 * scale),
                },
              ]}
            >
              <Pressable
                onPress={() => navigation.goBack()}
                style={[
                  styles.headerBtn,
                  {
                    width: headerBtnSize,
                    height: headerBtnSize,
                    borderRadius: headerBtnRadius,
                  },
                ]}
                hitSlop={10}
              >
                <Ionicons
                  name="chevron-back"
                  size={Math.round(20 * scale)}
                  color={stylesVars.ink}
                />
              </Pressable>

              <Text
                style={[styles.headerTitle, { fontSize: headerTitleSize }]}
                numberOfLines={1}
                pointerEvents="none"
              >
                {device.name}
              </Text>

              <Pressable
                style={[
                  styles.headerBtn,
                  {
                    width: headerBtnSize,
                    height: headerBtnSize,
                    borderRadius: headerBtnRadius,
                  },
                ]}
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
              contentContainerStyle={[
                styles.panelScroll,
                {
                  paddingBottom:
                    powerDockHeight + powerDockOffset + Math.round(12 * scale),
                },
              ]}
            >
              {showCapabilities ? (
                <View style={{ marginTop: 28 }}>
                  <View style={styles.genericHero}>
                    <View style={styles.genericIcon}>
                      <DeviceIcon
                        kind={device.kind}
                        size={32}
                        color={stylesVars.ink}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
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
                <>
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

                  <Text style={[styles.moodLabel, { fontSize: moodLabelSize }]}>
                    Mood
                  </Text>
                  <Text style={[styles.moodValue, { fontSize: moodValueSize }]}>
                    {mode[0].toUpperCase() + mode.slice(1)}
                  </Text>

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
                      <Text style={styles.metricValue}>
                        {acTargetHumidity}%
                      </Text>
                      <Text style={styles.metricLabel}>Target humidity</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>{acFilterLife}%</Text>
                      <Text style={styles.metricLabel}>Filter life</Text>
                    </View>
                  </View>

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Airflow</Text>
                    <View style={styles.pressureSliderRow}>
                      <Text style={styles.pressureSliderLabel}>Fan</Text>
                      <Text style={styles.pressureSliderValue}>
                        {acFanSpeed}%
                      </Text>
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
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() =>
                              sendPatch({
                                acSwingMode: option.value as Device["acSwingMode"],
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.chipText,
                                active && styles.chipTextActive,
                              ]}
                            >
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Efficiency</Text>
                    <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                      <Pressable
                        style={[
                          styles.controlPill,
                          acEcoMode && styles.controlPillActive,
                        ]}
                        onPress={() =>
                          sendPatch({ acEcoMode: !acEcoMode, isOn: true })
                        }
                      >
                        <Text
                          style={[
                            styles.controlPillText,
                            acEcoMode && styles.controlPillTextActive,
                          ]}
                        >
                          {acEcoMode ? "Eco" : "Eco Off"}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.controlPill,
                          acTurboMode && styles.controlPillActive,
                        ]}
                        onPress={() =>
                          sendPatch({ acTurboMode: !acTurboMode, isOn: true })
                        }
                      >
                        <Text
                          style={[
                            styles.controlPillText,
                            acTurboMode && styles.controlPillTextActive,
                          ]}
                        >
                          {acTurboMode ? "Turbo" : "Turbo Off"}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.controlPill,
                          acQuietMode && styles.controlPillActive,
                        ]}
                        onPress={() =>
                          sendPatch({ acQuietMode: !acQuietMode, isOn: true })
                        }
                      >
                        <Text
                          style={[
                            styles.controlPillText,
                            acQuietMode && styles.controlPillTextActive,
                          ]}
                        >
                          {acQuietMode ? "Quiet" : "Quiet Off"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Humidity target</Text>
                    <View style={styles.pressureSliderRow}>
                      <Text style={styles.pressureSliderLabel}>Target</Text>
                      <Text style={styles.pressureSliderValue}>
                        {acTargetHumidity}%
                      </Text>
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
              ) : (
                <View style={{ marginTop: 28 }}>
                  {!hasCustom && (
                    <View style={styles.genericHero}>
                      <View style={styles.genericIcon}>
                        <DeviceIcon
                          kind={device.kind}
                          size={32}
                          color={stylesVars.ink}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.heroTitle}>{device.name}</Text>
                        <Text style={styles.heroSub}>
                          {device.isOn ? "Running" : "Off"}
                        </Text>
                      </View>
                    </View>
                  )}

                  {device.kind === "light" && (
                    <View
                      style={[
                        styles.lightLayout,
                        lightLayoutRow && styles.lightLayoutRow,
                        { gap: lightCardGap },
                      ]}
                    >
                      <View style={styles.lightDialColumn}>
                        <View style={lightDialCardStyle}>
                          <RadialDial
                            size={lightDialSize}
                            value={brightness}
                            min={0}
                            max={100}
                            tickValues={[0, 25, 50, 75, 100]}
                            centerContent={
                              <Animated.View
                                style={[
                                  styles.lightCenterOrb,
                                  {
                                    width: lightCenterSize,
                                    height: lightCenterSize,
                                    borderRadius: lightCenterSize / 2,
                                  },
                                  bulbIsLight && styles.lightCenterOrbLight,
                                  { transform: [{ scale: bulbScale }] },
                                ]}
                              >
                                <LinearGradient
                                  colors={bulbGradient}
                                  start={{ x: 0.2, y: 0.1 }}
                                  end={{ x: 0.9, y: 1 }}
                                  style={[
                                    styles.lightCenterInner,
                                    bulbIsLight && styles.lightCenterInnerLight,
                                    {
                                      borderColor: bulbInnerBorder,
                                      borderRadius: lightCenterSize / 2,
                                    },
                                  ]}
                                >
                                  <Ionicons
                                    name="bulb"
                                    size={lightCenterIcon}
                                    color={bulbIconColor}
                                  />
                                  <Text
                                    style={[
                                      styles.lightCenterValue,
                                      {
                                        color: bulbTextColor,
                                        fontSize: lightCenterValueSize,
                                        marginTop: lightCenterValueMargin,
                                      },
                                    ]}
                                  >
                                    {device.brightness ?? 60}%
                                  </Text>
                                  <Text
                                    style={[
                                      styles.lightCenterRoom,
                                      {
                                        color: bulbSubColor,
                                        fontSize: lightCenterRoomSize,
                                        marginTop: lightCenterRoomMargin,
                                      },
                                    ]}
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
                            style={[
                              styles.cardHint,
                              { fontSize: lightSubLabelSize },
                            ]}
                          >
                            Color
                          </Text>
                          <View
                            style={[styles.colorRow, { gap: lightCardGap }]}
                          >
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
                                style={[
                                  styles.swatch,
                                  lightSwatchStyle,
                                  { backgroundColor: c },
                                  device.color === c && styles.swatchActive,
                                ]}
                              />
                            ))}
                          </View>

                          <Text
                            style={[
                              styles.cardHint,
                              { fontSize: lightSubLabelSize },
                            ]}
                          >
                            Scenes
                          </Text>
                          <View
                            style={[styles.sceneRow, { gap: lightCardGap }]}
                          >
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
                                style={[
                                  styles.sceneCardItem,
                                  lightSceneItemStyle,
                                  { minWidth: lightSceneMinWidth },
                                ]}
                                onPress={() => {
                                  animateBulb();
                                  sendPatch({
                                    brightness: scene.brightness,
                                    color: scene.color,
                                    isOn: true,
                                  });
                                }}
                              >
                                <View
                                  style={[
                                    styles.sceneIconWrap,
                                    {
                                      width: lightSceneIconSize + 16,
                                      height: lightSceneIconSize + 16,
                                      borderRadius: Math.round(
                                        (lightSceneIconSize + 16) / 2,
                                      ),
                                    },
                                  ]}
                                >
                                  <Ionicons
                                    name={scene.icon}
                                    size={lightSceneIconSize}
                                    color={stylesVars.ink}
                                  />
                                </View>
                                <Text
                                  style={[
                                    styles.sceneText,
                                    { fontSize: lightSubLabelSize },
                                  ]}
                                >
                                  {scene.label}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      </View>

                      <View style={lightControlsColumnStyle}>
                        {isTablet ? (
                          <>
                            <View style={lightControlCardStyle}>
                              <Text style={styles.cardLabel}>Temperature</Text>
                              <Text
                                style={[
                                  styles.cardHint,
                                  { fontSize: lightSubLabelSize },
                                ]}
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
                                      style={[
                                        styles.chip,
                                        active && styles.chipActive,
                                      ]}
                                      onPress={() =>
                                        sendPatch({
                                          colorTempK: preset.value,
                                          isOn: true,
                                        })
                                      }
                                    >
                                      <Text
                                        style={[
                                          styles.chipText,
                                          active && styles.chipTextActive,
                                        ]}
                                      >
                                        {preset.label}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>

                              <Text
                                style={[
                                  styles.cardHint,
                                  { fontSize: lightSubLabelSize, marginTop: 6 },
                                ]}
                              >
                                Effects
                              </Text>
                              <View style={[styles.chipRow, { marginTop: 6 }]}>
                                {LIGHT_EFFECTS.map((effect) => {
                                  const active = lightEffect === effect.value;
                                  return (
                                    <Pressable
                                      key={effect.value}
                                      style={[
                                        styles.chip,
                                        styles.chipRowItem,
                                        active && styles.chipActive,
                                      ]}
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
                                        style={[
                                          styles.chipText,
                                          active && styles.chipTextActive,
                                        ]}
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
                                  style={[
                                    styles.chip,
                                    adaptiveLighting && styles.chipActive,
                                  ]}
                                  onPress={() =>
                                    sendPatch({
                                      adaptiveLighting: !adaptiveLighting,
                                    })
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.chipText,
                                      adaptiveLighting && styles.chipTextActive,
                                    ]}
                                  >
                                    Adaptive
                                  </Text>
                                </Pressable>
                                <Pressable
                                  style={[
                                    styles.chip,
                                    motionBoost && styles.chipActive,
                                  ]}
                                  onPress={() =>
                                    sendPatch({ motionBoost: !motionBoost })
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.chipText,
                                      motionBoost && styles.chipTextActive,
                                    ]}
                                  >
                                    Motion
                                  </Text>
                                </Pressable>
                                <Pressable
                                  style={[
                                    styles.chip,
                                    nightShift && styles.chipActive,
                                  ]}
                                  onPress={() =>
                                    sendPatch({ nightShift: !nightShift })
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.chipText,
                                      nightShift && styles.chipTextActive,
                                    ]}
                                  >
                                    Night Shift
                                  </Text>
                                </Pressable>
                              </View>

                              <Text
                                style={[
                                  styles.cardHint,
                                  { fontSize: lightSubLabelSize, marginTop: 6 },
                                ]}
                              >
                                Auto-off
                              </Text>
                              <View style={[styles.chipRow, { marginTop: 6 }]}>
                                {LIGHT_AUTO_OFF.map((minutes) => {
                                  const active = autoOffMin === minutes;
                                  return (
                                    <Pressable
                                      key={minutes}
                                      style={[
                                        styles.chip,
                                        active && styles.chipActive,
                                      ]}
                                      onPress={() =>
                                        sendPatch({ autoOffMin: minutes })
                                      }
                                    >
                                      <Text
                                        style={[
                                          styles.chipText,
                                          active && styles.chipTextActive,
                                        ]}
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
                          <View
                            style={[
                              styles.lightControlsGrid,
                              { gap: lightCardGap },
                            ]}
                          >
                            <View
                              style={[
                                lightControlCardStyle,
                                styles.lightControlCompact,
                              ]}
                            >
                              <View style={styles.lightControlHeaderRow}>
                                <Text style={styles.cardLabel}>
                                  Temperature
                                </Text>
                                <Text
                                  style={[
                                    styles.cardHint,
                                    { fontSize: lightSubLabelSize },
                                  ]}
                                >
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
                                      style={[
                                        styles.chip,
                                        active && styles.chipActive,
                                      ]}
                                      onPress={() =>
                                        sendPatch({
                                          colorTempK: preset.value,
                                          isOn: true,
                                        })
                                      }
                                    >
                                      <Text
                                        style={[
                                          styles.chipText,
                                          active && styles.chipTextActive,
                                        ]}
                                      >
                                        {preset.label}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>

                              <Text
                                style={[
                                  styles.cardHint,
                                  { fontSize: lightSubLabelSize, marginTop: 6 },
                                ]}
                              >
                                Effects
                              </Text>
                              <View style={[styles.chipRow, { marginTop: 6 }]}>
                                {LIGHT_EFFECTS.map((effect) => {
                                  const active = lightEffect === effect.value;
                                  return (
                                    <Pressable
                                      key={effect.value}
                                      style={[
                                        styles.chip,
                                        styles.chipRowItem,
                                        active && styles.chipActive,
                                      ]}
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
                                        style={[
                                          styles.chipText,
                                          active && styles.chipTextActive,
                                        ]}
                                      >
                                        {effect.label}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>

                            <View
                              style={[
                                lightControlCardStyle,
                                styles.lightControlCompact,
                              ]}
                            >
                              <Text style={styles.cardLabel}>Automation</Text>
                              <View style={styles.chipRow}>
                                <Pressable
                                  style={[
                                    styles.chip,
                                    adaptiveLighting && styles.chipActive,
                                  ]}
                                  onPress={() =>
                                    sendPatch({
                                      adaptiveLighting: !adaptiveLighting,
                                    })
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.chipText,
                                      adaptiveLighting && styles.chipTextActive,
                                    ]}
                                  >
                                    Adaptive
                                  </Text>
                                </Pressable>
                                <Pressable
                                  style={[
                                    styles.chip,
                                    motionBoost && styles.chipActive,
                                  ]}
                                  onPress={() =>
                                    sendPatch({ motionBoost: !motionBoost })
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.chipText,
                                      motionBoost && styles.chipTextActive,
                                    ]}
                                  >
                                    Motion
                                  </Text>
                                </Pressable>
                                <Pressable
                                  style={[
                                    styles.chip,
                                    nightShift && styles.chipActive,
                                  ]}
                                  onPress={() =>
                                    sendPatch({ nightShift: !nightShift })
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.chipText,
                                      nightShift && styles.chipTextActive,
                                    ]}
                                  >
                                    Night Shift
                                  </Text>
                                </Pressable>
                              </View>

                              <Text
                                style={[
                                  styles.cardHint,
                                  { fontSize: lightSubLabelSize, marginTop: 6 },
                                ]}
                              >
                                Auto-off
                              </Text>
                              <View style={[styles.chipRow, { marginTop: 6 }]}>
                                {LIGHT_AUTO_OFF.map((minutes) => {
                                  const active = autoOffMin === minutes;
                                  return (
                                    <Pressable
                                      key={minutes}
                                      style={[
                                        styles.chip,
                                        active && styles.chipActive,
                                      ]}
                                      onPress={() =>
                                        sendPatch({ autoOffMin: minutes })
                                      }
                                    >
                                      <Text
                                        style={[
                                          styles.chipText,
                                          active && styles.chipTextActive,
                                        ]}
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
                              style={[
                                styles.cardHint,
                                { fontSize: lightSubLabelSize },
                              ]}
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
                                    style={[
                                      styles.chip,
                                      active && styles.chipActive,
                                    ]}
                                    onPress={() =>
                                      sendPatch({
                                        colorTempK: preset.value,
                                        isOn: true,
                                      })
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.chipText,
                                        active && styles.chipTextActive,
                                      ]}
                                    >
                                      {preset.label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>

                            <Text
                              style={[
                                styles.cardHint,
                                { fontSize: lightSubLabelSize, marginTop: 6 },
                              ]}
                            >
                              Effects
                            </Text>
                            <View style={[styles.chipRow, { marginTop: 6 }]}>
                              {LIGHT_EFFECTS.map((effect) => {
                                const active = lightEffect === effect.value;
                                return (
                                  <Pressable
                                    key={effect.value}
                                    style={[
                                      styles.chip,
                                      styles.chipRowItem,
                                      active && styles.chipActive,
                                    ]}
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
                                      style={[
                                        styles.chipText,
                                        active && styles.chipTextActive,
                                      ]}
                                    >
                                      {effect.label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>

                            <Text
                              style={[
                                styles.cardHint,
                                { fontSize: lightSubLabelSize, marginTop: 6 },
                              ]}
                            >
                              Automation
                            </Text>
                            <View style={styles.chipRow}>
                              <Pressable
                                style={[
                                  styles.chip,
                                  adaptiveLighting && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({
                                    adaptiveLighting: !adaptiveLighting,
                                  })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    adaptiveLighting && styles.chipTextActive,
                                  ]}
                                >
                                  Adaptive
                                </Text>
                              </Pressable>
                              <Pressable
                                style={[
                                  styles.chip,
                                  motionBoost && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ motionBoost: !motionBoost })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    motionBoost && styles.chipTextActive,
                                  ]}
                                >
                                  Motion
                                </Text>
                              </Pressable>
                              <Pressable
                                style={[
                                  styles.chip,
                                  nightShift && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ nightShift: !nightShift })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    nightShift && styles.chipTextActive,
                                  ]}
                                >
                                  Night Shift
                                </Text>
                              </Pressable>
                            </View>

                            <Text
                              style={[
                                styles.cardHint,
                                { fontSize: lightSubLabelSize, marginTop: 6 },
                              ]}
                            >
                              Auto-off
                            </Text>
                            <View style={[styles.chipRow, { marginTop: 6 }]}>
                              {LIGHT_AUTO_OFF.map((minutes) => {
                                const active = autoOffMin === minutes;
                                return (
                                  <Pressable
                                    key={minutes}
                                    style={[
                                      styles.chip,
                                      active && styles.chipActive,
                                    ]}
                                    onPress={() =>
                                      sendPatch({ autoOffMin: minutes })
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.chipText,
                                        active && styles.chipTextActive,
                                      ]}
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

                  {device.kind === "garage" && (
                    <>
                      {renderOpenDeviceLottie(
                        GARAGE_LOTTIE_SOURCE,
                        compactDialSize,
                      )}
                      <Text style={styles.garageStatusText}>
                        {openStatusText}
                      </Text>

                      <View style={styles.actionRow}>
                        <Pressable
                          style={[
                            styles.modeTile,
                            isOpen && styles.modeTileActive,
                          ]}
                          onPress={() => setOpenTarget(100)}
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
                                name="arrow-up"
                                size={18}
                                color="#FFFFFF"
                              />
                            </LinearGradient>
                          ) : (
                            <View style={styles.modeIconBubble}>
                              <Ionicons
                                name="arrow-up"
                                size={18}
                                color="rgba(12,12,18,0.65)"
                              />
                            </View>
                          )}
                          <Text
                            style={[
                              styles.modeText,
                              device.isOn && styles.modeTextActive,
                            ]}
                          >
                            Open
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.modeTile,
                            isClosed && styles.modeTileActive,
                          ]}
                          onPress={() => setOpenTarget(0)}
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
                                name="arrow-down"
                                size={18}
                                color="#FFFFFF"
                              />
                            </LinearGradient>
                          ) : (
                            <View style={styles.modeIconBubble}>
                              <Ionicons
                                name="arrow-down"
                                size={18}
                                color="rgba(12,12,18,0.65)"
                              />
                            </View>
                          )}
                          <Text
                            style={[
                              styles.modeText,
                              isClosed && styles.modeTextActive,
                            ]}
                          >
                            Close
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  )}

                  {device.kind === "door" && (
                    <>
                      <View style={styles.doorWrap}>
                        {renderOpenDeviceLottie(
                          DOOR_LOTTIE_SOURCE,
                          compactDialSize,
                        )}
                        <Text style={styles.doorTitle}>{device.name}</Text>
                        <Text style={styles.doorStatus}>{openStatusText}</Text>
                      </View>

                      <View style={styles.actionRow}>
                        <Pressable
                          style={[
                            styles.modeTile,
                            isOpen && styles.modeTileActive,
                          ]}
                          onPress={() => setOpenTarget(100)}
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
                            style={[
                              styles.modeText,
                              device.isOn && styles.modeTextActive,
                            ]}
                          >
                            Open
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.modeTile,
                            isClosed && styles.modeTileActive,
                          ]}
                          onPress={() => setOpenTarget(0)}
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
                            style={[
                              styles.modeText,
                              isClosed && styles.modeTextActive,
                            ]}
                          >
                            Close
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  )}

                  {device.kind === "gate" && (
                    <>
                      <View style={styles.doorWrap}>
                        {renderOpenDeviceLottie(
                          GATE_LOTTIE_SOURCE,
                          compactDialSize,
                        )}
                        <Text style={styles.doorTitle}>Front Gate</Text>
                        <Text style={styles.doorStatus}>{openStatusText}</Text>
                      </View>

                      <View style={styles.actionRow}>
                        <Pressable
                          style={[
                            styles.modeTile,
                            isOpen && styles.modeTileActive,
                          ]}
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
                            style={[
                              styles.modeText,
                              isOpen && styles.modeTextActive,
                            ]}
                          >
                            Open
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.modeTile,
                            isClosed && styles.modeTileActive,
                          ]}
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
                            style={[
                              styles.modeText,
                              isClosed && styles.modeTextActive,
                            ]}
                          >
                            Close
                          </Text>
                        </Pressable>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Auto-open</Text>
                        <Text style={styles.cardHint}>
                          Use recognition + proximity to unlock for known faces.
                        </Text>
                        <View style={styles.chipRow}>
                          <Pressable
                            style={[
                              styles.chip,
                              gateAutoOpen && styles.chipActive,
                            ]}
                            onPress={() =>
                              sendPatch({ autoOpenEnabled: !gateAutoOpen })
                            }
                          >
                            <Text
                              style={[
                                styles.chipText,
                                gateAutoOpen && styles.chipTextActive,
                              ]}
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
                          <View style={{ marginBottom: 6 }}>
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ tempC: preset.value, isOn: true })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({
                                    fridgeMode:
                                      option.value as Device["fridgeMode"],
                                    isOn: true,
                                  })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                        <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              fridgeQuickCool && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                fridgeQuickCool: !fridgeQuickCool,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                fridgeQuickCool &&
                                  styles.controlPillTextActive,
                              ]}
                            >
                              {fridgeQuickCool ? "Quick cool" : "Cool Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.controlPill,
                              fridgeQuickFreeze && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                fridgeQuickFreeze: !fridgeQuickFreeze,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                fridgeQuickFreeze &&
                                  styles.controlPillTextActive,
                              ]}
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
                        <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              fridgeIceMaker && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                fridgeIceMaker: !fridgeIceMaker,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                fridgeIceMaker &&
                                  styles.controlPillTextActive,
                              ]}
                            >
                              {fridgeIceMaker ? "Ice maker" : "Ice Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.controlPill,
                              fridgeDoorAlarm && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                fridgeDoorAlarm: !fridgeDoorAlarm,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                fridgeDoorAlarm &&
                                  styles.controlPillTextActive,
                              ]}
                            >
                              {fridgeDoorAlarm ? "Door alarm" : "Alarm Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.controlPill,
                              fridgeEnergySaver && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                fridgeEnergySaver: !fridgeEnergySaver,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                fridgeEnergySaver &&
                                  styles.controlPillTextActive,
                              ]}
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ fridgeHumidity: value })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                          <View style={{ marginBottom: 6 }}>
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ speed: preset.value, isOn: true })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                        <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              fanOscillation && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                fanOscillation: !fanOscillation,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                fanOscillation && styles.controlPillTextActive,
                              ]}
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({
                                    fanDirection:
                                      option.value as Device["fanDirection"],
                                    isOn: true,
                                  })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ fanTimerMin: value, isOn: true })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
                                >
                                  {value === 0 ? "Off" : `${value}m`}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              fanLightOn && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                fanLightOn: !fanLightOn,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                fanLightOn && styles.controlPillTextActive,
                              ]}
                            >
                              {fanLightOn ? "Light on" : "Light off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.controlPill,
                              fanAutoMode && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                fanAutoMode: !fanAutoMode,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                fanAutoMode && styles.controlPillTextActive,
                              ]}
                            >
                              {fanAutoMode ? "Auto" : "Auto off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.controlPill,
                              fanSleepMode && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                fanSleepMode: !fanSleepMode,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                fanSleepMode && styles.controlPillTextActive,
                              ]}
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
                      <RadialDial
                        size={windowDialSize}
                        value={openDisplayValue}
                        min={0}
                        max={100}
                        tickValues={[0, 25, 50, 75, 100]}
                        centerContent={
                          <View
                            style={[
                              styles.windowCenter,
                              {
                                width: windowCenterSize,
                                height: windowCenterSize,
                                borderRadius: windowCenterRadius,
                              },
                            ]}
                          >
                            <AnimatedLottieView
                              source={WINDOW_LOTTIE_SOURCE}
                              progress={openProgress}
                              autoPlay={false}
                              loop={false}
                              resizeMode="contain"
                              pointerEvents="none"
                              style={styles.windowCenterLottie}
                            />
                            <View style={styles.windowCenterOverlay}>
                              <Text
                                style={[
                                  styles.windowCenterValue,
                                  { fontSize: windowCenterValueSize },
                                ]}
                              >
                                {openDisplayValue}%
                              </Text>
                              <Text
                                style={[
                                  styles.windowCenterLabel,
                                  { fontSize: windowCenterLabelSize },
                                ]}
                              >
                                {openStatusLabel}
                              </Text>
                            </View>
                          </View>
                        }
                        formatTick={(v) => `${v}`}
                        formatValue={(v) => `${v}%`}
                        formatCenterValue={(v) => `${v}%`}
                        dimmed={!isOpen}
                        onChange={(v) =>
                          sendPatch({
                            openPercent: clamp(v, 0, 100),
                            isOn: v > 0,
                          })
                        }
                      />

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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({
                                    openPercent: preset.value,
                                    isOn: preset.value > 0,
                                  })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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

                  {device.kind === "vacuum" && (
                    <>
                      <View style={styles.infoOrb}>
                        <LinearGradient
                          colors={["#D6D1FF", "#8B5CFF"]}
                          start={{ x: 0.2, y: 0.1 }}
                          end={{ x: 0.9, y: 1 }}
                          style={styles.infoOrbInner}
                        >
                          <DeviceIcon kind="vacuum" size={32} color="#fff" />
                          <Text style={styles.infoValue}>
                            {vacuumStatus.toUpperCase()}
                          </Text>
                          <Text style={styles.infoSub}>
                            Battery {vacuumBattery}%
                          </Text>
                        </LinearGradient>
                      </View>

                      <View style={styles.actionRow}>
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
                              style={[
                                styles.modeTile,
                                active && styles.modeTileActive,
                              ]}
                              onPress={() =>
                                sendPatch({
                                  status: action.status,
                                  isOn: action.on,
                                })
                              }
                            >
                              {active ? (
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
                              <Text
                                style={[
                                  styles.modeText,
                                  active && styles.modeTextActive,
                                ]}
                              >
                                {action.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      <View style={styles.metricRow}>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {vacuumAreaM2} m2
                          </Text>
                          <Text style={styles.metricLabel}>Area</Text>
                        </View>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {vacuumRuntimeMin} min
                          </Text>
                          <Text style={styles.metricLabel}>Runtime</Text>
                        </View>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {vacuumFilterLife}%
                          </Text>
                          <Text style={styles.metricLabel}>Filter</Text>
                        </View>
                      </View>

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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({
                                    vacuumMode:
                                      option.value as Device["vacuumMode"],
                                    isOn: true,
                                  })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
                                >
                                  {option.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <View style={styles.pressureSliderRow}>
                          <Text style={styles.pressureSliderLabel}>
                            Suction
                          </Text>
                          <Text style={styles.pressureSliderValue}>
                            {vacuumSuction}%
                          </Text>
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
                        <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              vacuumMop && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({ vacuumMop: !vacuumMop, isOn: true })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                vacuumMop && styles.controlPillTextActive,
                              ]}
                            >
                              {vacuumMop ? "Mop on" : "Mop off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.controlPill,
                              vacuumQuietMode && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                vacuumQuietMode: !vacuumQuietMode,
                                isOn: true,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                vacuumQuietMode &&
                                  styles.controlPillTextActive,
                              ]}
                            >
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
                            <Ionicons
                              name="warning"
                              size={14}
                              color="#D8465B"
                            />
                            <Text style={styles.alertText}>
                              Service the bin/brush
                            </Text>
                          </View>
                        )}
                      </View>
                    </>
                  )}

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
                          style={[
                            styles.modeTile,
                            device.armed && styles.modeTileActive,
                          ]}
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
                            style={[
                              styles.modeText,
                              device.armed && styles.modeTextActive,
                            ]}
                          >
                            {device.armed ? "Armed" : "Arm"}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.modeTile,
                            device.recording && styles.modeTileActive,
                          ]}
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
                            style={[
                              styles.modeText,
                              device.recording && styles.modeTextActive,
                            ]}
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
                            <Text
                              style={[
                                styles.cameraDetectText,
                                { color: "#C4384C" },
                              ]}
                            >
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
                            <View style={{ flex: 1 }}>
                              <Text style={styles.cameraMemberName}>
                                {member.name}
                              </Text>
                              <Text style={styles.cameraMemberRole}>
                                {member.role}
                              </Text>
                            </View>
                            <Pressable
                              style={[
                                styles.cameraPresencePill,
                                member.status === "home"
                                  ? styles.cameraPresenceHome
                                  : styles.cameraPresenceAway,
                              ]}
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
                              style={[
                                styles.chip,
                                gateAutoOpen && styles.chipActive,
                              ]}
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
                                style={[
                                  styles.chipText,
                                  gateAutoOpen && styles.chipTextActive,
                                ]}
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
                                style={[
                                  styles.cameraEventDot,
                                  evt.kind === "known"
                                    ? styles.cameraEventDotKnown
                                    : styles.cameraEventDotUnknown,
                                ]}
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
                        <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              nightVision && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({ nightVision: !nightVision })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                nightVision && styles.controlPillTextActive,
                              ]}
                            >
                              {nightVision ? "Night On" : "Night Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.controlPill,
                              motionAlerts && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({ motionAlerts: !motionAlerts })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                motionAlerts && styles.controlPillTextActive,
                              ]}
                            >
                              {motionAlerts ? "Alerts On" : "Alerts Off"}
                            </Text>
                          </Pressable>
                        </View>
                        <View style={controlCardRowStyle}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              micMuted && styles.controlPillActive,
                            ]}
                            onPress={() => sendPatch({ micMuted: !micMuted })}
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                micMuted && styles.controlPillTextActive,
                              ]}
                            >
                              {micMuted ? "Mic Muted" : "Mic Live"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.controlPill,
                              twoWayAudio && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({ twoWayAudio: !twoWayAudio })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                twoWayAudio && styles.controlPillTextActive,
                              ]}
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ motionSensitivity: preset.value })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                            <View style={{ marginBottom: 6 }}>
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({
                                    burnerLevel: preset.value,
                                    isOn: preset.value > 0,
                                  })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                          {[
                            { label: "Simmer", value: "simmer" },
                            { label: "Boil", value: "boil" },
                            { label: "Sear", value: "sear" },
                            { label: "Keep Warm", value: "keep-warm" },
                          ].map((preset) => {
                            const active = stoveMode === preset.value;
                            return (
                              <Pressable
                                key={preset.value}
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ stoveMode: preset.value })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ stoveTimerMin: value })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                        <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              stoveLock && styles.controlPillActive,
                            ]}
                            onPress={() => sendPatch({ stoveLock: !stoveLock })}
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                stoveLock && styles.controlPillTextActive,
                              ]}
                            >
                              {stoveLock ? "Child Lock" : "Lock Off"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </>
                  )}

                  {(device.kind === "washer" || device.kind === "dryer") && (
                    <>
                      <RadialDial
                        size={laundryDialSize}
                        value={washerProgress}
                        min={0}
                        max={100}
                        tickValues={[0, 25, 50, 75, 100]}
                        centerContent={
                          <View
                            style={[
                              styles.laundryCenter,
                              {
                                width: laundryCenterSize,
                                height: laundryCenterSize,
                                borderRadius: laundryCenterRadius,
                              },
                            ]}
                          >
                            <LottieView
                              source={WASHER_LOTTIE_SOURCE}
                              autoPlay
                              loop
                              resizeMode="contain"
                              pointerEvents="none"
                              style={styles.laundryCenterLottie}
                            />
                            <View style={styles.laundryCenterOverlay}>
                              <Text
                                style={[
                                  styles.laundryCenterValue,
                                  { fontSize: laundryCenterValueSize },
                                ]}
                              >
                                {washerProgress}%
                              </Text>
                              <Text
                                style={[
                                  styles.laundryCenterLabel,
                                  { fontSize: laundryCenterLabelSize },
                                ]}
                              >
                                {(device.cycle ?? "Cycle") +
                                  (device.kind === "dryer"
                                    ? " • Drying"
                                    : " • Washing")}
                              </Text>
                            </View>
                          </View>
                        }
                        formatTick={(v) => `${v}`}
                        formatValue={(v) => `${v}%`}
                        formatCenterValue={(v) => `${v}%`}
                        dimmed={!device.isOn}
                        onChange={(v) =>
                          sendPatch({
                            progress: clamp(v, 0, 100),
                            isOn: v > 0,
                          })
                        }
                      />

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Cycle</Text>
                        <View style={styles.chipRow}>
                          {laundryCycles.map((label) => {
                            const active = (device.cycle ?? "Normal") === label;
                            return (
                              <Pressable
                                key={label}
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() => sendPatch({ cycle: label })}
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
                                >
                                  {label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      {device.kind === "washer" && (
                        <>
                          <View style={controlCardStyle}>
                            <Text style={styles.cardLabel}>Temperature</Text>
                            <View style={styles.chipRow}>
                              {["Cold", "Warm", "Hot"].map((label) => {
                                const active = washTemp === label;
                                return (
                                  <Pressable
                                    key={label}
                                    style={[
                                      styles.chip,
                                      active && styles.chipActive,
                                    ]}
                                    onPress={() =>
                                      sendPatch({ washTemp: label })
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.chipText,
                                        active && styles.chipTextActive,
                                      ]}
                                    >
                                      {label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>

                          <View style={controlCardStyle}>
                            <Text style={styles.cardLabel}>Spin speed</Text>
                            <View style={styles.chipRow}>
                              {[800, 1000, 1200].map((value) => {
                                const active = spinSpeed === value;
                                return (
                                  <Pressable
                                    key={value}
                                    style={[
                                      styles.chip,
                                      active && styles.chipActive,
                                    ]}
                                    onPress={() =>
                                      sendPatch({ spinSpeedRpm: value })
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.chipText,
                                        active && styles.chipTextActive,
                                      ]}
                                    >
                                      {value} rpm
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>

                          <View style={controlCardStyle}>
                            <Text style={styles.cardLabel}>Soil level</Text>
                            <View style={styles.chipRow}>
                              {["Light", "Normal", "Heavy"].map((label) => {
                                const active = soilLevel === label;
                                return (
                                  <Pressable
                                    key={label}
                                    style={[
                                      styles.chip,
                                      active && styles.chipActive,
                                    ]}
                                    onPress={() =>
                                      sendPatch({ soilLevel: label })
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.chipText,
                                        active && styles.chipTextActive,
                                      ]}
                                    >
                                      {label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>

                          <View style={controlCardStyle}>
                            <Text style={styles.cardLabel}>Load size</Text>
                            <View style={styles.chipRow}>
                              {["Small", "Medium", "Large"].map((label) => {
                                const active = loadSize === label;
                                return (
                                  <Pressable
                                    key={label}
                                    style={[
                                      styles.chip,
                                      active && styles.chipActive,
                                    ]}
                                    onPress={() =>
                                      sendPatch({
                                        loadSize:
                                          label as Device["loadSize"],
                                      })
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.chipText,
                                        active && styles.chipTextActive,
                                      ]}
                                    >
                                      {label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>

                          <View style={controlCardStyle}>
                            <Text style={styles.cardLabel}>Rinse</Text>
                            <View style={styles.chipRow}>
                              {[1, 2, 3].map((value) => {
                                const active = rinseCount === value;
                                return (
                                  <Pressable
                                    key={value}
                                    style={[
                                      styles.chip,
                                      active && styles.chipActive,
                                    ]}
                                    onPress={() =>
                                      sendPatch({
                                        rinseCount: value as Device["rinseCount"],
                                      })
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.chipText,
                                        active && styles.chipTextActive,
                                      ]}
                                    >
                                      {value}x
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>

                          <View style={controlCardStyle}>
                            <Text style={styles.cardLabel}>Enhancements</Text>
                            <View style={controlCardRowStyle}>
                              <Pressable
                                style={[
                                  styles.controlPill,
                                  prewash && styles.controlPillActive,
                                ]}
                                onPress={() => sendPatch({ prewash: !prewash })}
                              >
                                <Text
                                  style={[
                                    styles.controlPillText,
                                    prewash && styles.controlPillTextActive,
                                  ]}
                                >
                                  Prewash
                                </Text>
                              </Pressable>
                              <Pressable
                                style={[
                                  styles.controlPill,
                                  steamWash && styles.controlPillActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ steamWash: !steamWash })
                                }
                              >
                                <Text
                                  style={[
                                    styles.controlPillText,
                                    steamWash && styles.controlPillTextActive,
                                  ]}
                                >
                                  Steam
                                </Text>
                              </Pressable>
                            </View>
                            <View style={controlCardRowStyle}>
                              <Pressable
                                style={[
                                  styles.controlPill,
                                  sanitizeWash && styles.controlPillActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ sanitizeWash: !sanitizeWash })
                                }
                              >
                                <Text
                                  style={[
                                    styles.controlPillText,
                                    sanitizeWash && styles.controlPillTextActive,
                                  ]}
                                >
                                  Sanitize
                                </Text>
                              </Pressable>
                              <Pressable
                                style={[
                                  styles.controlPill,
                                  extraSpin && styles.controlPillActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ extraSpin: !extraSpin })
                                }
                              >
                                <Text
                                  style={[
                                    styles.controlPillText,
                                    extraSpin && styles.controlPillTextActive,
                                  ]}
                                >
                                  Extra Spin
                                </Text>
                              </Pressable>
                            </View>
                            <View style={controlCardRowStyle}>
                              <Pressable
                                style={[
                                  styles.controlPill,
                                  smartDispense && styles.controlPillActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ smartDispense: !smartDispense })
                                }
                              >
                                <Text
                                  style={[
                                    styles.controlPillText,
                                    smartDispense && styles.controlPillTextActive,
                                  ]}
                                >
                                  Smart Dose
                                </Text>
                              </Pressable>
                              <Pressable
                                style={[
                                  styles.controlPill,
                                  ecoWash && styles.controlPillActive,
                                ]}
                                onPress={() => sendPatch({ ecoWash: !ecoWash })}
                              >
                                <Text
                                  style={[
                                    styles.controlPillText,
                                    ecoWash && styles.controlPillTextActive,
                                  ]}
                                >
                                  Eco Boost
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        </>
                      )}

                      {device.kind === "dryer" && (
                        <>
                          <View style={controlCardStyle}>
                            <Text style={styles.cardLabel}>Heat</Text>
                            <View style={styles.chipRow}>
                              {["Low", "Med", "High"].map((label) => {
                                const active = heatLevel === label;
                                return (
                                  <Pressable
                                    key={label}
                                    style={[
                                      styles.chip,
                                      active && styles.chipActive,
                                    ]}
                                    onPress={() =>
                                      sendPatch({ heatLevel: label })
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.chipText,
                                        active && styles.chipTextActive,
                                      ]}
                                    >
                                      {label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>

                          <View style={controlCardStyle}>
                            <Text style={styles.cardLabel}>Dryness</Text>
                            <View style={styles.chipRow}>
                              {["Damp", "Dry", "Extra"].map((label) => {
                                const active = drynessLevel === label;
                                return (
                                  <Pressable
                                    key={label}
                                    style={[
                                      styles.chip,
                                      active && styles.chipActive,
                                    ]}
                                    onPress={() =>
                                      sendPatch({ drynessLevel: label })
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.chipText,
                                        active && styles.chipTextActive,
                                      ]}
                                    >
                                      {label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>

                          <View style={controlCardStyle}>
                            <Text style={styles.cardLabel}>Dryer options</Text>
                            <View style={controlCardRowStyle}>
                              <Pressable
                                style={[
                                  styles.controlPill,
                                  sensorDry && styles.controlPillActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ sensorDry: !sensorDry })
                                }
                              >
                                <Text
                                  style={[
                                    styles.controlPillText,
                                    sensorDry && styles.controlPillTextActive,
                                  ]}
                                >
                                  Sensor Dry
                                </Text>
                              </Pressable>
                              <Pressable
                                style={[
                                  styles.controlPill,
                                  wrinkleGuard && styles.controlPillActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ wrinkleGuard: !wrinkleGuard })
                                }
                              >
                                <Text
                                  style={[
                                    styles.controlPillText,
                                    wrinkleGuard && styles.controlPillTextActive,
                                  ]}
                                >
                                  Wrinkle Guard
                                </Text>
                              </Pressable>
                            </View>
                            <View style={controlCardRowStyle}>
                              <Pressable
                                style={[
                                  styles.controlPill,
                                  steamRefresh && styles.controlPillActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ steamRefresh: !steamRefresh })
                                }
                              >
                                <Text
                                  style={[
                                    styles.controlPillText,
                                    steamRefresh && styles.controlPillTextActive,
                                  ]}
                                >
                                  Steam Refresh
                                </Text>
                              </Pressable>
                              <Pressable
                                style={[
                                  styles.controlPill,
                                  ecoDry && styles.controlPillActive,
                                ]}
                                onPress={() => sendPatch({ ecoDry: !ecoDry })}
                              >
                                <Text
                                  style={[
                                    styles.controlPillText,
                                    ecoDry && styles.controlPillTextActive,
                                  ]}
                                >
                                  Eco Dry
                                </Text>
                              </Pressable>
                            </View>
                            <View style={controlCardRowStyle}>
                              <Pressable
                                style={[
                                  styles.controlPill,
                                  airFluff && styles.controlPillActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ airFluff: !airFluff })
                                }
                              >
                                <Text
                                  style={[
                                    styles.controlPillText,
                                    airFluff && styles.controlPillTextActive,
                                  ]}
                                >
                                  Air Fluff
                                </Text>
                              </Pressable>
                              <Pressable
                                style={[
                                  styles.controlPill,
                                  coolDown && styles.controlPillActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ coolDown: !coolDown })
                                }
                              >
                                <Text
                                  style={[
                                    styles.controlPillText,
                                    coolDown && styles.controlPillTextActive,
                                  ]}
                                >
                                  Cool Down
                                </Text>
                              </Pressable>
                            </View>
                          </View>

                          <View style={controlCardStyle}>
                            <Text style={styles.cardLabel}>Maintenance</Text>
                            <View style={controlCardRowStyle}>
                              <Pressable
                                style={[
                                  styles.controlPill,
                                  lintFilterOk && styles.controlPillActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ lintFilterOk: !lintFilterOk })
                                }
                              >
                                <Text
                                  style={[
                                    styles.controlPillText,
                                    lintFilterOk &&
                                      styles.controlPillTextActive,
                                  ]}
                                >
                                  {lintFilterOk ? "Filter OK" : "Clean Filter"}
                                </Text>
                              </Pressable>
                              <Pressable
                                style={[
                                  styles.controlPill,
                                  antiStatic && styles.controlPillActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ antiStatic: !antiStatic })
                                }
                              >
                                <Text
                                  style={[
                                    styles.controlPillText,
                                    antiStatic &&
                                      styles.controlPillTextActive,
                                  ]}
                                >
                                  Anti-Static
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        </>
                      )}

                      <View style={controlCardStyle}>
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
                                const next = Math.max(
                                  0,
                                  remainingMin + preset.value,
                                );
                                sendPatch({ remainingMin: next });
                              }}
                            >
                              <Text style={styles.chipText}>
                                {preset.label} min
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                        <Text style={styles.budgetHint}>
                          {remainingMin ? `${remainingMin} min left` : "Idle"}
                        </Text>
                      </View>

                      <View style={styles.actionRow}>
                        <Pressable
                          style={[
                            styles.modeTile,
                            device.isOn && styles.modeTileActive,
                          ]}
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
                            style={[
                              styles.modeText,
                              device.isOn && styles.modeTextActive,
                            ]}
                          >
                            Start
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.modeTile,
                            !device.isOn && styles.modeTileActive,
                          ]}
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
                              <Ionicons
                                name="pause"
                                size={18}
                                color="#FFFFFF"
                              />
                            </LinearGradient>
                          ) : (
                            <View style={styles.modeIconBubble}>
                              <Ionicons
                                name="pause"
                                size={18}
                                color="rgba(12,12,18,0.65)"
                              />
                            </View>
                          )}
                          <Text
                            style={[
                              styles.modeText,
                              !device.isOn && styles.modeTextActive,
                            ]}
                          >
                            Pause
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  )}

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
                          <View style={{ marginBottom: 6 }}>
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
                          {["Reheat", "Defrost", "Grill", "Popcorn"].map(
                            (label) => {
                              const active = microwaveMode === label;
                              return (
                                <Pressable
                                  key={label}
                                  style={[
                                    styles.chip,
                                    active && styles.chipActive,
                                  ]}
                                  onPress={() =>
                                    sendPatch({ microwaveMode: label })
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.chipText,
                                      active && styles.chipTextActive,
                                    ]}
                                  >
                                    {label}
                                  </Text>
                                </Pressable>
                              );
                            },
                          )}
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ microwavePower: preset.value })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                          style={[
                            styles.modeTile,
                            device.isOn && styles.modeTileActive,
                          ]}
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
                            style={[
                              styles.modeText,
                              device.isOn && styles.modeTextActive,
                            ]}
                          >
                            Start
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.modeTile,
                            !device.isOn && styles.modeTileActive,
                          ]}
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
                            style={[
                              styles.modeText,
                              !device.isOn && styles.modeTextActive,
                            ]}
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
                      <View style={styles.infoOrb}>
                        <LinearGradient
                          colors={["#CDE7FF", "#8B5CFF"]}
                          start={{ x: 0.2, y: 0.1 }}
                          end={{ x: 0.9, y: 1 }}
                          style={styles.infoOrbInner}
                        >
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
                          <View style={styles.energyOrbContent}>
                            <Ionicons
                              name="stats-chart"
                              size={32}
                              color="#fff"
                            />
                            <Text style={styles.infoValue}>{energyPower}W</Text>
                            <Text style={styles.infoSub}>
                              {energyToday} kWh today
                            </Text>
                          </View>
                        </LinearGradient>
                      </View>

                      <View style={styles.metricRow}>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>{energyPower}W</Text>
                          <Text style={styles.metricLabel}>Now</Text>
                        </View>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {energyToday} kWh
                          </Text>
                          <Text style={styles.metricLabel}>Today</Text>
                        </View>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>{energyPeak}W</Text>
                          <Text style={styles.metricLabel}>Peak</Text>
                        </View>
                      </View>

                      <View style={styles.metricRow}>
                        <View
                          style={[
                            styles.metricCard,
                            solarW > 0 && styles.metricCardSolar,
                          ]}
                        >
                          <Text style={styles.metricValue}>{solarW}W</Text>
                          <Text style={styles.metricLabel}>Solar now</Text>
                        </View>
                        <View
                          style={[
                            styles.metricCard,
                            solarToday > 0 && styles.metricCardSolar,
                          ]}
                        >
                          <Text style={styles.metricValue}>
                            {solarToday} kWh
                          </Text>
                          <Text style={styles.metricLabel}>Solar today</Text>
                        </View>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {gridToday} kWh
                          </Text>
                          <Text style={styles.metricLabel}>Grid</Text>
                        </View>
                      </View>
                      <Text style={styles.solarHint}>
                        {solarW > 0 || solarToday > 0
                          ? "Solar feeding the home"
                          : "Solar inactive"}
                      </Text>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Main power</Text>
                        <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              gridAvailable && styles.controlPillActive,
                            ]}
                            onPress={() => sendPatch({ gridAvailable: true })}
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                gridAvailable && styles.controlPillTextActive,
                              ]}
                            >
                              Online
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.controlPill,
                              !gridAvailable && styles.controlPillActive,
                            ]}
                            onPress={() => sendPatch({ gridAvailable: false })}
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                !gridAvailable && styles.controlPillTextActive,
                              ]}
                            >
                              Outage
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.controlPill,
                              gridOutageAlerts && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                gridOutageAlerts: !gridOutageAlerts,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                gridOutageAlerts &&
                                  styles.controlPillTextActive,
                              ]}
                            >
                              {gridOutageAlerts ? "Alerts On" : "Alerts Off"}
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

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Monthly budget</Text>
                        <View style={styles.chipRow}>
                          {[80, 120, 160].map((value) => {
                            const active = energyBudget === value;
                            return (
                              <Pressable
                                key={value}
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ energyBudgetKwh: value })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
                                >
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
                    </>
                  )}

                  {device.kind === "water" && (
                    <>
                      <View
                        style={[
                          styles.waterOrb,
                          {
                            width: compactDialSize,
                            height: compactDialSize,
                            borderRadius: Math.round(compactDialSize / 2),
                          },
                        ]}
                      >
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ waterBudgetL: value })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                        <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              waterLeakAlerts && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({ waterLeakAlerts: !waterLeakAlerts })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                waterLeakAlerts && styles.controlPillTextActive,
                              ]}
                            >
                              {waterLeakAlerts ? "Leak Alerts" : "Alerts Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.controlPill,
                              waterAutoShutoff && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({ waterAutoShutoff: !waterAutoShutoff })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                waterAutoShutoff &&
                                  styles.controlPillTextActive,
                              ]}
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
                        <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              waterPressureAlerts && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                waterPressureAlerts: !waterPressureAlerts,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                waterPressureAlerts &&
                                  styles.controlPillTextActive,
                              ]}
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
                          <View style={{ marginBottom: 6 }}>
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ waterHeaterType: option.value })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ heaterMode: option.value })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                        <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              heaterScheduleEnabled &&
                                styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                heaterScheduleEnabled: !heaterScheduleEnabled,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                heaterScheduleEnabled &&
                                  styles.controlPillTextActive,
                              ]}
                            >
                              {heaterScheduleEnabled
                                ? "Schedule"
                                : "Schedule Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.controlPill,
                              heaterSanitize && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({ antiLegionella: !heaterSanitize })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                heaterSanitize && styles.controlPillTextActive,
                              ]}
                            >
                              {heaterSanitize ? "Sanitize" : "Sanitize Off"}
                            </Text>
                          </Pressable>
                        </View>
                        {showRecirculation && (
                          <View
                            style={[controlCardRowStyle, { marginTop: 10 }]}
                          >
                            <Pressable
                              style={[
                                styles.controlPill,
                                heaterRecirculation &&
                                  styles.controlPillActive,
                              ]}
                              onPress={() =>
                                sendPatch({
                                  recirculation: !heaterRecirculation,
                                })
                              }
                            >
                              <Text
                                style={[
                                  styles.controlPillText,
                                  heaterRecirculation &&
                                    styles.controlPillTextActive,
                                ]}
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ vacationDays: value })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                      <View
                        style={[
                          styles.infoOrb,
                          {
                            width: airOrbSize,
                            height: airOrbSize,
                            borderRadius: Math.round(airOrbSize / 2),
                          },
                        ]}
                      >
                        <LinearGradient
                          colors={airBand.gradient}
                          start={{ x: 0.2, y: 0.1 }}
                          end={{ x: 0.9, y: 1 }}
                          style={styles.infoOrbInner}
                        >
                          <Ionicons name="leaf" size={30} color="#fff" />
                          <Text style={styles.infoValue}>
                            AQI {airQuality > 0 ? airQuality : "--"}
                          </Text>
                          <Text style={styles.infoSub}>
                            {airBand.label} • Humidity{" "}
                            {formatMetric(humidity, "%")}
                          </Text>
                          <Text style={styles.infoSub}>
                            CO2 {formatMetric(airCo2, "ppm")} • PM2.5{" "}
                            {formatMetric(airPm25, "ug/m3")}
                          </Text>
                          <Text style={styles.infoSub}>
                            {airConfidence}% confidence
                            {airLastUpdatedAt
                              ? ` • ${formatTimeAgo(airLastUpdatedAt)}`
                              : ""}
                          </Text>
                        </LinearGradient>
                      </View>

                      <View style={[controlCardStyle, styles.airTrendCard]}>
                        <View style={styles.airTrendHeader}>
                          <Text style={styles.cardLabel}>24h trend</Text>
                          <View style={styles.airTrendPill}>
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
                                style={[
                                  styles.airChartBar,
                                  {
                                    height,
                                    backgroundColor: band.color,
                                    opacity:
                                      index === airSeriesAqi.length - 1 ? 1 : 0.6,
                                  },
                                ]}
                              />
                            );
                          })}
                        </View>
                        <View style={styles.airLegendRow}>
                          {AIR_QUALITY_BANDS.slice(0, 3).map((band) => (
                            <View
                              key={`air-legend-${band.label}`}
                              style={styles.airLegendItem}
                            >
                              <View
                                style={[
                                  styles.airLegendDot,
                                  { backgroundColor: band.color },
                                ]}
                              />
                              <Text style={styles.airLegendText}>
                                {band.label}
                              </Text>
                            </View>
                          ))}
                        </View>
                        <Text style={styles.budgetHint}>
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
                            style={[
                              styles.airMetricCard,
                              { width: airMetricWidth },
                            ]}
                          >
                            <Text style={styles.metricValue}>
                              {metric.value}
                            </Text>
                            <Text style={styles.metricLabel}>
                              {metric.label}
                            </Text>
                          </View>
                        ))}
                      </View>

                      <View style={styles.metricRow}>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {airFilterLife}%
                          </Text>
                          <Text style={styles.metricLabel}>Filter life</Text>
                        </View>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {airFilterDaysLeft} days
                          </Text>
                          <Text style={styles.metricLabel}>Replace in</Text>
                        </View>
                      </View>

                      {airFilterLife <= 20 && (
                        <View style={styles.alertRow}>
                          <Ionicons name="warning" size={14} color="#D8465B" />
                          <Text style={styles.alertText}>
                            Replace filter soon
                          </Text>
                        </View>
                      )}

                      <View style={controlCardStyle}>
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({
                                    airPurifierMode: mode as Device["airPurifierMode"],
                                    isOn: true,
                                  })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                        <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              airIonizerEnabled && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                airIonizerEnabled: !airIonizerEnabled,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                airIonizerEnabled &&
                                  styles.controlPillTextActive,
                              ]}
                            >
                              {airIonizerEnabled ? "Ionizer" : "Ionizer Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.controlPill,
                              airAutoVentilation && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                airAutoVentilation: !airAutoVentilation,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                airAutoVentilation &&
                                  styles.controlPillTextActive,
                              ]}
                            >
                              {airAutoVentilation
                                ? "Auto Vent"
                                : "Vent Off"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      <View style={controlCardStyle}>
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

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Alerts</Text>
                        <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              airAlertsEnabled && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({ airAlertsEnabled: !airAlertsEnabled })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                airAlertsEnabled && styles.controlPillTextActive,
                              ]}
                            >
                              {airAlertsEnabled ? "Alerts on" : "Alerts off"}
                            </Text>
                          </Pressable>
                        </View>
                        <View style={styles.pressureSliderRow}>
                          <Text style={styles.pressureSliderLabel}>AQI</Text>
                          <Text style={styles.pressureSliderValue}>
                            {airAlertAqi}
                          </Text>
                        </View>
                        <Slider
                          value={airAlertAqi}
                          minimumValue={50}
                          maximumValue={200}
                          step={1}
                          onSlidingComplete={(value) =>
                            sendPatch({ airAlertAqi: Math.round(value) })
                          }
                          minimumTrackTintColor="rgba(122,92,255,0.9)"
                          maximumTrackTintColor="rgba(12,12,18,0.12)"
                          thumbTintColor="rgba(255,255,255,0.92)"
                          style={styles.pressureSlider}
                        />
                        <View style={styles.pressureSliderRow}>
                          <Text style={styles.pressureSliderLabel}>CO2</Text>
                          <Text style={styles.pressureSliderValue}>
                            {airAlertCo2} ppm
                          </Text>
                        </View>
                        <Slider
                          value={airAlertCo2}
                          minimumValue={600}
                          maximumValue={2000}
                          step={10}
                          onSlidingComplete={(value) =>
                            sendPatch({ airAlertCo2: Math.round(value) })
                          }
                          minimumTrackTintColor="rgba(122,92,255,0.9)"
                          maximumTrackTintColor="rgba(12,12,18,0.12)"
                          thumbTintColor="rgba(255,255,255,0.92)"
                          style={styles.pressureSlider}
                        />
                        <View style={styles.pressureSliderRow}>
                          <Text style={styles.pressureSliderLabel}>PM2.5</Text>
                          <Text style={styles.pressureSliderValue}>
                            {airAlertPm25} ug/m3
                          </Text>
                        </View>
                        <Slider
                          value={airAlertPm25}
                          minimumValue={10}
                          maximumValue={120}
                          step={1}
                          onSlidingComplete={(value) =>
                            sendPatch({ airAlertPm25: Math.round(value) })
                          }
                          minimumTrackTintColor="rgba(122,92,255,0.9)"
                          maximumTrackTintColor="rgba(12,12,18,0.12)"
                          thumbTintColor="rgba(255,255,255,0.92)"
                          style={styles.pressureSlider}
                        />
                        <View style={styles.pressureSliderRow}>
                          <Text style={styles.pressureSliderLabel}>PM10</Text>
                          <Text style={styles.pressureSliderValue}>
                            {airAlertPm10} ug/m3
                          </Text>
                        </View>
                        <Slider
                          value={airAlertPm10}
                          minimumValue={20}
                          maximumValue={160}
                          step={1}
                          onSlidingComplete={(value) =>
                            sendPatch({ airAlertPm10: Math.round(value) })
                          }
                          minimumTrackTintColor="rgba(122,92,255,0.9)"
                          maximumTrackTintColor="rgba(12,12,18,0.12)"
                          thumbTintColor="rgba(255,255,255,0.92)"
                          style={styles.pressureSlider}
                        />
                        <View style={styles.pressureSliderRow}>
                          <Text style={styles.pressureSliderLabel}>VOC</Text>
                          <Text style={styles.pressureSliderValue}>
                            {airAlertVoc} ppb
                          </Text>
                        </View>
                        <Slider
                          value={airAlertVoc}
                          minimumValue={80}
                          maximumValue={800}
                          step={10}
                          onSlidingComplete={(value) =>
                            sendPatch({ airAlertVoc: Math.round(value) })
                          }
                          minimumTrackTintColor="rgba(122,92,255,0.9)"
                          maximumTrackTintColor="rgba(12,12,18,0.12)"
                          thumbTintColor="rgba(255,255,255,0.92)"
                          style={styles.pressureSlider}
                        />
                        <View style={styles.pressureSliderRow}>
                          <Text style={styles.pressureSliderLabel}>Pollen</Text>
                          <Text style={styles.pressureSliderValue}>
                            {airAlertPollen} idx
                          </Text>
                        </View>
                        <Slider
                          value={airAlertPollen}
                          minimumValue={1}
                          maximumValue={5}
                          step={1}
                          onSlidingComplete={(value) =>
                            sendPatch({ airAlertPollen: Math.round(value) })
                          }
                          minimumTrackTintColor="rgba(122,92,255,0.9)"
                          maximumTrackTintColor="rgba(12,12,18,0.12)"
                          thumbTintColor="rgba(255,255,255,0.92)"
                          style={styles.pressureSlider}
                        />
                      </View>

                      <View style={controlCardStyle}>
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
                                  style={[
                                    styles.airSensorRow,
                                    isActive && styles.airSensorRowActive,
                                  ]}
                                  onPress={() =>
                                    navigation.navigate("DeviceDetail", {
                                      deviceId: sensor.id,
                                    })
                                  }
                                >
                                  <View
                                    style={[
                                      styles.airSensorDot,
                                      { backgroundColor: sensorBand.color },
                                    ]}
                                  />
                                  <View style={{ flex: 1 }}>
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
                          <View style={{ marginBottom: 6 }}>
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() => sendPatch({ zone })}
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                                style={[
                                  styles.scheduleToggle,
                                  s.enabled && styles.scheduleToggleActive,
                                ]}
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
                                  style={[
                                    styles.scheduleToggleText,
                                    s.enabled &&
                                      styles.scheduleToggleTextActive,
                                  ]}
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
                          style={[
                            styles.modeTile,
                            device.isOn && styles.modeTileActive,
                          ]}
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
                            style={[
                              styles.modeText,
                              device.isOn && styles.modeTextActive,
                            ]}
                          >
                            Start
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.modeTile,
                            !device.isOn && styles.modeTileActive,
                          ]}
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
                            style={[
                              styles.modeText,
                              !device.isOn && styles.modeTextActive,
                            ]}
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
                            style={[
                              styles.speakerCover,
                              {
                                width: speakerCoverSize,
                                height: speakerCoverSize,
                                borderRadius: Math.round(speakerCoverSize * 0.22),
                              },
                            ]}
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
                              style={[
                                styles.speakerProgressFill,
                                {
                                  width: `${Math.round(
                                    speakerTrackProgressPct * 100,
                                  )}%`,
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.speakerTime}>
                            {formatTrackTime(speakerTrackDuration)}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.speakerVisualizerRow,
                            { height: speakerBarMax },
                          ]}
                        >
                          {speakerBars.map((bar, idx) => (
                            <Animated.View
                              key={`speaker-bar-${idx}`}
                              style={[
                                styles.speakerVisualizerBar,
                                {
                                  height: bar.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [
                                      speakerBarBase,
                                      speakerBarMax,
                                    ],
                                  }),
                                  opacity: device.isOn ? 1 : 0.4,
                                },
                              ]}
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
                        formatValue={(v) => `${v}`}
                        formatTick={(v) => `${v}`}
                        onChange={(v) => {
                          const next = clamp(v, 0, 100);
                          sendPatch({ volume: next, isOn: true });
                        }}
                        centerContent={
                          <View style={[styles.infoOrb, styles.infoOrbCompact]}>
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
                          style={[
                            styles.mediaBtn,
                            device.isOn && styles.mediaBtnActive,
                          ]}
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({
                                    speakerSource:
                                      value as Device["speakerSource"],
                                  })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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
                                  style={[
                                    styles.chip,
                                    active && styles.chipActive,
                                  ]}
                                  onPress={() =>
                                    sendPatch({
                                      speakerPreset:
                                        value as Device["speakerPreset"],
                                    })
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.chipText,
                                      active && styles.chipTextActive,
                                    ]}
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({
                                    [item.field]: !active,
                                  } as Partial<Device>)
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
                                >
                                  {item.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <View style={[controlCardRowStyle, { marginTop: 10 }]}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              speakerMic && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({ micEnabled: !speakerMic })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                speakerMic && styles.controlPillTextActive,
                              ]}
                            >
                              {speakerMic ? "Mic On" : "Mic Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.controlPill,
                              speakerAssistant && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                voiceAssistantEnabled: !speakerAssistant,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                speakerAssistant &&
                                  styles.controlPillTextActive,
                              ]}
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({
                                    repeat: option.value as Device["repeat"],
                                  })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
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

                  {device.kind === "smoke" && (
                    <>
                      <View style={styles.infoOrb}>
                        <LinearGradient
                          colors={
                            smokeDetected || coDetected
                              ? ["#FFB4B4", "#B46BFF"]
                              : ["#D9F5E6", "#6B3CFF"]
                          }
                          start={{ x: 0.2, y: 0.1 }}
                          end={{ x: 0.9, y: 1 }}
                          style={styles.infoOrbInner}
                        >
                          <Ionicons
                            name={
                              smokeDetected || coDetected
                                ? "alert-circle"
                                : "checkmark-circle"
                            }
                            size={32}
                            color="#fff"
                          />
                          <Text style={styles.infoValue}>
                            {smokeDetected || coDetected ? "ALERT" : "CLEAR"}
                          </Text>
                          <Text style={styles.infoSub}>{device.name}</Text>
                        </LinearGradient>
                      </View>

                      <View style={styles.metricRow}>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>{coPpm} ppm</Text>
                          <Text style={styles.metricLabel}>CO</Text>
                        </View>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {smokePpm} ppm
                          </Text>
                          <Text style={styles.metricLabel}>Smoke</Text>
                        </View>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {smokeBattery}%
                          </Text>
                          <Text style={styles.metricLabel}>Battery</Text>
                        </View>
                      </View>

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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({
                                    smokeSensorStatus:
                                      status as Device["smokeSensorStatus"],
                                  })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
                                >
                                  {label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <Text style={styles.budgetHint}>
                          Last test:{" "}
                          {smokeLastTestAt
                            ? formatTimeAgo(smokeLastTestAt)
                            : "Not yet"}
                        </Text>
                        <Text style={styles.budgetHint}>
                          Last alarm:{" "}
                          {smokeLastAlarmAt
                            ? formatTimeAgo(smokeLastAlarmAt)
                            : "None"}
                        </Text>
                      </View>

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

                      <View style={controlCardRowStyle}>
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
                    </>
                  )}

                  {device.kind === "tv" && (
                    <>
                      {device.isOn ? (
                        <RadialDial
                          size={compactDialSize}
                          value={volume}
                          min={0}
                          max={100}
                          tickValues={[0, 25, 50, 75, 100]}
                          dimmed={!device.isOn}
                          formatValue={(v) => `${v}`}
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
                            <View style={styles.tvOrb}>
                              <LinearGradient
                                colors={["#7AB8FF", "#6B3CFF"]}
                                start={{ x: 0.2, y: 0.1 }}
                                end={{ x: 0.9, y: 1 }}
                                style={styles.tvOrbInner}
                              >
                                <Ionicons name="tv" size={40} color="#fff" />
                                <Text style={styles.tvName}>{device.name}</Text>
                                <Text style={styles.tvRoom}>
                                  {roomName || "TV"}
                                </Text>
                                <Text style={styles.tvRoom}>
                                  {tvStatusLabel}
                                </Text>
                                <Text style={styles.tvRoom}>
                                  {tvDetailLabel}
                                </Text>
                              </LinearGradient>
                            </View>
                          }
                        />
                      ) : (
                        renderDeviceLottie(TV_LOTTIE_SOURCE, compactDialSize)
                      )}

                      <View style={[controlCardStyle, styles.remoteCard]}>
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
                              style={[styles.remoteBtn, styles.remoteBtnWide]}
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
                        <View style={[styles.remoteRow, { marginTop: 8 }]}>
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
                            <Ionicons
                              name="play-back"
                              size={16}
                              color="#0c0c12"
                            />
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
                            <Ionicons
                              name="play-forward"
                              size={16}
                              color="#0c0c12"
                            />
                            <Text style={styles.remoteText}>Fwd</Text>
                          </Pressable>
                        </View>
                        <View style={[styles.remoteRow, { marginTop: 6 }]}>
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
                            <Ionicons
                              name="play-skip-back"
                              size={16}
                              color="#0c0c12"
                            />
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
                            <Ionicons
                              name="play-skip-forward"
                              size={16}
                              color="#0c0c12"
                            />
                            <Text style={styles.remoteText}>Next</Text>
                          </Pressable>
                        </View>

                        <View style={styles.remotePadWrap}>
                          <View style={styles.remotePadArea}>
                            <Pressable
                              style={[
                                styles.orbActionBtn,
                                styles.remoteSideLeft,
                              ]}
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
                                name={
                                  device.muted
                                    ? "volume-mute"
                                    : "volume-mute-outline"
                                }
                                size={18}
                                color={stylesVars.ink}
                              />
                            </Pressable>
                            <View style={styles.navPad}>
                              <Pressable
                                style={[styles.navBtn, styles.navUp]}
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
                                <Ionicons
                                  name="chevron-up"
                                  size={18}
                                  color="#0c0c12"
                                />
                              </Pressable>
                              <Pressable
                                style={[styles.navBtn, styles.navLeft]}
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
                                <Ionicons
                                  name="chevron-back"
                                  size={18}
                                  color="#0c0c12"
                                />
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
                                style={[styles.navBtn, styles.navRight]}
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
                                <Ionicons
                                  name="chevron-forward"
                                  size={18}
                                  color="#0c0c12"
                                />
                              </Pressable>
                              <Pressable
                                style={[styles.navBtn, styles.navDown]}
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
                                <Ionicons
                                  name="chevron-down"
                                  size={18}
                                  color="#0c0c12"
                                />
                              </Pressable>
                            </View>
                            <Pressable
                              style={[
                                styles.orbActionBtn,
                                styles.remoteSideRight,
                              ]}
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
                              <Ionicons
                                name="home"
                                size={18}
                                color={stylesVars.ink}
                              />
                            </Pressable>
                          </View>
                        </View>
                        <View style={[styles.remoteRow, { marginTop: 6 }]}>
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
                            <Ionicons
                              name="caret-up"
                              size={18}
                              color="#0c0c12"
                            />
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
                            <Ionicons
                              name="caret-down"
                              size={18}
                              color="#0c0c12"
                            />
                            <Text style={styles.remoteText}>Ch -</Text>
                          </Pressable>
                        </View>
                      </View>
                    </>
                  )}

                  {device.kind === "coffee" && (
                    <>
                      <View style={styles.coffeeOrb}>
                        <View style={styles.coffeeOrbInner}>
                          <Ionicons name="cafe" size={34} color="#fff" />
                          <Text style={styles.coffeeName}>{device.name}</Text>
                          <Text style={styles.coffeeRoom}>
                            {roomName || "Coffee"}
                          </Text>
                          <View style={styles.coffeeCup}>
                            <Animated.View
                              style={[
                                styles.coffeeFill,
                                {
                                  height: coffeeFill.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ["10%", "90%"],
                                  }),
                                },
                              ]}
                            />
                          </View>
                        </View>
                      </View>

                      <View style={controlCardRowStyle}>
                        <Pressable
                          style={styles.controlPill}
                          onPress={() => {
                            animateCoffee(true);
                            sendPatch({ isOn: true });
                          }}
                        >
                          <Text style={styles.controlPillText}>Brew now</Text>
                        </Pressable>
                        <Pressable
                          style={styles.controlPill}
                          onPress={() => {
                            animateCoffee(false);
                            sendPatch({ isOn: false });
                          }}
                        >
                          <Text style={styles.controlPillText}>Stop</Text>
                        </Pressable>
                      </View>

                      <View style={styles.metricRow}>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {coffeeWaterLevel}%
                          </Text>
                          <Text style={styles.metricLabel}>Water tank</Text>
                        </View>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>
                            {coffeeBeanLevel}%
                          </Text>
                          <Text style={styles.metricLabel}>Bean hopper</Text>
                        </View>
                        <View style={styles.metricCard}>
                          <Text style={styles.metricValue}>{coffeeTempC}°C</Text>
                          <Text style={styles.metricLabel}>Brew temp</Text>
                        </View>
                      </View>

                      {coffeeDescaleNeeded && (
                        <View style={styles.alertRow}>
                          <Ionicons name="warning" size={14} color="#D8465B" />
                          <Text style={styles.alertText}>
                            Descale cycle recommended
                          </Text>
                        </View>
                      )}

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Brew profile</Text>
                        <Text style={styles.cardHint}>Size</Text>
                        <View style={styles.chipRow}>
                          {[6, 8, 10, 12].map((value) => {
                            const active = coffeeSizeOz === value;
                            return (
                              <Pressable
                                key={value}
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ coffeeSizeOz: value })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
                                >
                                  {value} oz
                                </Text>
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({
                                    coffeeStrength:
                                      option.value as Device["coffeeStrength"],
                                  })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
                                >
                                  {option.label}
                                </Text>
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ coffeeCupCount: value })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
                                >
                                  {value}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Temperature</Text>
                        <View style={styles.pressureSliderRow}>
                          <Text style={styles.pressureSliderLabel}>Brew</Text>
                          <Text style={styles.pressureSliderValue}>
                            {coffeeTempC}°C
                          </Text>
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ coffeeKeepWarmMin: value })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
                                >
                                  {value === 0 ? "Off" : `${value}m`}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={controlCardStyle}>
                        <Text style={styles.cardLabel}>Extras</Text>
                        <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                          <Pressable
                            style={[
                              styles.controlPill,
                              coffeeGrinder && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({ coffeeGrinder: !coffeeGrinder })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                coffeeGrinder && styles.controlPillTextActive,
                              ]}
                            >
                              {coffeeGrinder ? "Grinder" : "Grinder Off"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.controlPill,
                              coffeeMilkFrother && styles.controlPillActive,
                            ]}
                            onPress={() =>
                              sendPatch({
                                coffeeMilkFrother: !coffeeMilkFrother,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.controlPillText,
                                coffeeMilkFrother &&
                                  styles.controlPillTextActive,
                              ]}
                            >
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
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  sendPatch({ coffeeAutoBrewTime: time })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
                                >
                                  {time}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </>
                  )}
                </View>
              )}
            </ScrollView>
          </View>

          <View
            style={[
              styles.powerDock,
              {
                left: 0,
                right: 0,
                bottom: powerDockOffset,
                height: powerDockHeight,
                borderRadius: Math.round(powerDockHeight / 2),
                paddingVertical: powerDockInset,
              },
            ]}
          >
            <Pressable style={styles.powerWrap} onPress={handlePowerToggle}>
              <View
                style={[styles.powerRing, device.isOn && styles.powerRingOn]}
              >
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
      </SafeAreaView>

      <Modal
        transparent
        visible={showEdit}
        animationType="fade"
        onRequestClose={() => setShowEdit(false)}
      >
        <View style={styles.editOverlay}>
          <Pressable
            style={styles.editBackdrop}
            onPress={() => setShowEdit(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.select({ ios: "padding", android: undefined })}
          >
            <View
              style={[
                styles.editCard,
                {
                  padding: editPad,
                  borderRadius: editRadius,
                  maxWidth: isTablet ? 560 : undefined,
                  width: isTablet
                    ? Math.min(contentWidth - gutter * 2, 560)
                    : undefined,
                  alignSelf: isTablet ? "center" : "stretch",
                },
              ]}
              testID="device-edit-card"
            >
              <Text style={[styles.editTitle, { fontSize: editTitleSize }]}>
                Edit device
              </Text>
              <Text style={[styles.editSub, { fontSize: editSubSize }]}>
                Rename or move this device to another room.
              </Text>

              <Text style={[styles.editLabel, { fontSize: editLabelSize }]}>
                Device name
              </Text>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Device name"
                placeholderTextColor="rgba(12,12,18,0.45)"
                style={[
                  styles.editInput,
                  {
                    height: editInputHeight,
                    borderRadius: Math.round(editInputHeight * 0.28),
                  },
                ]}
                autoCapitalize="words"
              />

              <Text style={[styles.editLabel, { fontSize: editLabelSize }]}>
                Room
              </Text>
              <View style={styles.roomRow}>
                {rooms.map((r) => {
                  const active = r.id === draftRoomId;
                  return (
                    <Pressable
                      key={r.id}
                      style={[
                        styles.roomPill,
                        {
                          height: editInputHeight,
                          borderRadius: Math.round(editInputHeight / 2),
                        },
                        active && styles.roomPillActive,
                      ]}
                      onPress={() => setDraftRoomId(r.id)}
                    >
                      <Text
                        style={[
                          styles.roomPillText,
                          { fontSize: editLabelSize },
                          active && styles.roomPillTextActive,
                        ]}
                      >
                        {r.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {isLaundry && (
                <>
                  <Text style={[styles.editLabel, { fontSize: editLabelSize }]}>
                    Laundry stack
                  </Text>
                  <View style={styles.stackRow}>
                    <Pressable
                      style={[
                        styles.stackPill,
                        !stackEnabled && styles.stackPillActive,
                      ]}
                      onPress={() => setStackEnabled(false)}
                    >
                      <Text
                        style={[
                          styles.stackPillText,
                          !stackEnabled && styles.stackPillTextActive,
                        ]}
                      >
                        Single
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.stackPill,
                        stackEnabled && styles.stackPillActive,
                      ]}
                      onPress={() => setStackEnabled(true)}
                    >
                      <Text
                        style={[
                          styles.stackPillText,
                          stackEnabled && styles.stackPillTextActive,
                        ]}
                      >
                        Stacked
                      </Text>
                    </Pressable>
                  </View>
                  {stackEnabled && (
                    <>
                      <Text
                        style={[styles.editLabel, { fontSize: editLabelSize }]}
                      >
                        Pair with {stackPartnerKind}
                      </Text>
                      <View style={styles.stackTargetsRow}>
                        {stackCandidates.length ? (
                          stackCandidates.map((candidate) => {
                            const active = candidate.id === stackTargetId;
                            return (
                              <Pressable
                                key={candidate.id}
                                style={[
                                  styles.stackTargetPill,
                                  active && styles.stackTargetPillActive,
                                ]}
                                onPress={() => setStackTargetId(candidate.id)}
                              >
                                <Text
                                  style={[
                                    styles.stackTargetText,
                                    active && styles.stackTargetTextActive,
                                  ]}
                                >
                                  {candidate.name}
                                </Text>
                              </Pressable>
                            );
                          })
                        ) : (
                          <Text style={styles.stackHint}>
                            No {stackPartnerKind} in this room yet.
                          </Text>
                        )}
                      </View>
                    </>
                  )}
                  <Text style={styles.stackHint}>
                    {stackEnabled
                      ? "Link this unit to show as a stacked pair."
                      : "Keep this unit independent."}
                  </Text>
                </>
              )}

              <View style={styles.editActions}>
                <Pressable
                  style={[
                    styles.editGhost,
                    {
                      height: editButtonHeight,
                      borderRadius: Math.round(editButtonHeight * 0.28),
                    },
                  ]}
                  onPress={() => setShowEdit(false)}
                >
                  <Text
                    style={[styles.editGhostText, { fontSize: editLabelSize }]}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.editPrimary,
                    {
                      height: editButtonHeight,
                      borderRadius: Math.round(editButtonHeight * 0.28),
                    },
                    (!draftName.trim() || !canStackSave) &&
                      styles.editPrimaryDisabled,
                  ]}
                  onPress={() => {
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
                      const partner = devicesAll.find(
                        (d) => d.id === stackTargetId,
                      );
                      if (partner) {
                        const nextStackId =
                          device.stackId ??
                          partner.stackId ??
                          `stack-${Date.now()}`;
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
                        if (
                          partner.stackId &&
                          partner.stackId !== nextStackId
                        ) {
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
                        const selfPosition =
                          device.kind === "dryer" ? "top" : "bottom";
                        const partnerPosition =
                          partner.kind === "dryer" ? "top" : "bottom";
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
                  }}
                  disabled={!draftName.trim() || !canStackSave}
                >
                  <Text
                    style={[
                      styles.editPrimaryText,
                      { fontSize: editLabelSize },
                    ]}
                  >
                    Save
                  </Text>
                </Pressable>
              </View>

              <Pressable
                style={[
                  styles.editDelete,
                  {
                    height: editButtonHeight,
                    borderRadius: Math.round(editButtonHeight * 0.28),
                  },
                ]}
                onPress={() => {
                  removeDevice(device.id);
                  setShowEdit(false);
                  navigation.goBack();
                }}
              >
                <Text
                  style={[styles.editDeleteText, { fontSize: editLabelSize }]}
                >
                  Delete device
                </Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        transparent
        visible={showSchedule}
        animationType="fade"
        onRequestClose={() => setShowSchedule(false)}
      >
        <View style={styles.editOverlay}>
          <Pressable
            style={styles.editBackdrop}
            onPress={() => setShowSchedule(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.select({ ios: "padding", android: undefined })}
          >
            <View
              style={[
                styles.scheduleCard,
                {
                  padding: editPad,
                  borderRadius: editRadius,
                  maxWidth: isTablet ? 520 : undefined,
                  width: isTablet
                    ? Math.min(contentWidth - gutter * 2, 520)
                    : undefined,
                  alignSelf: isTablet ? "center" : "stretch",
                },
              ]}
            >
              <Text style={[styles.editTitle, { fontSize: editTitleSize }]}>
                New schedule
              </Text>
              <Text style={[styles.editSub, { fontSize: editSubSize }]}>
                Pick a time and days to water.
              </Text>

              <Text style={[styles.editLabel, { fontSize: editLabelSize }]}>
                Time
              </Text>
              <View style={styles.timeRow}>
                <TextInput
                  value={schedHour}
                  onChangeText={setSchedHour}
                  placeholder="06"
                  keyboardType="number-pad"
                  style={[
                    styles.timeInput,
                    {
                      height: editInputHeight,
                      borderRadius: Math.round(editInputHeight * 0.28),
                    },
                  ]}
                  maxLength={2}
                />
                <Text style={styles.timeColon}>:</Text>
                <TextInput
                  value={schedMinute}
                  onChangeText={setSchedMinute}
                  placeholder="00"
                  keyboardType="number-pad"
                  style={[
                    styles.timeInput,
                    {
                      height: editInputHeight,
                      borderRadius: Math.round(editInputHeight * 0.28),
                    },
                  ]}
                  maxLength={2}
                />
              </View>

              <Text style={[styles.editLabel, { fontSize: editLabelSize }]}>
                Days
              </Text>
              <View style={styles.dayRow}>
                {(
                  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const
                ).map((day) => {
                  const active = schedDays.includes(day);
                  return (
                    <Pressable
                      key={day}
                      style={[
                        styles.dayChip,
                        {
                          height: editInputHeight,
                          borderRadius: Math.round(editInputHeight / 2),
                        },
                        active && styles.dayChipActive,
                      ]}
                      onPress={() => {
                        setSchedDays((prev) =>
                          prev.includes(day)
                            ? prev.filter((d) => d !== day)
                            : [...prev, day],
                        );
                      }}
                    >
                      <Text
                        style={[
                          styles.dayChipText,
                          { fontSize: editLabelSize },
                          active && styles.dayChipTextActive,
                        ]}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.editActions}>
                <Pressable
                  style={[
                    styles.editGhost,
                    {
                      height: editButtonHeight,
                      borderRadius: Math.round(editButtonHeight * 0.28),
                    },
                  ]}
                  onPress={() => setShowSchedule(false)}
                >
                  <Text
                    style={[styles.editGhostText, { fontSize: editLabelSize }]}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.editPrimary,
                    {
                      height: editButtonHeight,
                      borderRadius: Math.round(editButtonHeight * 0.28),
                    },
                    schedDays.length === 0 && styles.editPrimaryDisabled,
                  ]}
                  onPress={() => {
                    if (schedDays.length === 0) return;
                    const h = Math.max(
                      0,
                      Math.min(23, parseInt(schedHour || "0", 10)),
                    );
                    const m = Math.max(
                      0,
                      Math.min(59, parseInt(schedMinute || "0", 10)),
                    );
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
                  }}
                  disabled={schedDays.length === 0}
                >
                  <Text
                    style={[
                      styles.editPrimaryText,
                      { fontSize: editLabelSize },
                    ]}
                  >
                    Save
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  panelBody: { flex: 1 },
  panelScroll: { paddingTop: 12 },
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
  infoOrbCompact: {
    width: 170,
    height: 170,
    borderRadius: 85,
    marginBottom: 0,
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
  metricCardSolar: {
    backgroundColor: "rgba(180,107,255,0.18)",
    borderColor: "rgba(122,92,255,0.25)",
  },
  metricValue: { color: stylesVars.ink, fontWeight: "900", fontSize: 16 },
  metricLabel: {
    marginTop: 4,
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 11,
  },
  airMetricGrid: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  airMetricCard: {
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  airTrendCard: { marginTop: 6 },
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
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  airTrendText: { color: stylesVars.ink, fontWeight: "900", fontSize: 12 },
  airChart: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 4,
    minHeight: 64,
  },
  airChartBar: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: "rgba(122,92,255,0.6)",
  },
  airLegendRow: {
    marginTop: 10,
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
  airRecommendationRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  airRecommendationText: {
    flex: 1,
    color: stylesVars.subtext,
    fontWeight: "700",
    fontSize: 12,
  },
  airCompareRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  airCompareCard: {
    flex: 1,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
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
  airSensorList: { marginTop: 10, gap: 8 },
  airSensorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.68)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  airSensorRowActive: {
    borderColor: "rgba(122,92,255,0.35)",
    backgroundColor: "rgba(180,107,255,0.16)",
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
  solarHint: {
    marginTop: 6,
    textAlign: "center",
    color: stylesVars.subtext,
    fontWeight: "800",
    fontSize: 11,
  },
  budgetHint: {
    marginTop: 10,
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
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: "hidden",
    shadowColor: "rgba(180,107,255,0.45)",
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    marginBottom: 6,
  },
  tvOrbInner: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  laundryCenter: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(12,12,18,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    overflow: "hidden",
  },
  laundryCenterLottie: { width: "100%", height: "100%" },
  laundryCenterOverlay: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  laundryCenterValue: {
    color: "#fff",
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowRadius: 6,
  },
  laundryCenterLabel: {
    marginTop: 4,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowRadius: 6,
  },
  windowCenter: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(12,12,18,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    overflow: "hidden",
  },
  windowCenterLottie: { width: "100%", height: "100%" },
  windowCenterOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  windowCenterValue: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 20,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowRadius: 6,
  },
  windowCenterLabel: {
    marginTop: 4,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
    fontSize: 12,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowRadius: 6,
  },
  tvName: { marginTop: 8, color: "#fff", fontWeight: "900", fontSize: 18 },
  tvRoom: {
    marginTop: 2,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
    fontSize: 12,
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
  remoteCard: { marginTop: 2, paddingBottom: 10 },
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
    backgroundColor: "rgba(180,107,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(180,107,255,0.32)",
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

  editOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 18,
  },
  editBackdrop: { ...StyleSheet.absoluteFillObject },
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
