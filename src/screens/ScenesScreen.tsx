import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Animated,
} from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { theme } from "../theme/theme";
import BackgroundLines from "../components/BackgroundLines";
import ScreenFrame from "../components/ScreenFrame";
import ScreenSectionLayout from "../components/ScreenSectionLayout";
import SectionHeader from "../components/layout/SectionHeader";
import HeaderPill from "../components/HeaderPill";
import ModalCard from "../components/ModalCard";
import ModalActionRow from "../components/ModalActionRow";
import ModalField from "../components/ModalField";
import DeviceIcon from "../components/DeviceIcon";
import {
  AC_TEMP_MAX_C,
  AC_TEMP_MIN_C,
  selectVisibleDevices,
  selectVisibleRooms,
  useHomeStore,
  type Device,
  type Scene,
  type SceneAction,
} from "../store/useHomeStore";
import { useResponsive } from "../theme/layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ScenesScreen() {
  const { width, contentWidth, gutter, topPad, isTablet, isLandscape, scale } =
    useResponsive(920);
  const minSize = Math.min(width, contentWidth);
  const isCompactPhone = !isTablet && minSize < 360;
  const isWide = isTablet && isLandscape;
  const isPortrait = !isLandscape;
  const titleSize = Math.round(
    (isTablet ? 32 : isCompactPhone ? 24 : 26) * scale,
  );
  const subtitleSize = Math.round(
    (isTablet ? 15 : isCompactPhone ? 11 : 12) * scale,
  );
  const pillHeight = Math.round(
    (isTablet ? 36 : isCompactPhone ? 28 : 30) * scale,
  );
  const pillText = Math.round(
    (isTablet ? 13 : isCompactPhone ? 10 : 11) * scale,
  );
  const sectionTitleSize = Math.round(
    (isTablet ? 18 : isCompactPhone ? 14 : 15) * scale,
  );
  const sectionSubSize = Math.round(
    (isTablet ? 13 : isCompactPhone ? 11 : 12) * scale,
  );
  const cardPad = Math.round((isTablet ? 18 : isCompactPhone ? 12 : 14) * scale);
  const cardRadius = Math.round(
    (isTablet ? 24 : isCompactPhone ? 18 : 20) * scale,
  );
  const framePad = Math.round((isTablet ? 14 : isCompactPhone ? 8 : 10) * scale);
  const frameRadius = Math.round(
    (isTablet ? 30 : isCompactPhone ? 22 : 26) * scale,
  );
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
  const gridGap = Math.round(
    (isTablet ? 18 : isCompactPhone ? 10 : 12) * scale,
  );
  const dividerPad = Math.round(
    (isTablet ? 16 : isCompactPhone ? 10 : 12) * scale,
  );
  const scrollTopPad = 0;
  const scrollBottomPad = Math.round(gridGap * 1.2);
  const panelPad = Math.round((isTablet ? 18 : isCompactPhone ? 12 : 14) * scale);
  const panelRadius = Math.round(
    (isTablet ? 26 : isCompactPhone ? 18 : 22) * scale,
  );
  const minSectionWidth = Math.round(
    (isTablet ? 320 : isCompactPhone ? 240 : 260) * scale,
  );
  const modalPad = Math.round((isTablet ? 20 : isCompactPhone ? 14 : 16) * scale);
  const modalRadius = Math.round(
    (isTablet ? 26 : isCompactPhone ? 20 : 22) * scale,
  );
  const modalTitleSize = Math.round(
    (isTablet ? 20 : isCompactPhone ? 16 : 17) * scale,
  );
  const modalSubSize = Math.round(
    (isTablet ? 14 : isCompactPhone ? 11 : 12) * scale,
  );
  const modalLabelSize = Math.round(
    (isTablet ? 13 : isCompactPhone ? 11 : 12) * scale,
  );
  const modalInputHeight = Math.round(
    (isTablet ? 48 : isCompactPhone ? 40 : 44) * scale,
  );
  const modalBtnHeight = Math.round(
    (isTablet ? 46 : isCompactPhone ? 40 : 44) * scale,
  );
  const roomPillHeight = Math.round(
    (isTablet ? 36 : isCompactPhone ? 30 : 32) * scale,
  );
  const deviceChipHeight = Math.round(
    (isTablet ? 40 : isCompactPhone ? 32 : 34) * scale,
  );
  const insets = useSafeAreaInsets();
  const tabInset = isTablet ? (isLandscape ? 28 : 24) : gutter;
  const tabBarInset = insets.bottom > 0 ? insets.bottom + 8 : tabInset;
  const tabBarHeight = Math.round(
    (isTablet ? (isLandscape ? 74 : 72) : isCompactPhone ? 62 : 66) * scale,
  );
  const tabBarGap = Math.round((isTablet ? 12 : 8) * scale);
  const tabBarPad = tabBarInset + tabBarHeight + tabBarGap;
  const rooms = useHomeStore(selectVisibleRooms);
  const scenes = useHomeStore((s) => s.scenes);
  const devices = useHomeStore(selectVisibleDevices);
  const runScene = useHomeStore((s) => s.runScene);
  const clearActiveScene = useHomeStore((s) => s.clearActiveScene);
  const activeSceneId = useHomeStore((s) => s.activeSceneId);
  const addScene = useHomeStore((s) => s.addScene);
  const updateScene = useHomeStore((s) => s.updateScene);

  const [showCreate, setShowCreate] = useState(false);
  const [sceneName, setSceneName] = useState("");
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Partial<Device>>>(
    {},
  );
  const [detailSceneId, setDetailSceneId] = useState<string | null>(null);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);

  const deviceMap = useMemo(
    () => new Map(devices.map((d) => [d.id, d])),
    [devices],
  );
  const roomDevices = useMemo(
    () => devices.filter((d) => d.roomId === roomId),
    [devices, roomId],
  );
  const detailScene = useMemo(
    () => scenes.find((scene) => scene.id === detailSceneId) ?? null,
    [detailSceneId, scenes],
  );
  const detailRoom = useMemo(() => {
    if (!detailScene) return null;
    return rooms.find((room) => room.id === detailScene.roomId) ?? null;
  }, [detailScene, rooms]);
  const detailActionLabels = useMemo(() => {
    if (!detailScene) return [];
    return detailScene.actions.map((action) => formatAction(action, deviceMap));
  }, [detailScene, deviceMap]);
  const detailDevices = useMemo(() => {
    if (!detailScene) return [];
    const ids = Array.from(
      new Set(detailScene.actions.map((action) => action.deviceId)),
    );
    return ids.map((id) => deviceMap.get(id)).filter(Boolean) as Device[];
  }, [detailScene, deviceMap]);
  const sections = useMemo(
    () =>
      rooms.map((room) => ({
        room,
        scenes: scenes.filter((s) => s.roomId === room.id),
      })),
    [rooms, scenes],
  );
  const frameEnabled = isPortrait || isWide;
  const frameWidth = isTablet
    ? undefined
    : Math.max(0, contentWidth - outerGutter * 2);
  const frameInnerWidth = Math.max(
    0,
    (frameWidth ?? contentWidth) - (frameEnabled ? framePad * 2 : 0),
  );
  const columnCount = useMemo(() => {
    if (!isWide) return 1;
    const availableWidth = width - outerGutter * 2 - innerGutter * 2;
    const maxColumns = Math.floor(
      (availableWidth + gridGap) / (minSectionWidth + gridGap),
    );
    return Math.max(1, Math.min(3, maxColumns));
  }, [
    gridGap,
    innerGutter,
    isWide,
    minSectionWidth,
    outerGutter,
    width,
  ]);
  const sceneColumns = useMemo(() => {
    const columns = Array.from(
      { length: columnCount },
      () => [] as typeof sections,
    );
    sections.forEach((section, index) => {
      columns[index % columnCount].push(section);
    });
    return columns;
  }, [columnCount, sections]);

  useEffect(() => {
    if (!rooms.length) {
      setRoomId("");
      return;
    }
    if (!roomId || !rooms.find((r) => r.id === roomId)) {
      setRoomId(rooms[0].id);
      setSelectedDeviceIds([]);
      setOverrides({});
    }
  }, [rooms, roomId]);

  const canCreate = Boolean(roomId && selectedDeviceIds.length > 0);
  const contentStyle: StyleProp<ViewStyle> = [
    styles.content,
    {
      paddingHorizontal: outerGutter,
      paddingTop: topPad,
      paddingBottom: tabBarPad,
    },
  ];
  const headerWrapStyle: StyleProp<ViewStyle> = {
    paddingHorizontal: innerGutter,
  };
  const headerStyle: StyleProp<ViewStyle> = [
    styles.header,
    !isTablet && styles.headerPhone,
    isCompactPhone && styles.headerCompact,
  ];
  const headerActionsStyle: StyleProp<ViewStyle> = [
    styles.headerActions,
    !isTablet && styles.headerActionsPhone,
    isCompactPhone && styles.headerActionsCompact,
  ];
  const headerTitleStyle: StyleProp<TextStyle> = [
    styles.h1,
    { fontSize: titleSize },
  ];
  const headerSubtitleStyle: StyleProp<TextStyle> = [
    styles.p,
    { fontSize: subtitleSize },
  ];
  const countPillStyle: StyleProp<ViewStyle> = [
    styles.countPill,
    { height: pillHeight, borderRadius: Math.round(pillHeight / 2) },
    !isTablet && styles.headerActionPillPhone,
    isCompactPhone && { paddingHorizontal: 10 },
  ];
  const countTextStyle: StyleProp<TextStyle> = [
    styles.countText,
    { fontSize: pillText },
  ];
  const clearPillStyle: StyleProp<ViewStyle> = [
    styles.clearPill,
    { height: pillHeight, borderRadius: Math.round(pillHeight / 2) },
    !isTablet && styles.headerActionPillPhoneFull,
    isCompactPhone && { paddingHorizontal: 10 },
  ];
  const clearTextStyle: StyleProp<TextStyle> = [
    styles.clearText,
    { fontSize: pillText },
  ];
  const addPillStyle: StyleProp<ViewStyle> = [
    styles.addPill,
    { height: pillHeight, borderRadius: Math.round(pillHeight / 2) },
    !isTablet && styles.headerActionPillPhone,
    isCompactPhone && { paddingHorizontal: 10 },
  ];
  const addTextStyle: StyleProp<TextStyle> = [
    styles.addText,
    { fontSize: pillText },
  ];
  const headerDividerWrapStyle: StyleProp<ViewStyle> = {
    paddingVertical: dividerPad,
  };
  const sectionsScrollContentStyle: StyleProp<ViewStyle> = {
    paddingTop: scrollTopPad,
    paddingBottom: scrollBottomPad,
    paddingHorizontal: innerGutter,
  };
  const sectionsGridLandscapeStyle: StyleProp<ViewStyle> = [
    styles.sectionsGrid,
    styles.sectionsGridLandscape,
    { gap: gridGap },
  ];
  const sectionsColumnStyle: StyleProp<ViewStyle> = [
    styles.sectionsColumn,
    { gap: gridGap },
  ];
  const sectionStyle: StyleProp<ViewStyle> = [
    styles.section,
    { marginTop: isWide ? 0 : gridGap, width: "100%" },
  ];
  const roomPanelStyle: StyleProp<ViewStyle> = [
    styles.roomPanel,
    { padding: panelPad, borderRadius: panelRadius },
  ];
  const sectionTitleStyle: StyleProp<TextStyle> = [
    styles.sectionTitle,
    { fontSize: sectionTitleSize },
  ];
  const sectionSubStyle: StyleProp<TextStyle> = [
    styles.sectionSub,
    { fontSize: sectionSubSize },
  ];
  const emptyCardStyle: StyleProp<ViewStyle> = [
    styles.emptyCard,
    { padding: cardPad, borderRadius: cardRadius },
  ];
  const modalCardStyle: StyleProp<ViewStyle> = [
    styles.modalCard,
    {
      borderRadius: modalRadius,
      maxWidth: isTablet ? 640 : undefined,
      width: isTablet ? Math.min(contentWidth - gutter * 2, 640) : undefined,
      alignSelf: isTablet ? "center" : "stretch",
    },
  ];
  const modalContentStyle: StyleProp<ViewStyle> = [
    styles.modalContent,
    { padding: modalPad },
  ];
  const modalTitleStyle: StyleProp<TextStyle> = [
    styles.modalTitle,
    { fontSize: modalTitleSize },
  ];
  const modalSubStyle: StyleProp<TextStyle> = [
    styles.modalSub,
    { fontSize: modalSubSize },
  ];
  const modalLabelStyle: StyleProp<TextStyle> = [
    styles.modalLabel,
    { fontSize: modalLabelSize },
  ];
  const modalHintStyle: StyleProp<TextStyle> = [
    styles.modalHint,
    { fontSize: modalSubSize },
  ];
  const modalInputStyle: StyleProp<ViewStyle> = [
    styles.modalInput,
    {
      height: modalInputHeight,
      borderRadius: Math.round(modalInputHeight * 0.28),
    },
  ];
  const modalGhostStyle: StyleProp<ViewStyle> = [
    styles.modalGhost,
    {
      height: modalBtnHeight,
      borderRadius: Math.round(modalBtnHeight * 0.28),
    },
  ];
  const modalGhostTextStyle: StyleProp<TextStyle> = [
    styles.modalGhostText,
    { fontSize: modalLabelSize },
  ];
  const modalPrimaryBaseStyle: StyleProp<ViewStyle> = [
    styles.modalPrimary,
    {
      height: modalBtnHeight,
      borderRadius: Math.round(modalBtnHeight * 0.28),
    },
  ];
  const modalPrimaryStyle: StyleProp<ViewStyle> = [
    modalPrimaryBaseStyle,
    !canCreate && styles.modalPrimaryDisabled,
  ];
  const modalPrimaryTextStyle: StyleProp<TextStyle> = [
    styles.modalPrimaryText,
    { fontSize: modalLabelSize },
  ];
  const roomPillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.roomPill,
    { height: roomPillHeight, borderRadius: Math.round(roomPillHeight / 2) },
    active && styles.roomPillActive,
  ];
  const roomPillTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.roomPillText,
    { fontSize: modalLabelSize },
    active && styles.roomPillTextActive,
  ];
  const deviceChipStyle = (active?: boolean): StyleProp<ViewStyle> => [
    styles.deviceChip,
    {
      height: deviceChipHeight,
      borderRadius: Math.round(deviceChipHeight * 0.4),
    },
    active && styles.deviceChipActive,
  ];
  const deviceIconStyle = (active?: boolean): StyleProp<ViewStyle> => [
    styles.deviceIcon,
    active && styles.deviceIconActive,
  ];
  const deviceTextStyle = (active?: boolean): StyleProp<TextStyle> => [
    styles.deviceText,
    { fontSize: modalLabelSize },
    active && styles.deviceTextActive,
  ];
  const detailStatusPillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.detailStatusPill,
    {
      height: roomPillHeight,
      borderRadius: Math.round(roomPillHeight / 2),
    },
    active && styles.detailStatusPillActive,
  ];
  const detailStatusTextStyle: StyleProp<TextStyle> = [
    styles.detailStatusText,
    { fontSize: modalLabelSize },
  ];
  const detailActionTextStyle: StyleProp<TextStyle> = [
    styles.detailActionText,
    { fontSize: modalLabelSize },
  ];

  const openCreate = () => {
    setShowCreate(true);
    setEditingSceneId(null);
    setSceneName("");
    setSelectedDeviceIds([]);
    setOverrides({});
  };

  const handleCreate = () => {
    if (!roomId) return;
    const room = rooms.find((r) => r.id === roomId);
    const name = sceneName.trim() || `${room?.name ?? "Room"} Scene`;
    const actions = selectedDeviceIds
      .map((id) => deviceMap.get(id))
      .filter(Boolean)
      .map((device) =>
        buildSceneAction(device as Device, overrides[(device as Device).id]),
      );
    if (!actions.length) return;

    if (editingSceneId) {
      updateScene(editingSceneId, { roomId, name, actions });
    } else {
      addScene({ roomId, name, actions });
    }
    setShowCreate(false);
    setSceneName("");
    setSelectedDeviceIds([]);
    setOverrides({});
    setEditingSceneId(null);
  };

  const openEdit = (scene: Scene) => {
    setEditingSceneId(scene.id);
    setShowCreate(true);
    setSceneName(scene.name);
    setRoomId(scene.roomId);
    const deviceIds = Array.from(
      new Set(scene.actions.map((action) => action.deviceId)),
    );
    setSelectedDeviceIds(deviceIds);
    const nextOverrides: Record<string, Partial<Device>> = {};
    scene.actions.forEach((action) => {
      if (action.type === "toggle") {
        nextOverrides[action.deviceId] = { isOn: action.on ?? true };
        return;
      }
      nextOverrides[action.deviceId] = { ...action.patch };
    });
    setOverrides(nextOverrides);
  };

  const updateOverride = (deviceId: string, patch: Partial<Device>) => {
    setOverrides((prev) => ({
      ...prev,
      [deviceId]: { ...prev[deviceId], ...patch },
    }));
  };

  const toggleDeviceSelection = (device: Device) => {
    setSelectedDeviceIds((prev) => {
      const isSelected = prev.includes(device.id);
      setOverrides((current) => {
        const next = { ...current };
        if (isSelected) {
          delete next[device.id];
        } else if (!next[device.id]) {
          next[device.id] = {};
        }
        return next;
      });
      return isSelected
        ? prev.filter((id) => id !== device.id)
        : [...prev, device.id];
    });
  };

  const renderSection = ({
    room,
    scenes: roomScenes,
  }: (typeof sections)[number]) => (
    <View key={room.id} style={sectionStyle}>
      <View style={roomPanelStyle}>
        <SectionHeader
          title={room.name}
          subtitle={`${roomScenes.length} presets`}
          style={styles.sectionHeader}
          titleStyle={sectionTitleStyle}
          subtitleStyle={sectionSubStyle}
        />

        {roomScenes.length === 0 ? (
          <View style={emptyCardStyle}>
            <Text style={styles.emptyTitle}>No scenes yet</Text>
            <Text style={styles.emptySub}>
              Create a scene to run multiple actions at once.
            </Text>
          </View>
        ) : (
          roomScenes.map((scene) => {
            const deviceIds = Array.from(
              new Set(scene.actions.map((a) => a.deviceId)),
            );
            const sceneDevices = deviceIds
              .map((id) => deviceMap.get(id))
              .filter(Boolean) as Device[];
            const actionLabels = scene.actions.map((action) =>
              formatAction(action, deviceMap),
            );
            return (
              <SceneCard
                key={scene.id}
                scene={scene}
                devices={sceneDevices}
                actionLabels={actionLabels}
                isActive={scene.id === activeSceneId}
                onRun={() => runScene(scene.id)}
                onOpen={() => setDetailSceneId(scene.id)}
              />
            );
          })
        )}
      </View>
    </View>
  );

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={styles.root}
    >
      <BackgroundLines />
      <View style={contentStyle}>
        <ScreenFrame
          isPortrait={isPortrait}
          enabled={frameEnabled}
          isWide={isWide}
          pad={framePad}
          radius={frameRadius}
          width={frameWidth}
        >
          <ScreenSectionLayout
            header={
              <View style={headerStyle}>
                <View>
                  <Text style={headerTitleStyle}>Scenes</Text>
                  <Text style={headerSubtitleStyle}>
                    One-tap moods for each room.
                  </Text>
                </View>
                <View style={headerActionsStyle}>
                  <HeaderPill
                    label={`${scenes.length} Scenes`}
                    icon="sparkles"
                    iconSize={Math.round(14 * scale)}
                    style={countPillStyle}
                    textStyle={countTextStyle}
                  />
                  <HeaderPill
                    label="Create"
                    icon="add"
                    iconSize={Math.round(16 * scale)}
                    style={addPillStyle}
                    textStyle={addTextStyle}
                    onPress={openCreate}
                  />
                  {activeSceneId ? (
                    <HeaderPill
                      label="Clear active"
                      icon="close-circle"
                      iconSize={Math.round(16 * scale)}
                      style={clearPillStyle}
                      textStyle={clearTextStyle}
                      onPress={clearActiveScene}
                    />
                  ) : null}
                </View>
              </View>
            }
            headerWrapStyle={headerWrapStyle}
            showDivider={isWide}
            dividerWrapStyle={headerDividerWrapStyle}
            scrollStyle={styles.sectionsScroll}
            contentContainerStyle={sectionsScrollContentStyle}
            showsVerticalScrollIndicator={false}
          >
            {isWide && columnCount > 1 ? (
              <View style={sectionsGridLandscapeStyle}>
                {sceneColumns.map((column, index) => (
                  <View
                    key={`scene-column-${index}`}
                    style={sectionsColumnStyle}
                  >
                    {column.map(renderSection)}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.sectionsGrid}>
                {sections.map(renderSection)}
              </View>
            )}
          </ScreenSectionLayout>
        </ScreenFrame>
      </View>

      <ModalCard
        visible={showCreate}
        onRequestClose={() => {
          setShowCreate(false);
          setEditingSceneId(null);
        }}
        onBackdropPress={() => {
          setShowCreate(false);
          setEditingSceneId(null);
        }}
        colors={["rgba(255,255,255,0.96)", "rgba(246,238,255,0.92)"]}
        cardStyle={modalCardStyle}
      >
        <ScrollView
          contentContainerStyle={modalContentStyle}
          showsVerticalScrollIndicator={false}
        >
          <Text style={modalTitleStyle}>
            {editingSceneId ? "Edit scene" : "Create scene"}
          </Text>
          <Text style={modalSubStyle}>
            {editingSceneId
              ? "Update your scene settings."
              : "Capture a mood for this room."}
          </Text>

          <ModalField label="Scene name" labelStyle={modalLabelStyle}>
            <TextInput
              value={sceneName}
              onChangeText={setSceneName}
              placeholder="Movie Night"
              placeholderTextColor="rgba(12,12,18,0.45)"
              style={modalInputStyle}
            />
          </ModalField>

          <ModalField label="Room" labelStyle={modalLabelStyle}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.roomRow}
            >
              {rooms.map((room) => {
                const active = room.id === roomId;
                return (
                  <Pressable
                    key={room.id}
                    style={roomPillStyle(active)}
                    onPress={() => {
                      setRoomId(room.id);
                      setSelectedDeviceIds([]);
                      setOverrides({});
                    }}
                  >
                    <Text style={roomPillTextStyle(active)}>
                      {room.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </ModalField>

          <ModalField label="Devices" labelStyle={modalLabelStyle}>
            {roomDevices.length === 0 ? (
              <Text style={modalHintStyle}>No devices in this room yet.</Text>
            ) : (
              <View style={styles.deviceGrid}>
                {roomDevices.map((device) => {
                  const active = selectedDeviceIds.includes(device.id);
                  return (
                    <Pressable
                      key={device.id}
                      style={deviceChipStyle(active)}
                      onPress={() => toggleDeviceSelection(device)}
                    >
                      <View style={deviceIconStyle(active)}>
                        <DeviceIcon
                          kind={device.kind}
                          size={Math.round(14 * scale)}
                          color={active ? "#fff" : "#2B0A73"}
                        />
                      </View>
                      <Text
                        style={deviceTextStyle(active)}
                        numberOfLines={1}
                      >
                        {device.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ModalField>

          <ModalField label="Controls" labelStyle={modalLabelStyle}>
            {selectedDeviceIds.length === 0 ? (
              <Text style={modalHintStyle}>
                Select devices to configure scene controls.
              </Text>
            ) : (
              <View style={styles.controlsStack}>
                {selectedDeviceIds.map((id) => {
                  const device = deviceMap.get(id);
                  if (!device) return null;
                  return (
                    <DeviceControlCard
                      key={id}
                      device={device}
                      override={overrides[id]}
                      onPatch={(patch) => updateOverride(device.id, patch)}
                    />
                  );
                })}
              </View>
            )}
          </ModalField>
                <Text style={modalHintStyle}>
                  Scenes capture the current device settings.
                </Text>

        <ModalActionRow
          style={styles.modalRow}
          actions={[
            {
              label: "Cancel",
              onPress: () => {
                setShowCreate(false);
                setEditingSceneId(null);
              },
              style: modalGhostStyle,
              textStyle: modalGhostTextStyle,
            },
            {
              label: editingSceneId ? "Save" : "Create",
              onPress: handleCreate,
              style: modalPrimaryStyle,
              textStyle: modalPrimaryTextStyle,
              disabled: !canCreate,
            },
          ]}
        />
        </ScrollView>
      </ModalCard>

      <ModalCard
        visible={Boolean(detailScene)}
        onRequestClose={() => setDetailSceneId(null)}
        onBackdropPress={() => setDetailSceneId(null)}
        colors={["rgba(255,255,255,0.96)", "rgba(246,238,255,0.92)"]}
        cardStyle={modalCardStyle}
      >
        <ScrollView
          contentContainerStyle={modalContentStyle}
          showsVerticalScrollIndicator={false}
        >
          <Text style={modalTitleStyle}>
            {detailScene?.name ?? "Scene details"}
          </Text>
          <Text style={modalSubStyle}>
            {detailRoom?.name ?? "Room"} • {detailScene?.actions.length ?? 0}{" "}
            actions • {detailDevices.length} devices
          </Text>

                <View
                  style={detailStatusPillStyle(
                    detailScene?.id === activeSceneId,
                  )}
                >
                  <Ionicons
                    name={
                      detailScene?.id === activeSceneId
                        ? "checkmark-circle"
                        : "moon"
                    }
                    size={Math.round(14 * scale)}
                    color="rgba(12,12,18,0.75)"
                  />
                  <Text style={detailStatusTextStyle}>
                    {detailScene?.id === activeSceneId ? "Active" : "Idle"}
                  </Text>
                </View>

          <ModalField label="Actions" labelStyle={modalLabelStyle}>
            {detailActionLabels.length === 0 ? (
              <Text style={modalHintStyle}>
                No actions saved for this scene.
              </Text>
            ) : (
              <View style={styles.detailActionRow}>
                {detailActionLabels.map((label, index) => (
                  <View
                    key={`${label}-${index}`}
                    style={styles.detailActionChip}
                  >
                    <Text style={detailActionTextStyle}>{label}</Text>
                  </View>
                ))}
              </View>
            )}
          </ModalField>

          <ModalField label="Devices" labelStyle={modalLabelStyle}>
            {detailDevices.length === 0 ? (
              <Text style={modalHintStyle}>No devices linked yet.</Text>
            ) : (
              <View style={styles.deviceGrid}>
                {detailDevices.map((device) => (
                  <View key={device.id} style={deviceChipStyle(false)}>
                    <View style={deviceIconStyle(false)}>
                      <DeviceIcon
                        kind={device.kind}
                        size={Math.round(14 * scale)}
                        color="rgba(12,12,18,0.85)"
                      />
                    </View>
                    <Text style={deviceTextStyle(false)} numberOfLines={1}>
                      {device.name}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ModalField>

          <ModalActionRow
            style={styles.modalRow}
            actions={[
              {
                label: "Close",
                onPress: () => setDetailSceneId(null),
                style: modalGhostStyle,
                textStyle: modalGhostTextStyle,
              },
              {
                label: "Edit",
                onPress: () => {
                  if (!detailScene) return;
                  setDetailSceneId(null);
                  openEdit(detailScene);
                },
                style: modalGhostStyle,
                textStyle: modalGhostTextStyle,
              },
              {
                label: "Run scene",
                onPress: () => {
                  if (!detailScene) return;
                  runScene(detailScene.id);
                },
                style: modalPrimaryBaseStyle,
                textStyle: modalPrimaryTextStyle,
              },
            ]}
          />
        </ScrollView>
      </ModalCard>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, alignItems: "center" },
  sectionsScroll: { flex: 1 },
  sectionsGrid: { gap: 12 },
  sectionsGridLandscape: { flexDirection: "row", alignItems: "flex-start" },
  sectionsColumn: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerPhone: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: 10,
    width: "100%",
  },
  headerCompact: {
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerActionsPhone: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
  },
  headerActionPillPhone: {
    justifyContent: "center",
    width: "48%",
  },
  headerActionPillPhoneFull: {
    justifyContent: "center",
    width: "100%",
  },
  headerActionsCompact: {
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignSelf: "stretch",
  },
  h1: { color: theme.colors.text, fontSize: 28, fontWeight: "900" },
  p: { marginTop: 8, color: theme.colors.subtext, fontWeight: "700" },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  countText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  addPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    backgroundColor: "rgba(180,107,255,0.25)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  addText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  clearPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  clearText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  section: { marginTop: 18 },
  roomPanel: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16 },
  sectionSub: { color: theme.colors.muted, fontWeight: "700", fontSize: 12 },
  emptyCard: {
    marginTop: 10,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  emptyTitle: { color: theme.colors.text, fontWeight: "900" },
  emptySub: { marginTop: 6, color: theme.colors.subtext, fontWeight: "700" },
  sceneCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 22,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  sceneCardActive: {
    backgroundColor: "rgba(180,107,255,0.24)",
    borderColor: "rgba(180,107,255,0.6)",
    shadowColor: theme.colors.glow,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  sceneHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  sceneTitle: { color: theme.colors.text, fontWeight: "900" },
  sceneSub: {
    marginTop: 6,
    color: theme.colors.subtext,
    fontWeight: "700",
    fontSize: 12,
  },
  runPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    backgroundColor: "rgba(180,107,255,0.25)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  runPillActive: {
    backgroundColor: theme.colors.accent2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  runText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  runTextActive: { color: "#fff" },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  iconChipOn: {
    backgroundColor: "rgba(180,107,255,0.32)",
    borderColor: "rgba(180,107,255,0.65)",
    shadowColor: theme.colors.glow,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  moreChip: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: { color: theme.colors.subtext, fontWeight: "800", fontSize: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  actionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  actionText: { color: theme.colors.subtext, fontWeight: "800", fontSize: 11 },
  modalCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    maxHeight: "85%",
  },
  modalContent: { padding: 18 },
  modalTitle: { color: "rgba(12,12,18,0.9)", fontWeight: "900", fontSize: 18 },
  modalSub: { color: "rgba(12,12,18,0.55)", fontWeight: "700", marginTop: 6 },
  modalLabel: {
    color: "rgba(12,12,18,0.75)",
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 6,
  },
  modalInput: {
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    paddingHorizontal: 12,
    color: "rgba(12,12,18,0.9)",
    fontWeight: "700",
  },
  roomRow: { gap: 8, paddingVertical: 6 },
  roomPill: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(12,12,18,0.06)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  roomPillActive: {
    backgroundColor: "rgba(107,60,255,0.2)",
    borderColor: "rgba(107,60,255,0.3)",
  },
  roomPillText: {
    color: "rgba(12,12,18,0.7)",
    fontWeight: "800",
    fontSize: 12,
  },
  roomPillTextActive: { color: "rgba(12,12,18,0.9)" },
  deviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  deviceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 14,
    backgroundColor: "rgba(12,12,18,0.05)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    maxWidth: "48%",
  },
  deviceChipActive: { backgroundColor: "#6B3CFF", borderColor: "#6B3CFF" },
  deviceIcon: {
    width: 22,
    height: 22,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  deviceIconActive: { backgroundColor: "rgba(255,255,255,0.2)" },
  deviceText: {
    color: "rgba(12,12,18,0.8)",
    fontWeight: "800",
    fontSize: 12,
    flexShrink: 1,
  },
  deviceTextActive: { color: "#fff" },
  modalHint: { marginTop: 8, color: "rgba(12,12,18,0.55)", fontWeight: "700" },
  detailStatusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    marginTop: 12,
    backgroundColor: "rgba(12,12,18,0.06)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.12)",
  },
  detailStatusPillActive: {
    backgroundColor: "rgba(107,60,255,0.18)",
    borderColor: "rgba(107,60,255,0.35)",
  },
  detailStatusText: { color: "rgba(12,12,18,0.75)", fontWeight: "800" },
  detailActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  detailActionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(12,12,18,0.06)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.12)",
  },
  detailActionText: { color: "rgba(12,12,18,0.7)", fontWeight: "800" },
  modalRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalGhost: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalGhostText: { color: "rgba(12,12,18,0.75)", fontWeight: "800" },
  modalPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#6B3CFF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryDisabled: { opacity: 0.6 },
  modalPrimaryText: { color: "#FFFFFF", fontWeight: "900" },
  controlsStack: { gap: 12, marginTop: 6 },
  deviceControlCard: {
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
  },
  deviceControlHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  deviceControlIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "rgba(107,60,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  deviceControlTitle: { color: "rgba(12,12,18,0.95)", fontWeight: "900" },
  deviceControlSub: {
    marginTop: 4,
    color: "rgba(12,12,18,0.55)",
    fontWeight: "700",
    fontSize: 12,
  },
  inlineToggleRow: { flexDirection: "row", gap: 6 },
  inlineTogglePill: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.12)",
    backgroundColor: "rgba(12,12,18,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  inlineTogglePillActive: {
    backgroundColor: "#6B3CFF",
    borderColor: "#6B3CFF",
  },
  inlineToggleText: {
    color: "rgba(12,12,18,0.7)",
    fontWeight: "800",
    fontSize: 12,
  },
  inlineToggleTextActive: { color: "#fff" },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  sliderLabel: { color: "rgba(12,12,18,0.7)", fontWeight: "800", fontSize: 12 },
  sliderValue: { color: "rgba(12,12,18,0.9)", fontWeight: "900", fontSize: 12 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  choicePill: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    backgroundColor: "rgba(12,12,18,0.06)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  choicePillActive: { backgroundColor: "#6B3CFF", borderColor: "#6B3CFF" },
  choiceText: { color: "rgba(12,12,18,0.7)", fontWeight: "800", fontSize: 12 },
  choiceTextActive: { color: "#fff" },
  colorRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.15)",
  },
  colorDotActive: { borderColor: "#6B3CFF", borderWidth: 2 },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "rgba(12,12,18,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: {
    minWidth: 72,
    textAlign: "center",
    color: "rgba(12,12,18,0.9)",
    fontWeight: "900",
  },
  controlHint: {
    marginTop: 8,
    color: "rgba(12,12,18,0.55)",
    fontWeight: "700",
    fontSize: 12,
  },
});

const LIGHT_COLORS = [
  "#FFFFFF",
  "#FFD166",
  "#FF6B6B",
  "#B46BFF",
  "#4DD0E1",
  "#7DFFB6",
  "#A0E9FF",
];
const WASH_CYCLES = ["Normal", "Quick", "Delicates", "Eco"];
const VACUUM_STATES = ["docked", "cleaning", "paused"] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function DeviceControlCard({
  device,
  override,
  onPatch,
}: {
  device: Device;
  override?: Partial<Device>;
  onPatch: (patch: Partial<Device>) => void;
}) {
  const { isTablet, scale } = useResponsive();
  const cardPad = Math.round((isTablet ? 16 : 12) * scale);
  const cardRadius = Math.round((isTablet ? 20 : 18) * scale);
  const iconWrap = Math.round((isTablet ? 36 : 32) * scale);
  const iconSize = Math.round((isTablet ? 18 : 16) * scale);
  const iconRadius = Math.round(iconWrap * 0.38);
  const titleSize = Math.round((isTablet ? 15 : 14) * scale);
  const subSize = Math.round((isTablet ? 12 : 11) * scale);
  const toggleHeight = Math.round((isTablet ? 32 : 28) * scale);
  const toggleRadius = Math.round(toggleHeight / 2);
  const toggleText = Math.round((isTablet ? 12 : 11) * scale);
  const sliderLabelSize = Math.round((isTablet ? 13 : 12) * scale);
  const sliderValueSize = Math.round((isTablet ? 13 : 12) * scale);
  const choiceHeight = Math.round((isTablet ? 36 : 30) * scale);
  const choiceRadius = Math.round(choiceHeight / 2);
  const choiceTextSize = Math.round((isTablet ? 12 : 11) * scale);
  const colorDotSize = Math.round((isTablet ? 20 : 18) * scale);
  const stepBtnSize = Math.round((isTablet ? 36 : 32) * scale);
  const stepBtnRadius = Math.round(stepBtnSize * 0.38);
  const stepIconSize = Math.round((isTablet ? 18 : 16) * scale);
  const hintSize = Math.round((isTablet ? 12 : 11) * scale);
  const isOn = override?.isOn ?? device.isOn ?? true;
  const cardStyle: StyleProp<ViewStyle> = [
    styles.deviceControlCard,
    { padding: cardPad, borderRadius: cardRadius },
  ];
  const iconStyle: StyleProp<ViewStyle> = [
    styles.deviceControlIcon,
    { width: iconWrap, height: iconWrap, borderRadius: iconRadius },
  ];
  const headerBodyStyle: ViewStyle = { flex: 1 };
  const titleStyle: StyleProp<TextStyle> = [
    styles.deviceControlTitle,
    { fontSize: titleSize },
  ];
  const subStyle: StyleProp<TextStyle> = [
    styles.deviceControlSub,
    { fontSize: subSize },
  ];
  const inlinePillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.inlineTogglePill,
    { height: toggleHeight, borderRadius: toggleRadius },
    active && styles.inlineTogglePillActive,
  ];
  const inlineTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.inlineToggleText,
    { fontSize: toggleText },
    active && styles.inlineToggleTextActive,
  ];
  const sliderLabelStyle: StyleProp<TextStyle> = [
    styles.sliderLabel,
    { fontSize: sliderLabelSize },
  ];
  const sliderValueStyle: StyleProp<TextStyle> = [
    styles.sliderValue,
    { fontSize: sliderValueSize },
  ];
  const sliderTopStyle: ViewStyle = {
    marginTop: Math.round(6 * scale),
  };
  const choicePillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.choicePill,
    { height: choiceHeight, borderRadius: choiceRadius },
    active && styles.choicePillActive,
  ];
  const choiceTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.choiceText,
    { fontSize: choiceTextSize },
    active && styles.choiceTextActive,
  ];
  const colorDotStyle = (
    color: string,
    active: boolean,
  ): StyleProp<ViewStyle> => [
    styles.colorDot,
    {
      backgroundColor: color,
      width: colorDotSize,
      height: colorDotSize,
      borderRadius: Math.round(colorDotSize / 2),
    },
    active && styles.colorDotActive,
  ];
  const stepBtnStyle: StyleProp<ViewStyle> = [
    styles.stepBtn,
    { width: stepBtnSize, height: stepBtnSize, borderRadius: stepBtnRadius },
  ];
  const stepValueStyle: StyleProp<TextStyle> = [
    styles.stepValue,
    { fontSize: sliderValueSize },
  ];
  const controlHintStyle: StyleProp<TextStyle> = [
    styles.controlHint,
    { fontSize: hintSize },
  ];

  const renderControls = () => {
    switch (device.kind) {
      case "ac": {
        const temp = override?.tempC ?? device.tempC ?? 22;
        const mode = override?.mode ?? device.mode ?? "cold";
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={sliderLabelStyle}>
                Temperature
              </Text>
              <Text style={sliderValueStyle}>
                {temp}°C
              </Text>
            </View>
            <Slider
              style={sliderTopStyle}
              minimumValue={AC_TEMP_MIN_C}
              maximumValue={AC_TEMP_MAX_C}
              value={temp}
              minimumTrackTintColor="#6B3CFF"
              maximumTrackTintColor="rgba(12,12,18,0.1)"
              thumbTintColor="#FFFFFF"
              onValueChange={(v) => onPatch({ tempC: Math.round(v) })}
            />
            <View style={styles.choiceRow}>
              {(["cold", "fan", "dry"] as const).map((m) => (
                <Pressable
                  key={m}
                  style={choicePillStyle(mode === m)}
                  onPress={() => onPatch({ mode: m })}
                >
                  <Text style={choiceTextStyle(mode === m)}>
                    {m[0].toUpperCase() + m.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        );
      }
      case "light": {
        const brightness = override?.brightness ?? device.brightness ?? 60;
        const color = override?.color ?? device.color ?? LIGHT_COLORS[0];
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={sliderLabelStyle}>
                Brightness
              </Text>
              <Text style={sliderValueStyle}>
                {Math.round(brightness)}%
              </Text>
            </View>
            <Slider
              style={sliderTopStyle}
              minimumValue={0}
              maximumValue={100}
              value={brightness}
              minimumTrackTintColor="#6B3CFF"
              maximumTrackTintColor="rgba(12,12,18,0.1)"
              thumbTintColor="#FFFFFF"
              onValueChange={(v) => onPatch({ brightness: Math.round(v) })}
            />
            <View style={styles.colorRow}>
              {LIGHT_COLORS.map((c) => (
                <Pressable key={c} onPress={() => onPatch({ color: c })}>
                  <View style={colorDotStyle(c, color === c)} />
                </Pressable>
              ))}
            </View>
          </>
        );
      }
      case "tv": {
        const volume = override?.volume ?? device.volume ?? 20;
        const channel = override?.channel ?? device.channel ?? 1;
        const muted = override?.muted ?? device.muted ?? false;
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={sliderLabelStyle}>
                Volume
              </Text>
              <Text style={sliderValueStyle}>
                {Math.round(volume)}
              </Text>
            </View>
            <Slider
              style={sliderTopStyle}
              minimumValue={0}
              maximumValue={100}
              value={volume}
              minimumTrackTintColor="#6B3CFF"
              maximumTrackTintColor="rgba(12,12,18,0.1)"
              thumbTintColor="#FFFFFF"
              onValueChange={(v) => onPatch({ volume: Math.round(v) })}
            />
            <View style={styles.stepRow}>
              <Pressable
                style={stepBtnStyle}
                onPress={() => onPatch({ channel: clamp(channel - 1, 1, 99) })}
              >
                <Ionicons
                  name="remove"
                  size={stepIconSize}
                  color="rgba(12,12,18,0.75)"
                />
              </Pressable>
              <Text style={stepValueStyle}>Ch {channel}</Text>
              <Pressable
                style={stepBtnStyle}
                onPress={() => onPatch({ channel: clamp(channel + 1, 1, 99) })}
              >
                <Ionicons
                  name="add"
                  size={stepIconSize}
                  color="rgba(12,12,18,0.75)"
                />
              </Pressable>
            </View>
            <View style={styles.choiceRow}>
              <Pressable
                style={choicePillStyle(!muted)}
                onPress={() => onPatch({ muted: false })}
              >
                <Text style={choiceTextStyle(!muted)}>
                  Sound
                </Text>
              </Pressable>
              <Pressable
                style={choicePillStyle(muted)}
                onPress={() => onPatch({ muted: true })}
              >
                <Text style={choiceTextStyle(muted)}>
                  Muted
                </Text>
              </Pressable>
            </View>
          </>
        );
      }
      case "fan": {
        const speed = override?.speed ?? device.speed ?? 60;
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={sliderLabelStyle}>
                Speed
              </Text>
              <Text style={sliderValueStyle}>
                {Math.round(speed)}%
              </Text>
            </View>
            <Slider
              style={sliderTopStyle}
              minimumValue={0}
              maximumValue={100}
              value={speed}
              minimumTrackTintColor="#6B3CFF"
              maximumTrackTintColor="rgba(12,12,18,0.1)"
              thumbTintColor="#FFFFFF"
              onValueChange={(v) => onPatch({ speed: Math.round(v) })}
            />
          </>
        );
      }
      case "garage":
      case "door":
      case "gate":
      case "window": {
        const openPercent = override?.openPercent ?? device.openPercent ?? 0;
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={sliderLabelStyle}>
                Open
              </Text>
              <Text style={sliderValueStyle}>
                {Math.round(openPercent)}%
              </Text>
            </View>
            <Slider
              style={sliderTopStyle}
              minimumValue={0}
              maximumValue={100}
              value={openPercent}
              minimumTrackTintColor="#6B3CFF"
              maximumTrackTintColor="rgba(12,12,18,0.1)"
              thumbTintColor="#FFFFFF"
              onValueChange={(v) => onPatch({ openPercent: Math.round(v) })}
            />
          </>
        );
      }
      case "vacuum": {
        const status = override?.status ?? device.status ?? "docked";
        return (
          <View style={styles.choiceRow}>
            {VACUUM_STATES.map((state) => (
              <Pressable
                key={state}
                style={choicePillStyle(status === state)}
                onPress={() => onPatch({ status: state })}
              >
                <Text style={choiceTextStyle(status === state)}>
                  {state[0].toUpperCase() + state.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        );
      }
      case "camera": {
        const armed = override?.armed ?? device.armed ?? true;
        const recording = override?.recording ?? device.recording ?? false;
        return (
          <>
            <View style={styles.choiceRow}>
              <Pressable
                style={choicePillStyle(armed)}
                onPress={() => onPatch({ armed: true })}
              >
                <Text style={choiceTextStyle(armed)}>
                  Armed
                </Text>
              </Pressable>
              <Pressable
                style={choicePillStyle(!armed)}
                onPress={() => onPatch({ armed: false })}
              >
                <Text style={choiceTextStyle(!armed)}>
                  Disarmed
                </Text>
              </Pressable>
            </View>
            <View style={styles.choiceRow}>
              <Pressable
                style={choicePillStyle(recording)}
                onPress={() => onPatch({ recording: true })}
              >
                <Text style={choiceTextStyle(recording)}>
                  Recording
                </Text>
              </Pressable>
              <Pressable
                style={choicePillStyle(!recording)}
                onPress={() => onPatch({ recording: false })}
              >
                <Text style={choiceTextStyle(!recording)}>
                  Idle
                </Text>
              </Pressable>
            </View>
          </>
        );
      }
      case "stove": {
        const burnerLevel = override?.burnerLevel ?? device.burnerLevel ?? 0;
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={sliderLabelStyle}>
                Heat
              </Text>
              <Text style={sliderValueStyle}>
                {Math.round(burnerLevel)}
              </Text>
            </View>
            <Slider
              style={sliderTopStyle}
              minimumValue={0}
              maximumValue={5}
              value={burnerLevel}
              minimumTrackTintColor="#6B3CFF"
              maximumTrackTintColor="rgba(12,12,18,0.1)"
              thumbTintColor="#FFFFFF"
              onValueChange={(v) => onPatch({ burnerLevel: Math.round(v) })}
            />
          </>
        );
      }
      case "washer":
      case "dryer": {
        const cycle = override?.cycle ?? device.cycle ?? "Normal";
        return (
          <View style={styles.choiceRow}>
            {WASH_CYCLES.map((c) => (
              <Pressable
                key={c}
                style={choicePillStyle(cycle === c)}
                onPress={() => onPatch({ cycle: c })}
              >
                <Text style={choiceTextStyle(cycle === c)}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
        );
      }
      case "microwave": {
        const timeRemainingSec =
          override?.timeRemainingSec ?? device.timeRemainingSec ?? 120;
        const minutes = Math.max(1, Math.round(timeRemainingSec / 60));
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={sliderLabelStyle}>
                Timer
              </Text>
              <Text style={sliderValueStyle}>
                {minutes}m
              </Text>
            </View>
            <Slider
              style={sliderTopStyle}
              minimumValue={60}
              maximumValue={900}
              value={timeRemainingSec}
              minimumTrackTintColor="#6B3CFF"
              maximumTrackTintColor="rgba(12,12,18,0.1)"
              thumbTintColor="#FFFFFF"
              onValueChange={(v) =>
                onPatch({ timeRemainingSec: Math.round(v / 30) * 30 })
              }
            />
          </>
        );
      }
      case "fridge": {
        const temp = override?.tempC ?? device.tempC ?? 4;
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={sliderLabelStyle}>
                Temperature
              </Text>
              <Text style={sliderValueStyle}>
                {temp}°C
              </Text>
            </View>
            <Slider
              style={sliderTopStyle}
              minimumValue={1}
              maximumValue={8}
              value={temp}
              minimumTrackTintColor="#6B3CFF"
              maximumTrackTintColor="rgba(12,12,18,0.1)"
              thumbTintColor="#FFFFFF"
              onValueChange={(v) => onPatch({ tempC: Math.round(v) })}
            />
          </>
        );
      }
      case "coffee":
        return (
          <Text style={controlHintStyle}>
            Brew uses the On/Off state.
          </Text>
        );
      default:
        return (
          <Text style={controlHintStyle}>
            No extra controls for this device.
          </Text>
        );
    }
  };

  return (
    <View style={cardStyle}>
      <View style={styles.deviceControlHeader}>
        <View style={iconStyle}>
          <DeviceIcon kind={device.kind} size={iconSize} color="#6B3CFF" />
        </View>
        <View style={headerBodyStyle}>
          <Text style={titleStyle}>{device.name}</Text>
          <Text style={subStyle}>{labelForKind(device.kind)}</Text>
        </View>
        <View style={styles.inlineToggleRow}>
          <Pressable
            style={inlinePillStyle(isOn)}
            onPress={() => onPatch({ isOn: true })}
          >
            <Text style={inlineTextStyle(isOn)}>On</Text>
          </Pressable>
          <Pressable
            style={inlinePillStyle(!isOn)}
            onPress={() => onPatch({ isOn: false })}
          >
            <Text style={inlineTextStyle(!isOn)}>Off</Text>
          </Pressable>
        </View>
      </View>
      {renderControls()}
    </View>
  );
}

function SceneCard({
  scene,
  devices,
  actionLabels,
  isActive,
  onRun,
  onOpen,
}: {
  scene: Scene;
  devices: Device[];
  actionLabels: string[];
  isActive: boolean;
  onRun: () => void;
  onOpen: () => void;
}) {
  const { isTablet, scale: scaleFactor } = useResponsive();
  const pressScale = useRef(new Animated.Value(1)).current;
  const cardPad = Math.round((isTablet ? 18 : 16) * scaleFactor);
  const cardRadius = Math.round((isTablet ? 24 : 22) * scaleFactor);
  const titleSize = Math.round((isTablet ? 16 : 14) * scaleFactor);
  const subSize = Math.round((isTablet ? 13 : 12) * scaleFactor);
  const runHeight = Math.round((isTablet ? 36 : 32) * scaleFactor);
  const runRadius = Math.round(runHeight / 2);
  const runText = Math.round((isTablet ? 13 : 12) * scaleFactor);
  const iconChipSize = Math.round((isTablet ? 40 : 36) * scaleFactor);
  const iconChipRadius = Math.round(iconChipSize * 0.4);
  const iconSize = Math.round((isTablet ? 18 : 16) * scaleFactor);
  const actionText = Math.round((isTablet ? 12 : 11) * scaleFactor);
  const actionChipPad = Math.round((isTablet ? 10 : 8) * scaleFactor);
  const chips = actionLabels.slice(0, 3);
  const extra = actionLabels.length - chips.length;
  const pressScaleStyle = { transform: [{ scale: pressScale }] };
  const sceneCardStyle: StyleProp<ViewStyle> = [
    styles.sceneCard,
    { padding: cardPad, borderRadius: cardRadius },
    isActive && styles.sceneCardActive,
  ];
  const sceneTitleStyle: StyleProp<TextStyle> = [
    styles.sceneTitle,
    { fontSize: titleSize },
  ];
  const sceneSubStyle: StyleProp<TextStyle> = [
    styles.sceneSub,
    { fontSize: subSize },
  ];
  const runPillStyle: StyleProp<ViewStyle> = [
    styles.runPill,
    { height: runHeight, borderRadius: runRadius },
    isActive && styles.runPillActive,
  ];
  const runTextStyle: StyleProp<TextStyle> = [
    styles.runText,
    { fontSize: runText },
    isActive && styles.runTextActive,
  ];
  const headerBodyStyle: ViewStyle = { flex: 1 };
  const iconChipStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.iconChip,
    {
      width: iconChipSize,
      height: iconChipSize,
      borderRadius: iconChipRadius,
    },
    active && styles.iconChipOn,
  ];
  const moreChipStyle: StyleProp<ViewStyle> = [
    styles.moreChip,
    {
      height: iconChipSize,
      borderRadius: iconChipRadius,
      paddingHorizontal: Math.round(iconChipSize * 0.3),
    },
  ];
  const moreTextStyle: StyleProp<TextStyle> = [
    styles.moreText,
    { fontSize: actionText },
  ];
  const actionChipStyle: StyleProp<ViewStyle> = [
    styles.actionChip,
    {
      paddingHorizontal: actionChipPad,
      paddingVertical: Math.round(actionChipPad * 0.6),
    },
  ];
  const actionTextStyle: StyleProp<TextStyle> = [
    styles.actionText,
    { fontSize: actionText },
  ];

  const handleOpen = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.sequence([
      Animated.timing(pressScale, {
        toValue: 0.97,
        duration: 90,
        useNativeDriver: false,
      }),
      Animated.spring(pressScale, {
        toValue: 1,
        useNativeDriver: false,
        friction: 5,
      }),
    ]).start();
    onOpen();
  };

  const handleRun = (event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onRun();
  };

  return (
    <Animated.View style={pressScaleStyle}>
      <Pressable
        style={sceneCardStyle}
        onPress={handleOpen}
      >
        <View style={styles.sceneHeader}>
          <View style={headerBodyStyle}>
            <Text style={sceneTitleStyle}>{scene.name}</Text>
            <Text style={sceneSubStyle}>
              {scene.actions.length} actions • {devices.length} devices
            </Text>
          </View>
          <Pressable
            style={runPillStyle}
            onPress={handleRun}
            hitSlop={8}
          >
            <Ionicons
              name={isActive ? "checkmark-circle" : "play"}
              size={Math.round(14 * scaleFactor)}
              color={theme.colors.text}
            />
            <Text style={runTextStyle}>{isActive ? "Active" : "Run"}</Text>
          </Pressable>
        </View>

        <View style={styles.iconRow}>
          {devices.slice(0, 4).map((device) => (
            <View
              key={device.id}
              style={iconChipStyle(Boolean(device.isOn))}
            >
              <DeviceIcon
                kind={device.kind}
                size={iconSize}
                color={theme.colors.text}
              />
            </View>
          ))}
          {devices.length > 4 && (
            <View style={moreChipStyle}>
              <Text style={moreTextStyle}>+{devices.length - 4}</Text>
            </View>
          )}
        </View>

        <View style={styles.chipRow}>
          {chips.map((label) => (
            <View key={label} style={actionChipStyle}>
              <Text style={actionTextStyle}>{label}</Text>
            </View>
          ))}
          {extra > 0 && (
            <View style={actionChipStyle}>
              <Text style={actionTextStyle}>+{extra} more</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function labelForKind(kind: Device["kind"]) {
  switch (kind) {
    case "ac":
      return "Air Conditioner";
    case "light":
      return "Lighting";
    case "tv":
      return "Smart TV";
    case "coffee":
      return "Coffee Machine";
    case "fridge":
      return "Refrigerator";
    case "garage":
      return "Garage Door";
    case "gate":
      return "Front Gate";
    case "fan":
      return "Ceiling Fan";
    case "door":
      return "Door";
    case "vacuum":
      return "Vacuum";
    case "camera":
      return "Camera";
    case "window":
      return "Window";
    case "stove":
      return "Stove";
    case "washer":
      return "Washer";
    case "dryer":
      return "Dryer";
    case "microwave":
      return "Microwave";
    case "energy":
      return "Energy Monitor";
    case "water":
      return "Water Meter";
    case "air":
      return "Air Quality";
    case "sprinkler":
      return "Sprinkler";
    case "speaker":
      return "Speaker";
    case "smoke":
      return "Smoke/CO";
    default:
      return "Device";
  }
}

function formatAction(
  action: SceneAction,
  devices: Map<string, Device>,
): string {
  const device = devices.get(action.deviceId);
  if (!device) return "Device update";

  if (action.type === "toggle") {
    return `${device.name} ${action.on === false ? "OFF" : "ON"}`;
  }

  const patch = action.patch;
  if (patch.tempC != null) return `${device.name} ${patch.tempC}°C`;
  if (patch.brightness != null) return `${device.name} ${patch.brightness}%`;
  if (patch.color) return `${device.name} Color`;
  if (patch.volume != null) return `${device.name} Vol ${patch.volume}`;
  if (patch.source) return `${device.name} ${patch.source}`;
  if (patch.muted != null)
    return `${device.name} ${patch.muted ? "Muted" : "Sound"}`;
  if (patch.openPercent != null) return `${device.name} ${patch.openPercent}%`;
  if (patch.speed != null) return `${device.name} ${patch.speed}%`;
  if (patch.status) return `${device.name} ${patch.status}`;
  if (patch.armed != null)
    return `${device.name} ${patch.armed ? "Armed" : "Disarmed"}`;
  if (patch.recording != null)
    return `${device.name} ${patch.recording ? "Recording" : "Idle"}`;
  if (patch.burnerLevel != null)
    return `${device.name} Heat ${patch.burnerLevel}`;
  if (patch.stoveMode)
    return `${device.name} ${patch.stoveMode.replace("-", " ")}`;
  if (patch.stoveTimerMin != null)
    return `${device.name} ${patch.stoveTimerMin} min timer`;
  if (patch.stoveLock != null)
    return `${device.name} ${patch.stoveLock ? "Locked" : "Unlocked"}`;
  if (patch.cycle) return `${device.name} ${patch.cycle}`;
  if (patch.washTemp) return `${device.name} ${patch.washTemp}`;
  if (patch.spinSpeedRpm != null)
    return `${device.name} ${patch.spinSpeedRpm} rpm`;
  if (patch.soilLevel) return `${device.name} ${patch.soilLevel} soil`;
  if (patch.heatLevel) return `${device.name} ${patch.heatLevel} heat`;
  if (patch.drynessLevel) return `${device.name} ${patch.drynessLevel}`;
  if (patch.remainingMin != null)
    return `${device.name} ${patch.remainingMin} min left`;
  if (patch.channel != null) return `${device.name} Ch ${patch.channel}`;
  if (patch.timeRemainingSec != null) {
    const minutes = Math.max(1, Math.round(patch.timeRemainingSec / 60));
    return `${device.name} ${minutes}m`;
  }
  if (patch.microwavePower != null)
    return `${device.name} Power ${patch.microwavePower}`;
  if (patch.microwaveMode) return `${device.name} ${patch.microwaveMode}`;
  if (patch.solarW != null) return `${device.name} Solar ${patch.solarW}W`;
  if (patch.solarTodayKwh != null)
    return `${device.name} Solar ${patch.solarTodayKwh} kWh`;
  if (patch.gridTodayKwh != null)
    return `${device.name} Grid ${patch.gridTodayKwh} kWh`;
  if (patch.gridAvailable != null)
    return `${device.name} ${patch.gridAvailable ? "Grid Online" : "Grid Outage"}`;
  if (patch.gridOutageAlerts != null)
    return `${device.name} ${patch.gridOutageAlerts ? "Outage Alerts" : "Alerts Off"}`;
  if (patch.waterPressureLowPsi != null)
    return `${device.name} Alert ${patch.waterPressureLowPsi} psi`;
  if (patch.waterPressureAlerts != null)
    return `${device.name} ${patch.waterPressureAlerts ? "Pressure Alerts" : "Alerts Off"}`;
  if (patch.isOn != null) return `${device.name} ${patch.isOn ? "ON" : "OFF"}`;
  return `${device.name} update`;
}

function buildSceneAction(
  device: Device,
  override?: Partial<Device>,
): SceneAction {
  const isOn = override?.isOn ?? device.isOn ?? true;
  const patch: Partial<Device> = { isOn };
  switch (device.kind) {
    case "ac":
      patch.tempC = device.tempC ?? 22;
      patch.mode = device.mode ?? "cold";
      break;
    case "light":
      patch.brightness = device.brightness ?? 60;
      if (device.color) patch.color = device.color;
      break;
    case "tv":
      patch.volume = device.volume ?? 20;
      if (device.channel != null) patch.channel = device.channel;
      if (device.muted != null) patch.muted = device.muted;
      if (device.source) patch.source = device.source;
      break;
    case "fan":
      patch.speed = device.speed ?? 60;
      break;
    case "garage":
    case "door":
    case "gate":
    case "window":
      patch.openPercent = device.openPercent ?? 0;
      break;
    case "vacuum":
      patch.status = device.status ?? "cleaning";
      break;
    case "camera":
      patch.armed = device.armed ?? true;
      patch.recording = device.recording ?? false;
      break;
    case "stove":
      patch.burnerLevel = device.burnerLevel ?? 1;
      patch.stoveMode = device.stoveMode ?? "simmer";
      patch.stoveTimerMin = device.stoveTimerMin ?? 0;
      patch.stoveLock = device.stoveLock ?? false;
      break;
    case "washer":
    case "dryer":
      patch.cycle = device.cycle ?? "Normal";
      patch.progress = device.progress ?? 0;
      patch.washTemp = device.washTemp ?? "Warm";
      patch.spinSpeedRpm = device.spinSpeedRpm ?? 1000;
      patch.soilLevel = device.soilLevel ?? "Normal";
      patch.remainingMin = device.remainingMin ?? 0;
      if (device.kind === "dryer") {
        patch.heatLevel = device.heatLevel ?? "Med";
        patch.drynessLevel = device.drynessLevel ?? "Dry";
      }
      break;
    case "microwave":
      patch.timeRemainingSec = device.timeRemainingSec ?? 60;
      patch.microwavePower = device.microwavePower ?? 6;
      patch.microwaveMode = device.microwaveMode ?? "Reheat";
      break;
    case "fridge":
      patch.tempC = device.tempC ?? 4;
      break;
    default:
      break;
  }

  if (override) Object.assign(patch, override);
  return { type: "patch", deviceId: device.id, patch };
}
