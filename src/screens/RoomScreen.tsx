import { AppFeedback as Alert } from "../services/appFeedback";
import React, { Suspense, useMemo, useRef, useState } from "react";
import { useShallow } from 'zustand/react/shallow';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useWindowDimensions,
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
import { canRegisterSimulationDevice } from "../services/simulationDeviceRegistration";
import { deviceArtwork } from "../features/cinematic-artwork/artwork";

// Load the placement renderer only when an administrator opens device setup.
const SimulationDeviceWizard = React.lazy(() => import("../features/devices/SimulationDeviceWizard"));

type Props = NativeStackScreenProps<RootStackParamList, "Room">;

/** Present room devices as a viewport-sized collection with direct controls. */
export default function RoomScreen({ route, navigation }: Props) {
  const { width, gutter, isTablet, isLandscape, scale } = useResponsive(1200);
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 12);
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
  const undoBarStyle = useMemo(() => StyleSheet.create({
    frame: { width: frameWidth, height: undoHeight, borderRadius: undoRadius, bottom: safeBottom },
  }).frame, [frameWidth, undoHeight, undoRadius, safeBottom]);
  const { roomId, showAll } = route.params;
  const isWholeHome = Boolean(showAll);

  const modelHome = useHomeStore(isModelHome);
  const simulationBindings = useHomeStore(useShallow(selectSimulationDeviceBindings));
  const simulation = useSimulationControls(Object.keys(simulationBindings).length > 0);
  const modelRoom = modelHome ? ROOMS.find((candidate) => candidate.id === roomId) : undefined;
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
  const canAddDevices = useHomeStore(canRegisterSimulationDevice);
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
  React.useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

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

  return (
    <>
      <DeepScreen
        title={isWholeHome ? "Whole home" : (room?.name ?? "Room")}
        eyebrow={isWholeHome ? "HOME CONTROLS" : modelRoom ? `${modelRoom.outdoor ? "OUTSIDE" : modelRoom.floor === "upper" ? "UPPER FLOOR" : "GROUND FLOOR"} · ${modelRoom.area}` : "ROOM CONTROLS"}
        subtitle={`${running} active · ${devices.length} devices`}
        onBack={() => navigation.goBack()}
        actions={canAddDevices ? <DeepAction label="Add" accessibilityLabel="Add a device" icon="add" onPress={() => setShowAddDevice(true)} /> : undefined}
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
        <View style={[styles.undoBar, undoBarStyle]}>
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

      {showAddDevice && <Suspense fallback={null}><SimulationDeviceWizard initialRoomId={roomId} onClose={() => setShowAddDevice(false)}
        onSaved={(deviceId) => { setShowAddDevice(false); navigation.navigate("DeviceDetail", { deviceId }); }} /></Suspense>}

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
});
