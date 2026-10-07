import React, { useMemo, useRef, useState } from "react";
import { useShallow } from 'zustand/react/shallow';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ScrollView,
  Alert,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Pressable from "../components/Pressable";
import { DeepAction, DeepPager, DeepScreen } from "../components/deep/DeepScreen";
import Ionicons from "@expo/vector-icons/Ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { RootStackParamList } from "../app/AppNavigator";
import { openHomeFeature } from "../app/homeNavigation";
import RoomScenesRow from "../components/RoomScenesRow";
import DeviceCollectionCard, { DEVICE_COLLECTION_CARD_MIN_HEIGHT } from "../components/DeviceCollectionCard";
import DeviceBottomSheet from "../components/DeviceBottomSheet";
import DeviceIcon from "../components/DeviceIcon";
import ModalCard from "../components/ModalCard";
import ModalForm, { useModalViewportStyle } from "../components/ModalForm";
import ModalActionRow from "../components/ModalActionRow";
import ModalField from "../components/ModalField";
import { theme } from "../theme/theme";
import {
  selectVisibleDevices,
  selectVisibleRooms,
  useHomeStore,
  type Device,
} from "../store/useHomeStore";
import { useResponsive } from "../theme/layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { runtimePolicy } from "../config/runtimeMode";
import { captureSceneScope, executeSceneCommands, type SceneScope } from "../services/sceneExecution";
import { canManageRoutines } from "../store/routineAccess";
import { getDevice, ROOMS } from "../../packages/home-scene/src/data";
import { roomDevicePresentation } from "../features/rooms/roomDevicePresentation";
import { runNativeRoomQuickAction } from "../features/rooms/roomDeviceActions";
import { isModelHome } from "../features/three-d-home/modelHomeScope";
import { useSimulationControls } from "../features/three-d-home/useSimulationControls";
import { selectSimulationDeviceBindings } from "../features/three-d-home/simulationDeviceBindings";
import { sceneIsVisible } from "../features/scenes/sceneScope";
import { selectHomeNavigationAccess } from "../features/home-shell/homeNavigationAccess";
import { deviceArtwork } from "../features/cinematic-artwork/artwork";

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

/** Supply the initial control values for a newly added room device. */
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

/** Present room devices as a viewport-sized collection with direct controls. */
export default function RoomScreen({ route, navigation }: Props) {
  const { width, contentWidth, gutter, isTablet, isLandscape, scale } = useResponsive(1200);
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 12);
  const modalViewportStyle = useModalViewportStyle();
  const frameWidth = Math.max(0, width - gutter * 2);
  const listGap = isTablet ? 16 : 12;
  const { fontScale } = useWindowDimensions();
  const columns = fontScale > 1.25 ? (isTablet ? 2 : 1) : isTablet ? (isLandscape ? 4 : 3) : 2;
  const [page, setPage] = useState(0);
  const [gridHeight, setGridHeight] = useState(440);
  const [gridWidth, setGridWidth] = useState(Math.max(0, width - 32));
  // Trade page capacity for readable text while keeping every card inside the available viewport.
  const rows = Math.max(1, Math.floor((gridHeight + listGap) / (DEVICE_COLLECTION_CARD_MIN_HEIGHT * Math.max(1, fontScale) + listGap)));
  const cardFrameStyle = useMemo(() => StyleSheet.create({
    frame: {
      flexGrow: 0,
      flexShrink: 0,
      width: Math.max(0, (gridWidth - (columns - 1) * listGap) / columns),
      height: Math.min(
        260 * Math.max(1, fontScale),
        Math.max(0, (gridHeight - (rows - 1) * listGap) / rows),
      ),
    },
  }).frame, [gridHeight, gridWidth, rows, columns, listGap, fontScale]);
  const pageSize = columns * rows;
  const gridSpacingStyle = isTablet ? styles.tabletGridSpacing : styles.phoneGridSpacing;
  const columnWrapperStyle = [styles.gridRow, gridSpacingStyle];
  const gridContentStyle = [styles.gridContent, gridSpacingStyle];
  const undoHeight = Math.round((isTablet ? 54 : 48) * scale);
  const undoRadius = 16;
  const modalPad = Math.round((isTablet ? 20 : 16) * scale);
  const modalRadius = 22;
  const modalTitleSize = Math.round((isTablet ? 20 : 18) * scale);
  const modalSubSize = Math.round((isTablet ? 14 : 12) * scale);
  const modalLabelSize = Math.round((isTablet ? 13 : 12) * scale);
  const modalInputHeight = Math.max(44, Math.round(48 * scale));
  const modalPillHeight = Math.max(44, Math.round(44 * scale));
  const modalButtonHeight = Math.max(44, Math.round(46 * scale));
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
      borderRadius: theme.radius.sm,
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

  const modelHome = useHomeStore(isModelHome);
  const simulationBindings = useHomeStore(useShallow(selectSimulationDeviceBindings));
  const simulation = useSimulationControls(Object.keys(simulationBindings).length > 0);
  const modelRoom = modelHome ? ROOMS.find((candidate) => candidate.id === roomId) : undefined;
  const modeledRoom = Boolean(modelRoom);
  const visibleRooms = useHomeStore(useShallow(selectVisibleRooms));
  const room = roomId
    ? visibleRooms.find((r) => r.id === roomId)
    : undefined;
  const devicesAll = useHomeStore(useShallow(selectVisibleDevices));
  const scenesAll = useHomeStore((s) => s.scenes);
  const runScene = useHomeStore((s) => s.runScene);

  const commandScope = useHomeStore(useShallow((state) => ({
    userId: state.authenticatedUserId,
    homeId: state.activeHomeId,
    sessionEpoch: state.sessionEpoch,
  })));
  const setDevice = useHomeStore((s) => s.setDevice);
  const quickScheduleDevice = useHomeStore((s) => s.quickScheduleDevice);
  const canCreateRoutines = useHomeStore(canManageRoutines);
  const addDevice = useHomeStore((s) => s.addDevice);
  const removeDevice = useHomeStore((s) => s.removeDevice);

  /** Resolve native access at press time; model mutations retain their existing live scope guard. */
  async function handleDeviceQuickAction(device: Device) {
    try {
      await runNativeRoomQuickAction(device.id, () => {
        sheetRef.current?.dismiss();
        navigation.navigate("DeviceDetail", { deviceId: device.id });
      }, commandScope, simulation.client);
    } catch (error) {
      Alert.alert("Action not completed", error instanceof Error ? error.message : "Check home access and device status before trying again.");
    }
  }

  /** Read virtual devices from the same account-local snapshot as voice and 3D controls. */
  function devicePresentation(device: Device) {
    const modelId = simulationBindings[device.id];
    const modelState = simulation.ready && modelId && simulation.access?.deviceIds.includes(modelId)
      ? simulation.state.deviceStates[modelId] : undefined;
    return roomDevicePresentation(device, modelState, modelId);
  }

  // Derived data for this room.
  const devices = useMemo(
    () =>
      isWholeHome ? devicesAll : devicesAll.filter((d) => d.roomId === roomId),
    [devicesAll, roomId, isWholeHome],
  );
  const scenes = useMemo(() => {
    if (!canCreateRoutines) return [];
    const visibleScenes = scenesAll.filter((scene) => sceneIsVisible(scene, visibleRooms, devicesAll));
    return isWholeHome
      ? visibleScenes
      : visibleScenes.filter((scene) => scene.roomId === roomId);
  }, [scenesAll, visibleRooms, devicesAll, roomId, isWholeHome, canCreateRoutines]);
  const running = devices.filter((device) => devicePresentation(device).active).length;
  const pageCount = Math.max(1, Math.ceil(devices.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleDevices = devices.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  // Bottom sheet state: we keep only the selected ID and derive the device
  // object from the store so the sheet stays in sync with slider changes.
  const sheetRef = useRef<BottomSheetModal>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => devicesAll.find((d) => d.id === selectedId),
    [devicesAll, selectedId],
  );

  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneRequestPending = useRef(false);
  const [undoScene, setUndoScene] = useState<{
    label: string;
    patches: Array<{ id: string; patch: Partial<Device> }>;
    scope: SceneScope;
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
    if (!roomId || isWholeHome || modeledRoom) return;
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

  const handleRunScene = async (sceneId: string) => {
    if (sceneRequestPending.current) return;
    const current = useHomeStore.getState();
    const scene = current.scenes.find((s) => s.id === sceneId);
    if (!selectHomeNavigationAccess(current).scenes || !scene
      || !sceneIsVisible(scene, selectVisibleRooms(current), selectVisibleDevices(current))) return;
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

    const scope = captureSceneScope();
    sceneRequestPending.current = true;
    try {
      await runScene(sceneId);
    } catch {
      if (scope.sessionEpoch === useHomeStore.getState().sessionEpoch) {
        Alert.alert("Scene not completed", "Unable to request every action. Check home access and device status before retrying.");
      }
      return;
    } finally {
      sceneRequestPending.current = false;
    }
    if (scope.sessionEpoch !== useHomeStore.getState().sessionEpoch) return;

    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoScene({ label: scene.name, patches, scope });
    undoTimer.current = setTimeout(() => setUndoScene(null), 5000);
  };

  const modalActions = (
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
  );

  return (
    <>
      <DeepScreen
        title={isWholeHome ? "Whole home" : (room?.name ?? "Room")}
        eyebrow={isWholeHome ? "HOME CONTROLS" : modelRoom ? `${modelRoom.outdoor ? "OUTSIDE" : modelRoom.floor === "upper" ? "UPPER FLOOR" : "GROUND FLOOR"} · ${modelRoom.area}` : "ROOM CONTROLS"}
        subtitle={`${running} active · ${devices.length} devices`}
        onBack={() => navigation.goBack()}
        actions={isWholeHome || modeledRoom ? undefined : <DeepAction label="Add" icon="add" onPress={handleAddDevice} />}
      >
        <RoomScenesRow scenes={scenes} onRun={handleRunScene} horizontalInset={0} />
        <View
          testID="room-device-viewport"
          style={styles.gridViewport}
          onLayout={(event) => {
            const { height, width: measuredWidth } = event.nativeEvent.layout;
            setGridHeight(height);
            if (Number.isFinite(measuredWidth)) setGridWidth(measuredWidth);
          }}
        >
          <FlatList
            key={`room-grid-${columns}`}
            data={visibleDevices}
            keyExtractor={(d) => d.id}
            numColumns={columns}
            columnWrapperStyle={columns > 1 ? columnWrapperStyle : undefined}
            contentContainerStyle={gridContentStyle}
            style={styles.gridList}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyCollection}>
                <Ionicons name="cube-outline" size={28} color={theme.colors.accentText} />
                <Text style={styles.emptyTitle}>No devices yet</Text>
                <Text style={styles.emptySubtitle}>{isWholeHome ? "Devices appear here when added to a room." : "Add a device to start shaping this room."}</Text>
              </View>
            }
            renderItem={({ item }) => {
              const definition = getDevice(item.id);
              const modelId = simulationBindings[item.id];
              const presentation = devicePresentation(item);
              return <View style={cardFrameStyle}>
                <DeviceCollectionCard {...presentation}
                  artwork={deviceArtwork({ ...item, modelDeviceId: modelId ?? item.modelDeviceId })}
                  disabled={Boolean(modelId) ? !simulation.ready || !simulation.access?.controllableDeviceIds.includes(modelId)
                    : Boolean(item.simulationOnly || (modelHome && definition?.kind === item.kind))}
                  onOpen={() => navigation.navigate("DeviceDetail", { deviceId: item.id })}
                  onQuickAction={() => { void handleDeviceQuickAction(item); }}
                  onLongPress={() => {
                    if (modelId || item.simulationOnly || (modelHome && definition?.kind === item.kind)) {
                      navigation.navigate("DeviceDetail", { deviceId: item.id });
                      return;
                    }
                    setSelectedId(item.id);
                    // Wait for the selected device to reach the native sheet before presenting it.
                    requestAnimationFrame(() => sheetRef.current?.present());
                  }} />
              </View>;
            }}
          />
        </View>
        <DeepPager page={currentPage} pageCount={pageCount} onChange={setPage} label="Devices" />
      </DeepScreen>

      {undoScene ? (
        <View style={undoBarStyle}>
          <Text style={styles.undoText}>{undoScene.label} {runtimePolicy.requireRealTransport ? "requested" : "applied"}</Text>
          <Pressable
            onPress={() => {
              const undo = undoScene;
              setUndoScene(null);
              if (!runtimePolicy.requireRealTransport) {
                undo.patches.forEach((p) => setDevice(p.id, p.patch));
                return;
              }
              const actions = undo.patches.flatMap(({ id, patch }) => {
                const known = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
                return Object.keys(known).length ? [{ type: "patch" as const, deviceId: id, patch: known }] : [];
              });
              void executeSceneCommands(actions, undo.scope).catch(() => {
                if (undo.scope.sessionEpoch === useHomeStore.getState().sessionEpoch) {
                  Alert.alert("Undo not completed", "Unable to request every previous setting. Check device status before retrying.");
                }
              });
            }}
          >
            <Text style={styles.undoAction}>Undo</Text>
          </Pressable>
        </View>
      ) : null}

      <DeviceBottomSheet
        canCreateRoutines={canCreateRoutines}
        ref={sheetRef}
        device={selected}
        quickActionLabel={selected ? devicePresentation(selected).quickActionLabel : undefined}
        quickActionActive={selected ? devicePresentation(selected).active : undefined}
        onClose={() => sheetRef.current?.dismiss()}
        onOpenDetails={() => {
          if (!selectedId) return;
          sheetRef.current?.dismiss();
          navigation.navigate("DeviceDetail", { deviceId: selectedId });
        }}
        onGoToAutomations={() => {
          sheetRef.current?.dismiss();
          openHomeFeature(navigation.dispatch, "Automations");
        }}
        onToggle={() => {
          if (selected) void handleDeviceQuickAction(selected);
        }}
        onQuickSchedule={(time) => {
          if (!selectedId) return;
          try {
            const current = useHomeStore.getState();
            if (!canManageRoutines(current) || !selectVisibleDevices(current).some((device) => device.id === selectedId)) throw new Error('Device routine unavailable');
            quickScheduleDevice(selectedId, time);
            const clock = `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
            Alert.alert('Daily routine saved', `Runs every day at ${clock} while VantaHome is open. Review or change it in Routines.`);
          } catch {
            Alert.alert('Routine not saved', 'Your home access or this device changed. Reopen the device and try again.');
          }
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
        colors={[theme.colors.card, theme.colors.card2]}
        cardStyle={[modalCardStyle, modalViewportStyle]}
      >
        <ModalForm footer={modalActions}>
          <Text style={modalTitleTextStyle}>Add device</Text>
          <Text style={modalSubTextStyle}>
            Choose a device type and name.
          </Text>

          <ModalField label="Device type" labelStyle={modalLabelTextStyle}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              bounces={false}
              overScrollMode="never"
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
                      color={active ? theme.colors.bg0 : theme.colors.subtext}
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
              accessibilityLabel="Device name"
              value={newName}
              onChangeText={(value) => {
                setNameTouched(true);
                setNewName(value);
              }}
              placeholder="Device name"
              placeholderTextColor={theme.colors.muted}
              style={modalInputStyle}
            />
          </ModalField>

        </ModalForm>
      </ModalCard>
    </>
  );
}

const styles = StyleSheet.create({
  emptyCollection: { alignItems: "center", padding: 30, gap: 10 },
  emptyTitle: { color: theme.colors.text, fontSize: 20, fontWeight: "500" },
  emptySubtitle: { color: theme.colors.subtext, fontSize: 13, lineHeight: 20, textAlign: "center" },
  phoneGridSpacing: { gap: 12 },
  tabletGridSpacing: { gap: 16 },
  gridViewport: { flex: 1, minHeight: 0, marginTop: 4, overflow: "hidden" },
  gridList: { width: "100%", alignSelf: "stretch", flex: 1 },
  gridContent: { width: "100%" },
  gridRow: { width: "100%", alignItems: "stretch" },
  undoBar: {
    position: "absolute",
    bottom: 22,
    height: 48,
    borderRadius: 16,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  undoText: { color: theme.colors.subtext, fontWeight: "600" },
  undoAction: { color: theme.colors.accentText, fontWeight: "600" },
  modalCard: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  modalTitle: { color: theme.colors.text, fontWeight: "600", fontSize: 18 },
  modalSub: { color: theme.colors.subtext, fontWeight: "400", marginTop: 6 },
  modalLabel: {
    color: theme.colors.subtext,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 6,
  },
  deviceTypeRow: { gap: 10, paddingVertical: 6 },
  deviceTypePill: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: 12,
    height: 44,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bg0,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  deviceTypePillActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  deviceTypeText: {
    color: theme.colors.subtext,
    fontWeight: "600",
    fontSize: 12,
  },
  deviceTypeTextActive: { color: theme.colors.bg0 },
  stackRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    marginBottom: 6,
  },
  stackPill: {
    flex: 1,
    height: 44,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.bg0,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  stackPillActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  stackPillText: { color: theme.colors.subtext, fontWeight: "600" },
  stackPillTextActive: { color: theme.colors.bg0 },
  stackHint: {
    color: theme.colors.subtext,
    fontWeight: "600",
    marginBottom: 6,
  },
  modalInput: {
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.bg0,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    paddingHorizontal: 12,
    color: theme.colors.text,
    fontWeight: "600",
  },
  modalRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalGhost: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  modalGhostText: { color: theme.colors.subtext, fontWeight: "600" },
  modalPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryDisabled: { opacity: 0.5 },
  modalPrimaryText: { color: theme.colors.bg0, fontWeight: "600" },
});
