import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ScrollView,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { RootStackParamList } from "../app/AppNavigator";
import BackgroundLines from "../components/BackgroundLines";
import RoomScenesRow from "../components/RoomScenesRow";
import DeviceTile from "../components/DeviceTile";
import DeviceBottomSheet from "../components/DeviceBottomSheet";
import DeviceIcon from "../components/DeviceIcon";
import ModalCard from "../components/ModalCard";
import ModalActionRow from "../components/ModalActionRow";
import ModalField from "../components/ModalField";
import LandscapeFrame from "../components/LandscapeFrame";
import PortraitFrame from "../components/PortraitFrame";
import { theme } from "../theme/theme";
import { deviceClient } from "../services/deviceClient";
import {
  selectVisibleDevices,
  selectVisibleRooms,
  useHomeStore,
  type Device,
} from "../store/useHomeStore";
import { useResponsive } from "../theme/layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DEVICE_OPTIONS: Array<{
  kind: Device["kind"];
  label: string;
  defaultName: string;
}> = [
  { kind: "light", label: "Light", defaultName: "New Light" },
  { kind: "ac", label: "AC", defaultName: "Air Conditioner" },
  { kind: "tv", label: "TV", defaultName: "Smart TV" },
  { kind: "coffee", label: "Coffee", defaultName: "Coffee Maker" },
  { kind: "fan", label: "Fan", defaultName: "Ceiling Fan" },
  { kind: "fridge", label: "Fridge", defaultName: "Refrigerator" },
  { kind: "gate", label: "Gate", defaultName: "Front Gate" },
  { kind: "garage", label: "Garage", defaultName: "Garage Door" },
  { kind: "door", label: "Door", defaultName: "Front Door" },
  { kind: "window", label: "Window", defaultName: "Window" },
  { kind: "vacuum", label: "Vacuum", defaultName: "Robot Vacuum" },
  { kind: "camera", label: "Camera", defaultName: "Security Cam" },
  { kind: "stove", label: "Stove", defaultName: "Smart Stove" },
  { kind: "washer", label: "Washer", defaultName: "Washer" },
  { kind: "dryer", label: "Dryer", defaultName: "Dryer" },
  { kind: "dishwasher", label: "Dishwasher", defaultName: "Dishwasher" },
  { kind: "microwave", label: "Microwave", defaultName: "Microwave" },
  { kind: "energy", label: "Energy", defaultName: "Energy Monitor" },
  { kind: "water", label: "Water", defaultName: "Water Meter" },
  { kind: "water-heater", label: "Water Heater", defaultName: "Water Heater" },
  { kind: "air", label: "Air", defaultName: "Air Quality" },
  { kind: "sprinkler", label: "Sprinkler", defaultName: "Sprinkler" },
  { kind: "speaker", label: "Speaker", defaultName: "Smart Speaker" },
  { kind: "smoke", label: "Smoke/CO", defaultName: "Smoke Alarm" },
];

const buildDeviceDefaults = (kind: Device["kind"]): Partial<Device> => {
  switch (kind) {
    case "light":
      return {
        brightness: 60,
        color: "#FFFFFF",
        colorTempK: 3200,
        lightEffect: "focus",
        adaptiveLighting: true,
        motionBoost: false,
        nightShift: false,
        autoOffMin: 0,
      };
    case "ac":
      return {
        tempC: 22,
        mode: "cold",
        acFanSpeed: 60,
        acSwingMode: "both",
        acEcoMode: false,
        acTurboMode: false,
        acQuietMode: false,
        acTargetHumidity: 45,
        acFilterLife: 85,
      };
    case "tv":
      return { volume: 20, channel: 1, source: "Live TV" };
    case "fan":
      return {
        speed: 50,
        fanOscillation: true,
        fanDirection: "forward",
        fanTimerMin: 0,
        fanAutoMode: false,
        fanLightOn: true,
        fanSleepMode: false,
      };
    case "fridge":
      return {
        tempC: 4,
        freezerTempC: -18,
        fridgeMode: "normal",
        fridgeDoorOpen: false,
        fridgeDoorAlarm: true,
        fridgeIceMaker: true,
        fridgeQuickCool: false,
        fridgeQuickFreeze: false,
        fridgeEnergySaver: true,
        fridgeFilterLife: 80,
        fridgeHumidity: 50,
      };
    case "garage":
    case "door":
    case "window":
      return { openPercent: 0 };
    case "gate":
      return { openPercent: 0, autoOpenEnabled: true };
    case "vacuum":
      return {
        status: "docked",
        battery: 85,
        vacuumSuction: 70,
        vacuumMode: "auto",
        vacuumMop: false,
        vacuumQuietMode: false,
        vacuumBinFull: false,
        vacuumBrushDirty: false,
        vacuumFilterLife: 70,
        vacuumAreaM2: 24,
        vacuumRuntimeMin: 40,
      };
    case "camera":
      return { armed: true, recording: false };
    case "stove":
      return {
        burnerLevel: 0,
        stoveMode: "simmer",
        stoveTimerMin: 0,
        stoveLock: false,
      };
    case "washer":
      return {
        cycle: "Normal",
        progress: 0,
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
    case "dryer":
      return {
        cycle: "Normal",
        progress: 0,
        heatLevel: "Med",
        drynessLevel: "Dry",
        remainingMin: 40,
        sensorDry: true,
        wrinkleGuard: true,
        steamRefresh: false,
        ecoDry: false,
        airFluff: false,
        coolDown: true,
        lintFilterOk: true,
        antiStatic: false,
      };
    case "microwave":
      return {
        timeRemainingSec: 0,
        microwavePower: 6,
        microwaveMode: "Reheat",
      };
    case "coffee":
      return {
        coffeeStrength: "normal",
        coffeeSizeOz: 8,
        coffeeTempC: 92,
        coffeeKeepWarmMin: 20,
        coffeeCupCount: 2,
        coffeeGrinder: true,
        coffeeMilkFrother: false,
        coffeeWaterLevel: 70,
        coffeeBeanLevel: 55,
        coffeeDescaleNeeded: false,
        coffeeAutoBrewTime: "07:00",
      };
    case "energy":
      return {
        powerW: 480,
        energyTodayKwh: 1.8,
        gridAvailable: true,
        gridOutageAlerts: true,
        solarW: 0,
        solarTodayKwh: 0,
        gridTodayKwh: 1.8,
      };
    case "water":
      return {
        waterLpm: 0,
        waterTodayL: 0,
        waterPressurePsi: 50,
        waterPressureLowPsi: 40,
        waterPressureHighPsi: 80,
        waterPressureAlerts: true,
      };
    case "water-heater":
      return {
        tempC: 52,
        waterHeaterType: "electric-tank",
        heaterMode: "eco",
        recirculation: false,
        antiLegionella: false,
        vacationDays: 0,
        heaterScheduleEnabled: true,
      };
    case "air":
      return {
        airQualityIndex: 32,
        humidity: 44,
        airPm25: 8,
        airPm10: 14,
        airCo2: 620,
        airVoc: 120,
        airFormaldehyde: 0.04,
        airPollen: 1,
        airQualityConfidence: 92,
        airOutdoorAqi: 46,
        airOutdoorPm25: 12,
        airOutdoorCo2: 420,
        airOutdoorVoc: 90,
        airOutdoorHumidity: 48,
        airOutdoorTempC: 26,
        airAlertsEnabled: true,
        airAlertAqi: 100,
        airAlertCo2: 1200,
        airAlertVoc: 300,
        airAlertPm25: 35,
        airAlertPm10: 50,
        airAlertPollen: 3,
        airPurifierMode: "auto",
        airPurifierSpeed: 40,
        airIonizerEnabled: false,
        airFilterLife: 78,
        airFilterDaysLeft: 45,
        airAutoVentilation: true,
      };
    case "sprinkler":
      return { zone: "Front Yard", durationMin: 15 };
    case "speaker":
      return {
        volume: 22,
        speakerSource: "Bluetooth",
        speakerPreset: "Flat",
        bass: 50,
        treble: 50,
        spatialAudio: false,
        partyMode: false,
        nightMode: false,
        micEnabled: true,
        voiceAssistantEnabled: true,
        shuffle: false,
        repeat: "off",
        trackTitle: "New Day",
        trackArtist: "Vanta",
        trackAlbum: "Home Sessions",
        trackDurationSec: 210,
        trackProgressSec: 0,
      };
    case "smoke":
      return {
        smokeDetected: false,
        coDetected: false,
        coPpm: 3,
        smokePpm: 0,
        smokeBattery: 80,
        smokeSensorStatus: "ok",
        smokeSilenced: false,
      };
    default:
      return {};
  }
};

type Props = NativeStackScreenProps<RootStackParamList, "Room">;

export default function RoomScreen({ route, navigation }: Props) {
  const {
    width,
    contentWidth,
    gutter,
    isTablet,
    isLandscape,
    topPad,
    blockGap,
    scale,
  } = useResponsive(1200);
  const isWide = isTablet && isLandscape;
  const isPortrait = !isLandscape;
  const isCompactPhone = !isTablet && contentWidth < 360;
  const frameEnabled = isPortrait || isWide;
  const FrameComponent = isPortrait ? PortraitFrame : LandscapeFrame;
  const framePad = Math.round((isTablet ? 14 : 10) * scale);
  const frameRadius = Math.round((isTablet ? 30 : 26) * scale);
  const outerGutter = isWide
    ? Math.round(gutter * 0.6)
    : isTablet
      ? gutter
      : gutter;
  const innerGutter = isWide
    ? Math.round(gutter * 0.75)
    : isTablet
      ? gutter
      : Math.round(gutter * 0.6);
  const listGap = Math.round((isTablet ? 18 : 12) * scale);
  const frameWidth = Math.max(0, width - outerGutter * 2);
  const frameInnerWidth = Math.max(
    0,
    frameWidth - (frameEnabled ? framePad * 2 : 0),
  );
  const contentInset = frameEnabled
    ? Math.max(0, innerGutter - framePad)
    : innerGutter;
  const gridInset = contentInset;
  const gridWidth = Math.max(0, frameInnerWidth - gridInset * 2);
  const minTileWidth = Math.round(
    (isTablet ? (isLandscape ? 210 : 220) : 160) * scale,
  );
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(
    insets.bottom,
    Math.round((isTablet ? 16 : 12) * scale),
  );
  const listBottomPad =
    safeBottom + Math.round((isTablet ? 24 : 18) * scale);
  const gridVariantStyle = isLandscape
    ? styles.landscapeGrid
    : styles.portraitGrid;
  const gridRowStyle = isLandscape
    ? styles.landscapeGridRow
    : styles.portraitGridRow;
  const landscapeColumns = isWide
    ? Math.max(
        3,
        Math.min(
          5,
          Math.floor((gridWidth + listGap) / (minTileWidth + listGap)),
        ),
      )
    : 0;
  const columns = isTablet ? (isLandscape ? landscapeColumns : 2) : 2;
  const iconBtnSize = Math.round((isTablet ? 46 : 40) * scale);
  const iconBtnRadius = Math.round(iconBtnSize * 0.4);
  const titleSize = Math.round((isTablet ? 20 : 16) * scale);
  const subSize = Math.round((isTablet ? 13 : 12) * scale);
  const undoHeight = Math.round((isTablet ? 54 : 48) * scale);
  const undoRadius = Math.round(undoHeight * 0.33);
  const modalPad = Math.round((isTablet ? 20 : 16) * scale);
  const modalRadius = Math.round((isTablet ? 24 : 22) * scale);
  const modalTitleSize = Math.round((isTablet ? 20 : 18) * scale);
  const modalSubSize = Math.round((isTablet ? 14 : 12) * scale);
  const modalLabelSize = Math.round((isTablet ? 13 : 12) * scale);
  const modalInputHeight = Math.round((isTablet ? 48 : 44) * scale);
  const modalPillHeight = Math.round((isTablet ? 44 : 38) * scale);
  const modalButtonHeight = Math.round((isTablet ? 46 : 42) * scale);
  const contentLayout: ViewStyle = {
    width,
    paddingTop: topPad,
    paddingHorizontal: outerGutter,
    paddingBottom: safeBottom,
  };
  const contentStyle: StyleProp<ViewStyle> = [styles.content, contentLayout];
  const frameStyle: StyleProp<ViewStyle> = [
    styles.frameFill,
    isWide ? { marginTop: Math.round(6 * scale) } : null,
    outerGutter > 0 ? { marginBottom: outerGutter } : null,
  ];
  const topRowLayout: ViewStyle = {
    paddingHorizontal: contentInset,
    width: "100%",
    alignSelf: "center",
  };
  const topRowStyle: StyleProp<ViewStyle> = [styles.top, topRowLayout];
  const iconButtonLayout: ViewStyle = {
    width: iconBtnSize,
    height: iconBtnSize,
    borderRadius: iconBtnRadius,
  };
  const iconButtonStyle: StyleProp<ViewStyle> = [
    styles.iconBtn,
    iconButtonLayout,
  ];
  const columnWrapperLayout: ViewStyle = {
    gap: listGap,
    paddingHorizontal: gridInset,
  };
  const columnWrapperStyle: StyleProp<ViewStyle> | undefined =
    columns > 1 ? [styles.gridRow, gridRowStyle, columnWrapperLayout] : undefined;
  const gridContentLayout: ViewStyle = {
    gap: listGap,
    paddingTop: blockGap,
    paddingHorizontal: columns > 1 ? 0 : gridInset,
    paddingBottom: listBottomPad,
  };
  const gridContentStyle: StyleProp<ViewStyle> = [
    styles.gridContent,
    gridVariantStyle,
    gridContentLayout,
  ];
  const gridListStyle: StyleProp<ViewStyle> = [styles.gridList, gridVariantStyle];
  const headerCenterStyle: StyleProp<ViewStyle> = {
    flex: 1,
    alignItems: "center",
  };
  const headerSlotStyle: StyleProp<ViewStyle> = {
    width: iconBtnSize,
    height: iconBtnSize,
  };
  const titleTextStyle: StyleProp<TextStyle> = [
    styles.title,
    { fontSize: titleSize },
  ];
  const subTextStyle: StyleProp<TextStyle> = [
    styles.sub,
    { fontSize: subSize },
  ];
  const undoBarStyle: StyleProp<ViewStyle> = [
    styles.undoBar,
    {
      width: frameWidth,
      height: undoHeight,
      borderRadius: undoRadius,
      bottom: safeBottom,
    },
  ];
  const modalCardStyle: StyleProp<ViewStyle> = [
    styles.modalCard,
    {
      padding: modalPad,
      borderRadius: modalRadius,
      maxWidth: isTablet ? 560 : undefined,
      width: isTablet ? Math.min(contentWidth - gutter * 2, 560) : undefined,
      alignSelf: isTablet ? "center" : "stretch",
    },
  ];
  const modalTitleTextStyle: StyleProp<TextStyle> = [
    styles.modalTitle,
    { fontSize: modalTitleSize },
  ];
  const modalSubTextStyle: StyleProp<TextStyle> = [
    styles.modalSub,
    { fontSize: modalSubSize },
  ];
  const modalLabelTextStyle: StyleProp<TextStyle> = [
    styles.modalLabel,
    { fontSize: modalLabelSize },
  ];
  const modalInputStyle: StyleProp<ViewStyle> = [
    styles.modalInput,
    {
      height: modalInputHeight,
      borderRadius: Math.round(modalInputHeight * 0.28),
    },
  ];
  const modalTypePillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.deviceTypePill,
    {
      height: modalPillHeight,
      borderRadius: Math.round(modalPillHeight / 2),
    },
    active && styles.deviceTypePillActive,
  ];
  const modalTypeTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.deviceTypeText,
    { fontSize: modalLabelSize },
    active && styles.deviceTypeTextActive,
  ];
  const modalStackPillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.stackPill,
    active && styles.stackPillActive,
  ];
  const modalStackPillTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.stackPillText,
    active && styles.stackPillTextActive,
  ];
  const modalButtonFrameStyle = {
    height: modalButtonHeight,
    borderRadius: Math.round(modalButtonHeight * 0.28),
  };
  const modalGhostButtonStyle: StyleProp<ViewStyle> = [
    styles.modalGhost,
    modalButtonFrameStyle,
  ];
  const modalGhostTextStyle: StyleProp<TextStyle> = [
    styles.modalGhostText,
    { fontSize: modalLabelSize },
  ];
  const modalPrimaryButtonStyle = (disabled: boolean): StyleProp<ViewStyle> => [
    styles.modalPrimary,
    modalButtonFrameStyle,
    disabled && styles.modalPrimaryDisabled,
  ];
  const modalPrimaryTextStyle: StyleProp<TextStyle> = [
    styles.modalPrimaryText,
    { fontSize: modalLabelSize },
  ];
  const { roomId, showAll } = route.params;
  const isWholeHome = Boolean(showAll);

  const visibleRooms = useHomeStore(selectVisibleRooms);
  const room = roomId
    ? visibleRooms.find((r) => r.id === roomId)
    : undefined;
  const devicesAll = useHomeStore(selectVisibleDevices);
  const scenesAll = useHomeStore((s) => s.scenes);
  const runScene = useHomeStore((s) => s.runScene);

  const setDevice = useHomeStore((s) => s.setDevice);
  const quickScheduleDevice = useHomeStore((s) => s.quickScheduleDevice);
  const addDevice = useHomeStore((s) => s.addDevice);
  const removeDevice = useHomeStore((s) => s.removeDevice);

  // Derived data for this room.
  const devices = useMemo(
    () =>
      isWholeHome ? devicesAll : devicesAll.filter((d) => d.roomId === roomId),
    [devicesAll, roomId, isWholeHome],
  );
  const scenes = useMemo(() => {
    const allowedRoomIds = new Set(visibleRooms.map((r) => r.id));
    const visibleScenes = scenesAll.filter((scene) =>
      allowedRoomIds.has(scene.roomId),
    );
    return isWholeHome
      ? visibleScenes
      : visibleScenes.filter((scene) => scene.roomId === roomId);
  }, [scenesAll, visibleRooms, roomId, isWholeHome]);
  const running = devices.filter((d) => d.isOn).length;

  // Bottom sheet state: we keep only the selected ID and derive the device
  // object from the store so the sheet stays in sync with slider changes.
  const sheetRef = useRef<BottomSheetModal>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => devicesAll.find((d) => d.id === selectedId),
    [devicesAll, selectedId],
  );

  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undoScene, setUndoScene] = useState<{
    label: string;
    patches: Array<{ id: string; patch: Partial<Device> }>;
  } | null>(null);

  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newKind, setNewKind] = useState<Device["kind"]>("light");
  const [newName, setNewName] = useState("New Light");
  const [nameTouched, setNameTouched] = useState(false);
  const [stackLaundry, setStackLaundry] = useState(false);

  React.useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  const handleAddDevice = () => {
    setNewKind("light");
    setNewName("New Light");
    setNameTouched(false);
    setStackLaundry(false);
    setShowAddDevice(true);
  };

  const handleCreateDevice = () => {
    if (!roomId || isWholeHome) return;
    const option = DEVICE_OPTIONS.find((o) => o.kind === newKind);
    const name = newName.trim() || option?.defaultName || "New Device";
    const defaults = buildDeviceDefaults(newKind);
    const isOn = ["energy", "water", "water-heater", "air", "smoke"].includes(
      newKind,
    );
    const isLaundry = newKind === "washer" || newKind === "dryer";
    if (isLaundry && stackLaundry) {
      const baseId = Date.now();
      const stackId = `stack-${baseId}`;
      const primaryId = `d${baseId}`;
      const secondaryId = `d${baseId + 1}`;
      const partnerKind = newKind === "washer" ? "dryer" : "washer";
      const partnerOption = DEVICE_OPTIONS.find((o) => o.kind === partnerKind);
      const partnerName =
        name.trim().length > 0
          ? `${name} ${partnerKind === "washer" ? "Washer" : "Dryer"}`
          : partnerOption?.defaultName || "Laundry";
      addDevice({
        id: primaryId,
        name,
        kind: newKind,
        roomId,
        isOn: false,
        stackId,
        stackPosition: newKind === "dryer" ? "top" : "bottom",
        ...defaults,
      });
      addDevice({
        id: secondaryId,
        name: partnerName,
        kind: partnerKind,
        roomId,
        isOn: false,
        stackId,
        stackPosition: partnerKind === "dryer" ? "top" : "bottom",
        ...buildDeviceDefaults(partnerKind),
      });
      setShowAddDevice(false);
      setSelectedId(primaryId);
      requestAnimationFrame(() => sheetRef.current?.present());
      return;
    }
    const id = `d${Date.now()}`;
    addDevice({
      id,
      name,
      kind: newKind,
      roomId,
      isOn,
      ...defaults,
    });
    setShowAddDevice(false);
    setSelectedId(id);
    requestAnimationFrame(() => sheetRef.current?.present());
  };

  const handleRunScene = (sceneId: string) => {
    const scene = scenesAll.find((s) => s.id === sceneId);
    if (!scene) return;
    const deviceMap = new Map(devicesAll.map((d) => [d.id, d]));
    const patches = scene.actions
      .map((action) => {
        const device = deviceMap.get(action.deviceId);
        if (!device) return null;
        if (action.type === "toggle") {
          return { id: device.id, patch: { isOn: device.isOn } };
        }
        const prev: Partial<Device> = {};
        Object.keys(action.patch).forEach((key) => {
          (prev as any)[key] = (device as any)[key];
        });
        return { id: device.id, patch: prev };
      })
      .filter(Boolean) as Array<{ id: string; patch: Partial<Device> }>;

    runScene(sceneId);

    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoScene({ label: scene.name, patches });
    undoTimer.current = setTimeout(() => setUndoScene(null), 5000);
  };

  return (
    <LinearGradient colors={[theme.colors.bg1, theme.colors.bg0]} style={styles.root}>
      <BackgroundLines />

      <View
        style={contentStyle}
      >
        <FrameComponent
          enabled={frameEnabled}
          width="100%"
          pad={framePad}
          radius={frameRadius}
          style={frameStyle}
        >
          <View style={topRowStyle}>
          <Pressable
            style={iconButtonStyle}
            onPress={() => navigation.goBack()}
          >
            <Ionicons
              name="chevron-back"
              size={Math.round(20 * scale)}
              color={theme.colors.text}
            />
          </Pressable>

          <View style={headerCenterStyle}>
            <Text style={titleTextStyle}>
              {isWholeHome ? "Whole Home" : (room?.name ?? "Room")}
            </Text>
            <Text style={subTextStyle}>
              {running} running • {devices.length} total
            </Text>
          </View>

          {isWholeHome ? (
            <View style={headerSlotStyle} />
          ) : (
            <Pressable
              style={iconButtonStyle}
              onPress={handleAddDevice}
            >
              <Ionicons
                name="add"
                size={Math.round(20 * scale)}
                color={theme.colors.text}
              />
            </Pressable>
          )}
        </View>

          <RoomScenesRow
            scenes={scenes}
            onRun={handleRunScene}
            horizontalInset={contentInset}
          />

          <FlatList
            key={`room-grid-${columns}`}
            data={devices}
            keyExtractor={(d) => d.id}
            numColumns={columns}
            columnWrapperStyle={columnWrapperStyle}
            contentContainerStyle={gridContentStyle}
            style={gridListStyle}
            renderItem={({ item }) => (
              <DeviceTile
                device={item}
                onPress={() =>
                  navigation.navigate("DeviceDetail", { deviceId: item.id })
                }
                onLongPress={() => {
                  setSelectedId(item.id);
                  // Delay to the next frame so state updates before the sheet reads `selected`.
                  requestAnimationFrame(() => sheetRef.current?.present());
                }}
              />
            )}
          />
        </FrameComponent>
      </View>

      {undoScene ? (
        <View style={undoBarStyle}>
          <Text style={styles.undoText}>{undoScene.label} applied</Text>
          <Pressable
            onPress={() => {
              undoScene.patches.forEach((p) => setDevice(p.id, p.patch));
              setUndoScene(null);
            }}
          >
            <Text style={styles.undoAction}>Undo</Text>
          </Pressable>
        </View>
      ) : null}

      <DeviceBottomSheet
        ref={sheetRef}
        device={selected}
        onClose={() => sheetRef.current?.dismiss()}
        onOpenDetails={() => {
          if (!selectedId) return;
          sheetRef.current?.dismiss();
          navigation.navigate("DeviceDetail", { deviceId: selectedId });
        }}
        onGoToAutomations={() => {
          sheetRef.current?.dismiss();
          // Jump to the Automations tab (typing is simplified here; can be refined
          // by properly typing nested navigators).
          navigation.navigate("Main" as any, { screen: "Automations" } as any);
        }}
        onToggle={() => {
          if (!selectedId) return;
          deviceClient
            .sendCommand({
              op: "set-properties",
              deviceId: selectedId,
              changes: { isOn: !(selected?.isOn ?? false) },
            })
            .catch(() => {});
        }}
        onQuickSchedule={(time) => {
          if (!selectedId) return;
          quickScheduleDevice(selectedId, time);
        }}
        onDelete={() => {
          if (!selectedId) return;
          removeDevice(selectedId);
          setSelectedId(null);
        }}
      />

      <ModalCard
        visible={showAddDevice}
        onRequestClose={() => setShowAddDevice(false)}
        onBackdropPress={() => setShowAddDevice(false)}
        colors={["rgba(255,255,255,0.96)", "rgba(246,238,255,0.90)"]}
        cardStyle={modalCardStyle}
      >
        <Text style={modalTitleTextStyle}>Add device</Text>
        <Text style={modalSubTextStyle}>
          Choose a device type and name.
        </Text>

        <ModalField label="Device type" labelStyle={modalLabelTextStyle}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.deviceTypeRow}
          >
            {DEVICE_OPTIONS.map((option) => {
              const active = option.kind === newKind;
              return (
                <Pressable
                  key={option.kind}
                  style={modalTypePillStyle(active)}
                  onPress={() => {
                    setNewKind(option.kind);
                    if (option.kind !== "washer" && option.kind !== "dryer") {
                      setStackLaundry(false);
                    }
                    if (!nameTouched) setNewName(option.defaultName);
                  }}
                >
                  <DeviceIcon
                    kind={option.kind}
                    size={16}
                    color={active ? "#fff" : "rgba(12,12,18,0.7)"}
                  />
                  <Text style={modalTypeTextStyle(active)}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </ModalField>

        {(newKind === "washer" || newKind === "dryer") && (
          <ModalField
            label="Laundry setup"
            labelStyle={modalLabelTextStyle}
            hint={
              stackLaundry
                ? "Creates both washer + dryer and links them."
                : `Adds just this ${newKind}.`
            }
            hintStyle={styles.stackHint}
          >
            <View style={styles.stackRow}>
              <Pressable
                style={modalStackPillStyle(!stackLaundry)}
                onPress={() => setStackLaundry(false)}
              >
                <Text style={modalStackPillTextStyle(!stackLaundry)}>
                  Single unit
                </Text>
              </Pressable>
              <Pressable
                style={modalStackPillStyle(stackLaundry)}
                onPress={() => setStackLaundry(true)}
              >
                <Text style={modalStackPillTextStyle(stackLaundry)}>
                  Stacked pair
                </Text>
              </Pressable>
            </View>
          </ModalField>
        )}

        <ModalField label="Name" labelStyle={modalLabelTextStyle}>
          <TextInput
            value={newName}
            onChangeText={(value) => {
              setNameTouched(true);
              setNewName(value);
            }}
            placeholder="Device name"
            placeholderTextColor="rgba(12,12,18,0.45)"
            style={modalInputStyle}
          />
        </ModalField>

        <ModalActionRow
          style={styles.modalRow}
          actions={[
            {
              label: "Cancel",
              onPress: () => setShowAddDevice(false),
              style: modalGhostButtonStyle,
              textStyle: modalGhostTextStyle,
            },
            {
              label: "Add device",
              onPress: handleCreateDevice,
              style: modalPrimaryButtonStyle(!newName.trim()),
              textStyle: modalPrimaryTextStyle,
              disabled: !newName.trim(),
            },
          ]}
        />
      </ModalCard>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, alignSelf: "stretch" },
  gridList: { width: "100%", alignSelf: "stretch", flex: 1 },
  gridContent: { width: "100%", flexGrow: 1 },
  gridRow: { width: "100%" },
  landscapeGrid: { width: "100%", alignSelf: "stretch" },
  portraitGrid: { width: "100%", alignSelf: "stretch" },
  landscapeGridRow: { justifyContent: "space-between" },
  portraitGridRow: { justifyContent: "flex-start" },
  frameFill: { flex: 1, alignSelf: "stretch" },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnSpacer: { width: 40, height: 40 },
  title: { color: theme.colors.text, fontWeight: "900" },
  sub: {
    color: theme.colors.subtext,
    fontWeight: "700",
    marginTop: 6,
    fontSize: 12,
  },
  undoBar: {
    position: "absolute",
    bottom: 22,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  undoText: { color: "rgba(12,12,18,0.7)", fontWeight: "800" },
  undoAction: { color: "#6B3CFF", fontWeight: "900" },
  modalCard: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  modalTitle: { color: "#1B1535", fontWeight: "900", fontSize: 18 },
  modalSub: { color: "rgba(12,12,18,0.55)", fontWeight: "700", marginTop: 6 },
  modalLabel: {
    color: "rgba(12,12,18,0.6)",
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 6,
  },
  deviceTypeRow: { gap: 10, paddingVertical: 6 },
  deviceTypePill: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  deviceTypePillActive: {
    backgroundColor: "#6B3CFF",
    borderColor: "#6B3CFF",
  },
  deviceTypeText: {
    color: "rgba(12,12,18,0.7)",
    fontWeight: "800",
    fontSize: 12,
  },
  deviceTypeTextActive: { color: "#fff" },
  stackRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    marginBottom: 6,
  },
  stackPill: {
    flex: 1,
    height: 38,
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
  stackHint: {
    color: "rgba(12,12,18,0.5)",
    fontWeight: "700",
    marginBottom: 6,
  },
  modalInput: {
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(12,12,18,0.04)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    paddingHorizontal: 12,
    color: "#1B1535",
    fontWeight: "700",
  },
  modalRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalGhost: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalGhostText: { color: "rgba(12,12,18,0.7)", fontWeight: "800" },
  modalPrimary: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#6B3CFF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryDisabled: { opacity: 0.5 },
  modalPrimaryText: { color: "#fff", fontWeight: "900" },
});
