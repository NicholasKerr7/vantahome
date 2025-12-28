import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import Pressable from '../components/Pressable';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { theme } from '../theme/theme';
import BackgroundLines from '../components/BackgroundLines';
import DeviceIcon from '../components/DeviceIcon';
import {
  AC_TEMP_MAX_C,
  AC_TEMP_MIN_C,
  useHomeStore,
  type Device,
  type Scene,
  type SceneAction,
} from '../store/useHomeStore';
import { useResponsive } from '../theme/layout';

export default function ScenesScreen() {
  const { contentWidth, gutter, topPad, isTablet, isLandscape, scale } = useResponsive(920);
  const isWide = isTablet && isLandscape;
  const titleSize = Math.round((isTablet ? 32 : 28) * scale);
  const subtitleSize = Math.round((isTablet ? 15 : 13) * scale);
  const pillHeight = Math.round((isTablet ? 36 : 32) * scale);
  const pillText = Math.round((isTablet ? 13 : 12) * scale);
  const sectionTitleSize = Math.round((isTablet ? 18 : 16) * scale);
  const sectionSubSize = Math.round((isTablet ? 13 : 12) * scale);
  const cardPad = Math.round((isTablet ? 18 : 16) * scale);
  const cardRadius = Math.round((isTablet ? 24 : 22) * scale);
  const gridGap = Math.round((isTablet ? 18 : 12) * scale);
  const modalPad = Math.round((isTablet ? 20 : 18) * scale);
  const modalRadius = Math.round((isTablet ? 26 : 24) * scale);
  const modalTitleSize = Math.round((isTablet ? 20 : 18) * scale);
  const modalSubSize = Math.round((isTablet ? 14 : 12) * scale);
  const modalLabelSize = Math.round((isTablet ? 13 : 12) * scale);
  const modalInputHeight = Math.round((isTablet ? 48 : 44) * scale);
  const modalBtnHeight = Math.round((isTablet ? 46 : 44) * scale);
  const roomPillHeight = Math.round((isTablet ? 36 : 34) * scale);
  const deviceChipHeight = Math.round((isTablet ? 40 : 36) * scale);
  const rooms = useHomeStore((s) => s.rooms);
  const scenes = useHomeStore((s) => s.scenes);
  const devices = useHomeStore((s) => s.devices);
  const runScene = useHomeStore((s) => s.runScene);
  const activeSceneId = useHomeStore((s) => s.activeSceneId);
  const addScene = useHomeStore((s) => s.addScene);

  const [showCreate, setShowCreate] = useState(false);
  const [sceneName, setSceneName] = useState('');
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? '');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Partial<Device>>>({});

  const deviceMap = useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices]);
  const roomDevices = useMemo(() => devices.filter((d) => d.roomId === roomId), [devices, roomId]);
  const sections = useMemo(
    () =>
      rooms.map((room) => ({
        room,
        scenes: scenes.filter((s) => s.roomId === room.id),
      })),
    [rooms, scenes]
  );

  useEffect(() => {
    if (!rooms.length) {
      setRoomId('');
      return;
    }
    if (!roomId || !rooms.find((r) => r.id === roomId)) {
      setRoomId(rooms[0].id);
      setSelectedDeviceIds([]);
      setOverrides({});
    }
  }, [rooms, roomId]);

  const canCreate = Boolean(roomId && selectedDeviceIds.length > 0);

  const openCreate = () => {
    setShowCreate(true);
    setSceneName('');
    setSelectedDeviceIds([]);
    setOverrides({});
  };

  const handleCreate = () => {
    if (!roomId) return;
    const room = rooms.find((r) => r.id === roomId);
    const name = sceneName.trim() || `${room?.name ?? 'Room'} Scene`;
    const actions = selectedDeviceIds
      .map((id) => deviceMap.get(id))
      .filter(Boolean)
      .map((device) => buildSceneAction(device as Device, overrides[(device as Device).id]));
    if (!actions.length) return;

    addScene({ roomId, name, actions });
    setShowCreate(false);
    setSceneName('');
    setSelectedDeviceIds([]);
    setOverrides({});
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
      return isSelected ? prev.filter((id) => id !== device.id) : [...prev, device.id];
    });
  };

  return (
    <LinearGradient colors={[theme.colors.bg1, theme.colors.bg0]} style={styles.root}>
      <BackgroundLines />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: isTablet ? gutter : 0,
            paddingTop: topPad,
            paddingBottom: Math.round((isTablet ? (isLandscape ? 120 : 140) : 120) * scale),
          },
        ]}
      >
        <View style={{ width: contentWidth, paddingHorizontal: isTablet ? 0 : gutter }}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.h1, { fontSize: titleSize }]}>Scenes</Text>
              <Text style={[styles.p, { fontSize: subtitleSize }]}>One-tap moods for each room.</Text>
            </View>
            <View style={styles.headerActions}>
              <View style={[styles.countPill, { height: pillHeight, borderRadius: Math.round(pillHeight / 2) }]}>
                <Ionicons name="sparkles" size={Math.round(14 * scale)} color={theme.colors.text} />
                <Text style={[styles.countText, { fontSize: pillText }]}>{scenes.length} Scenes</Text>
              </View>
              <Pressable
                style={[styles.addPill, { height: pillHeight, borderRadius: Math.round(pillHeight / 2) }]}
                onPress={openCreate}
              >
                <Ionicons name="add" size={Math.round(16 * scale)} color={theme.colors.text} />
                <Text style={[styles.addText, { fontSize: pillText }]}>Create</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.sectionsGrid, isWide && { flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }]}>
            {sections.map(({ room, scenes: roomScenes }) => (
              <View
                key={room.id}
                style={[
                  styles.section,
                  {
                    marginTop: isWide ? 0 : gridGap,
                    width: isWide ? (contentWidth - gridGap) / 2 : '100%',
                  },
                ]}
              >
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { fontSize: sectionTitleSize }]}>{room.name}</Text>
                  <Text style={[styles.sectionSub, { fontSize: sectionSubSize }]}>{roomScenes.length} presets</Text>
                </View>

                {roomScenes.length === 0 ? (
                  <View style={[styles.emptyCard, { padding: cardPad, borderRadius: cardRadius }]}>
                    <Text style={styles.emptyTitle}>No scenes yet</Text>
                    <Text style={styles.emptySub}>Create a quick mood from your devices.</Text>
                  </View>
                ) : (
                  roomScenes.map((scene) => {
                    const deviceIds = Array.from(new Set(scene.actions.map((a) => a.deviceId)));
                    const sceneDevices = deviceIds
                      .map((id) => deviceMap.get(id))
                      .filter(Boolean) as Device[];
                    const actionLabels = scene.actions.map((action) => formatAction(action, deviceMap));
                    return (
                      <SceneCard
                        key={scene.id}
                        scene={scene}
                        devices={sceneDevices}
                        actionLabels={actionLabels}
                        isActive={scene.id === activeSceneId}
                        onRun={() => runScene(scene.id)}
                      />
                    );
                  })
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <Modal transparent visible={showCreate} animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowCreate(false)} />
          <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })}>
            <LinearGradient
              colors={['rgba(255,255,255,0.96)', 'rgba(246,238,255,0.92)']}
              start={{ x: 0.1, y: 0.1 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.modalCard,
                {
                  borderRadius: modalRadius,
                  maxWidth: isTablet ? 640 : undefined,
                  width: isTablet ? Math.min(contentWidth - gutter * 2, 640) : undefined,
                  alignSelf: isTablet ? 'center' : 'stretch',
                },
              ]}
            >
              <ScrollView
                contentContainerStyle={[styles.modalContent, { padding: modalPad }]}
                showsVerticalScrollIndicator={false}
              >
                <Text style={[styles.modalTitle, { fontSize: modalTitleSize }]}>Create scene</Text>
                <Text style={[styles.modalSub, { fontSize: modalSubSize }]}>Capture a mood for this room.</Text>

                <Text style={[styles.modalLabel, { fontSize: modalLabelSize }]}>Scene name</Text>
                <TextInput
                  value={sceneName}
                  onChangeText={setSceneName}
                  placeholder="Movie Night"
                  placeholderTextColor="rgba(12,12,18,0.45)"
                  style={[styles.modalInput, { height: modalInputHeight, borderRadius: Math.round(modalInputHeight * 0.28) }]}
                />

                <Text style={[styles.modalLabel, { fontSize: modalLabelSize }]}>Room</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roomRow}>
                  {rooms.map((room) => {
                    const active = room.id === roomId;
                    return (
                      <Pressable
                        key={room.id}
                        style={[
                          styles.roomPill,
                          { height: roomPillHeight, borderRadius: Math.round(roomPillHeight / 2) },
                          active && styles.roomPillActive,
                        ]}
                        onPress={() => {
                          setRoomId(room.id);
                          setSelectedDeviceIds([]);
                          setOverrides({});
                        }}
                      >
                        <Text
                          style={[
                            styles.roomPillText,
                            { fontSize: modalLabelSize },
                            active && styles.roomPillTextActive,
                          ]}
                        >
                          {room.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={[styles.modalLabel, { fontSize: modalLabelSize }]}>Devices</Text>
                {roomDevices.length === 0 ? (
                  <Text style={[styles.modalHint, { fontSize: modalSubSize }]}>No devices in this room yet.</Text>
                ) : (
                  <View style={styles.deviceGrid}>
                    {roomDevices.map((device) => {
                      const active = selectedDeviceIds.includes(device.id);
                      return (
                        <Pressable
                          key={device.id}
                          style={[
                            styles.deviceChip,
                            { height: deviceChipHeight, borderRadius: Math.round(deviceChipHeight * 0.4) },
                            active && styles.deviceChipActive,
                          ]}
                          onPress={() => toggleDeviceSelection(device)}
                        >
                          <View style={[styles.deviceIcon, active && styles.deviceIconActive]}>
                            <DeviceIcon
                              kind={device.kind}
                              size={Math.round(14 * scale)}
                              color={active ? '#fff' : '#2B0A73'}
                            />
                          </View>
                          <Text
                            style={[styles.deviceText, { fontSize: modalLabelSize }, active && styles.deviceTextActive]}
                            numberOfLines={1}
                          >
                            {device.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <Text style={[styles.modalLabel, { fontSize: modalLabelSize }]}>Controls</Text>
                {selectedDeviceIds.length === 0 ? (
                  <Text style={[styles.modalHint, { fontSize: modalSubSize }]}>
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
                <Text style={[styles.modalHint, { fontSize: modalSubSize }]}>
                  Scenes capture the current device settings.
                </Text>

                <View style={styles.modalRow}>
                  <Pressable
                    style={[
                      styles.modalGhost,
                      { height: modalBtnHeight, borderRadius: Math.round(modalBtnHeight * 0.28) },
                    ]}
                    onPress={() => setShowCreate(false)}
                  >
                    <Text style={[styles.modalGhostText, { fontSize: modalLabelSize }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.modalPrimary,
                      { height: modalBtnHeight, borderRadius: Math.round(modalBtnHeight * 0.28) },
                      !canCreate && styles.modalPrimaryDisabled,
                    ]}
                    onPress={handleCreate}
                    disabled={!canCreate}
                  >
                    <Text style={[styles.modalPrimaryText, { fontSize: modalLabelSize }]}>Create</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </LinearGradient>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { alignItems: 'center' },
  sectionsGrid: { gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  h1: { color: theme.colors.text, fontSize: 28, fontWeight: '900' },
  p: { marginTop: 8, color: theme.colors.subtext, fontWeight: '700' },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  countText: { color: theme.colors.text, fontWeight: '800', fontSize: 12 },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(180,107,255,0.25)',
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  addText: { color: theme.colors.text, fontWeight: '800', fontSize: 12 },
  section: { marginTop: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  sectionSub: { color: theme.colors.muted, fontWeight: '700', fontSize: 12 },
  emptyCard: {
    marginTop: 10,
    padding: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  emptyTitle: { color: theme.colors.text, fontWeight: '900' },
  emptySub: { marginTop: 6, color: theme.colors.subtext, fontWeight: '700' },
  sceneCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 22,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  sceneCardActive: {
    backgroundColor: 'rgba(180,107,255,0.24)',
    borderColor: 'rgba(180,107,255,0.6)',
    shadowColor: theme.colors.glow,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  sceneHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sceneTitle: { color: theme.colors.text, fontWeight: '900' },
  sceneSub: { marginTop: 6, color: theme.colors.subtext, fontWeight: '700', fontSize: 12 },
  runPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(180,107,255,0.25)',
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  runPillActive: {
    backgroundColor: theme.colors.accent2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  runText: { color: theme.colors.text, fontWeight: '800', fontSize: 12 },
  runTextActive: { color: '#fff' },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChipOn: {
    backgroundColor: 'rgba(180,107,255,0.32)',
    borderColor: 'rgba(180,107,255,0.65)',
    shadowColor: theme.colors.glow,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  moreChip: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { color: theme.colors.subtext, fontWeight: '800', fontSize: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  actionText: { color: theme.colors.subtext, fontWeight: '800', fontSize: 11 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 18,
  },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  modalCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    maxHeight: '85%',
  },
  modalContent: { padding: 18 },
  modalTitle: { color: 'rgba(12,12,18,0.9)', fontWeight: '900', fontSize: 18 },
  modalSub: { color: 'rgba(12,12,18,0.55)', fontWeight: '700', marginTop: 6 },
  modalLabel: { color: 'rgba(12,12,18,0.75)', fontWeight: '800', marginTop: 12, marginBottom: 6 },
  modalInput: {
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.08)',
    paddingHorizontal: 12,
    color: 'rgba(12,12,18,0.9)',
    fontWeight: '700',
  },
  roomRow: { gap: 8, paddingVertical: 6 },
  roomPill: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(12,12,18,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomPillActive: { backgroundColor: 'rgba(107,60,255,0.2)', borderColor: 'rgba(107,60,255,0.3)' },
  roomPillText: { color: 'rgba(12,12,18,0.7)', fontWeight: '800', fontSize: 12 },
  roomPillTextActive: { color: 'rgba(12,12,18,0.9)' },
  deviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  deviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(12,12,18,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.08)',
    maxWidth: '48%',
  },
  deviceChipActive: { backgroundColor: '#6B3CFF', borderColor: '#6B3CFF' },
  deviceIcon: {
    width: 22,
    height: 22,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  deviceIconActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  deviceText: { color: 'rgba(12,12,18,0.8)', fontWeight: '800', fontSize: 12, flexShrink: 1 },
  deviceTextActive: { color: '#fff' },
  modalHint: { marginTop: 8, color: 'rgba(12,12,18,0.55)', fontWeight: '700' },
  modalRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalGhost: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalGhostText: { color: 'rgba(12,12,18,0.75)', fontWeight: '800' },
  modalPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#6B3CFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryDisabled: { opacity: 0.6 },
  modalPrimaryText: { color: '#FFFFFF', fontWeight: '900' },
  controlsStack: { gap: 12, marginTop: 6 },
  deviceControlCard: {
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.08)',
  },
  deviceControlHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deviceControlIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: 'rgba(107,60,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceControlTitle: { color: 'rgba(12,12,18,0.95)', fontWeight: '900' },
  deviceControlSub: { marginTop: 4, color: 'rgba(12,12,18,0.55)', fontWeight: '700', fontSize: 12 },
  inlineToggleRow: { flexDirection: 'row', gap: 6 },
  inlineTogglePill: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.12)',
    backgroundColor: 'rgba(12,12,18,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineTogglePillActive: { backgroundColor: '#6B3CFF', borderColor: '#6B3CFF' },
  inlineToggleText: { color: 'rgba(12,12,18,0.7)', fontWeight: '800', fontSize: 12 },
  inlineToggleTextActive: { color: '#fff' },
  sliderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  sliderLabel: { color: 'rgba(12,12,18,0.7)', fontWeight: '800', fontSize: 12 },
  sliderValue: { color: 'rgba(12,12,18,0.9)', fontWeight: '900', fontSize: 12 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  choicePill: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(12,12,18,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choicePillActive: { backgroundColor: '#6B3CFF', borderColor: '#6B3CFF' },
  choiceText: { color: 'rgba(12,12,18,0.7)', fontWeight: '800', fontSize: 12 },
  choiceTextActive: { color: '#fff' },
  colorRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.15)',
  },
  colorDotActive: { borderColor: '#6B3CFF', borderWidth: 2 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: 'rgba(12,12,18,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { minWidth: 72, textAlign: 'center', color: 'rgba(12,12,18,0.9)', fontWeight: '900' },
  controlHint: { marginTop: 8, color: 'rgba(12,12,18,0.55)', fontWeight: '700', fontSize: 12 },
});

const LIGHT_COLORS = ['#FFFFFF', '#FFD166', '#FF6B6B', '#B46BFF', '#4DD0E1', '#7DFFB6', '#A0E9FF'];
const WASH_CYCLES = ['Normal', 'Quick', 'Delicates', 'Eco'];
const VACUUM_STATES = ['docked', 'cleaning', 'paused'] as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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

  const renderControls = () => {
    switch (device.kind) {
      case 'ac': {
        const temp = override?.tempC ?? device.tempC ?? 22;
        const mode = override?.mode ?? device.mode ?? 'cold';
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={[styles.sliderLabel, { fontSize: sliderLabelSize }]}>Temperature</Text>
              <Text style={[styles.sliderValue, { fontSize: sliderValueSize }]}>{temp}°C</Text>
            </View>
            <Slider
              style={{ marginTop: Math.round(6 * scale) }}
              minimumValue={AC_TEMP_MIN_C}
              maximumValue={AC_TEMP_MAX_C}
              value={temp}
              minimumTrackTintColor="#6B3CFF"
              maximumTrackTintColor="rgba(12,12,18,0.1)"
              thumbTintColor="#FFFFFF"
              onValueChange={(v) => onPatch({ tempC: Math.round(v) })}
            />
            <View style={styles.choiceRow}>
              {(['cold', 'fan', 'dry'] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[
                    styles.choicePill,
                    { height: choiceHeight, borderRadius: choiceRadius },
                    mode === m && styles.choicePillActive,
                  ]}
                  onPress={() => onPatch({ mode: m })}
                >
                  <Text style={[styles.choiceText, { fontSize: choiceTextSize }, mode === m && styles.choiceTextActive]}>
                    {m[0].toUpperCase() + m.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        );
      }
      case 'light': {
        const brightness = override?.brightness ?? device.brightness ?? 60;
        const color = override?.color ?? device.color ?? LIGHT_COLORS[0];
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={[styles.sliderLabel, { fontSize: sliderLabelSize }]}>Brightness</Text>
              <Text style={[styles.sliderValue, { fontSize: sliderValueSize }]}>{Math.round(brightness)}%</Text>
            </View>
            <Slider
              style={{ marginTop: Math.round(6 * scale) }}
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
                  <View
                    style={[
                      styles.colorDot,
                      {
                        backgroundColor: c,
                        width: colorDotSize,
                        height: colorDotSize,
                        borderRadius: Math.round(colorDotSize / 2),
                      },
                      color === c && styles.colorDotActive,
                    ]}
                  />
                </Pressable>
              ))}
            </View>
          </>
        );
      }
      case 'tv': {
        const volume = override?.volume ?? device.volume ?? 20;
        const channel = override?.channel ?? device.channel ?? 1;
        const muted = override?.muted ?? device.muted ?? false;
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={[styles.sliderLabel, { fontSize: sliderLabelSize }]}>Volume</Text>
              <Text style={[styles.sliderValue, { fontSize: sliderValueSize }]}>{Math.round(volume)}</Text>
            </View>
            <Slider
              style={{ marginTop: Math.round(6 * scale) }}
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
                style={[styles.stepBtn, { width: stepBtnSize, height: stepBtnSize, borderRadius: stepBtnRadius }]}
                onPress={() => onPatch({ channel: clamp(channel - 1, 1, 99) })}
              >
                <Ionicons name="remove" size={stepIconSize} color="rgba(12,12,18,0.75)" />
              </Pressable>
              <Text style={[styles.stepValue, { fontSize: sliderValueSize }]}>Ch {channel}</Text>
              <Pressable
                style={[styles.stepBtn, { width: stepBtnSize, height: stepBtnSize, borderRadius: stepBtnRadius }]}
                onPress={() => onPatch({ channel: clamp(channel + 1, 1, 99) })}
              >
                <Ionicons name="add" size={stepIconSize} color="rgba(12,12,18,0.75)" />
              </Pressable>
            </View>
            <View style={styles.choiceRow}>
              <Pressable
                style={[
                  styles.choicePill,
                  { height: choiceHeight, borderRadius: choiceRadius },
                  !muted && styles.choicePillActive,
                ]}
                onPress={() => onPatch({ muted: false })}
              >
                <Text style={[styles.choiceText, { fontSize: choiceTextSize }, !muted && styles.choiceTextActive]}>
                  Sound
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.choicePill,
                  { height: choiceHeight, borderRadius: choiceRadius },
                  muted && styles.choicePillActive,
                ]}
                onPress={() => onPatch({ muted: true })}
              >
                <Text style={[styles.choiceText, { fontSize: choiceTextSize }, muted && styles.choiceTextActive]}>
                  Muted
                </Text>
              </Pressable>
            </View>
          </>
        );
      }
      case 'fan': {
        const speed = override?.speed ?? device.speed ?? 60;
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={[styles.sliderLabel, { fontSize: sliderLabelSize }]}>Speed</Text>
              <Text style={[styles.sliderValue, { fontSize: sliderValueSize }]}>{Math.round(speed)}%</Text>
            </View>
            <Slider
              style={{ marginTop: Math.round(6 * scale) }}
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
      case 'garage':
      case 'door':
      case 'gate':
      case 'window': {
        const openPercent = override?.openPercent ?? device.openPercent ?? 0;
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={[styles.sliderLabel, { fontSize: sliderLabelSize }]}>Open</Text>
              <Text style={[styles.sliderValue, { fontSize: sliderValueSize }]}>{Math.round(openPercent)}%</Text>
            </View>
            <Slider
              style={{ marginTop: Math.round(6 * scale) }}
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
      case 'vacuum': {
        const status = override?.status ?? device.status ?? 'docked';
        return (
          <View style={styles.choiceRow}>
            {VACUUM_STATES.map((state) => (
              <Pressable
                key={state}
                style={[
                  styles.choicePill,
                  { height: choiceHeight, borderRadius: choiceRadius },
                  status === state && styles.choicePillActive,
                ]}
                onPress={() => onPatch({ status: state })}
              >
                <Text style={[styles.choiceText, { fontSize: choiceTextSize }, status === state && styles.choiceTextActive]}>
                  {state[0].toUpperCase() + state.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        );
      }
      case 'camera': {
        const armed = override?.armed ?? device.armed ?? true;
        const recording = override?.recording ?? device.recording ?? false;
        return (
          <>
            <View style={styles.choiceRow}>
              <Pressable
                style={[
                  styles.choicePill,
                  { height: choiceHeight, borderRadius: choiceRadius },
                  armed && styles.choicePillActive,
                ]}
                onPress={() => onPatch({ armed: true })}
              >
                <Text style={[styles.choiceText, { fontSize: choiceTextSize }, armed && styles.choiceTextActive]}>
                  Armed
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.choicePill,
                  { height: choiceHeight, borderRadius: choiceRadius },
                  !armed && styles.choicePillActive,
                ]}
                onPress={() => onPatch({ armed: false })}
              >
                <Text style={[styles.choiceText, { fontSize: choiceTextSize }, !armed && styles.choiceTextActive]}>
                  Disarmed
                </Text>
              </Pressable>
            </View>
            <View style={styles.choiceRow}>
              <Pressable
                style={[
                  styles.choicePill,
                  { height: choiceHeight, borderRadius: choiceRadius },
                  recording && styles.choicePillActive,
                ]}
                onPress={() => onPatch({ recording: true })}
              >
                <Text style={[styles.choiceText, { fontSize: choiceTextSize }, recording && styles.choiceTextActive]}>
                  Recording
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.choicePill,
                  { height: choiceHeight, borderRadius: choiceRadius },
                  !recording && styles.choicePillActive,
                ]}
                onPress={() => onPatch({ recording: false })}
              >
                <Text style={[styles.choiceText, { fontSize: choiceTextSize }, !recording && styles.choiceTextActive]}>
                  Idle
                </Text>
              </Pressable>
            </View>
          </>
        );
      }
      case 'stove': {
        const burnerLevel = override?.burnerLevel ?? device.burnerLevel ?? 0;
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={[styles.sliderLabel, { fontSize: sliderLabelSize }]}>Heat</Text>
              <Text style={[styles.sliderValue, { fontSize: sliderValueSize }]}>{Math.round(burnerLevel)}</Text>
            </View>
            <Slider
              style={{ marginTop: Math.round(6 * scale) }}
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
      case 'washer':
      case 'dryer': {
        const cycle = override?.cycle ?? device.cycle ?? 'Normal';
        return (
          <View style={styles.choiceRow}>
            {WASH_CYCLES.map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.choicePill,
                  { height: choiceHeight, borderRadius: choiceRadius },
                  cycle === c && styles.choicePillActive,
                ]}
                onPress={() => onPatch({ cycle: c })}
              >
                <Text style={[styles.choiceText, { fontSize: choiceTextSize }, cycle === c && styles.choiceTextActive]}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
        );
      }
      case 'microwave': {
        const timeRemainingSec = override?.timeRemainingSec ?? device.timeRemainingSec ?? 120;
        const minutes = Math.max(1, Math.round(timeRemainingSec / 60));
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={[styles.sliderLabel, { fontSize: sliderLabelSize }]}>Timer</Text>
              <Text style={[styles.sliderValue, { fontSize: sliderValueSize }]}>{minutes}m</Text>
            </View>
            <Slider
              style={{ marginTop: Math.round(6 * scale) }}
              minimumValue={60}
              maximumValue={900}
              value={timeRemainingSec}
              minimumTrackTintColor="#6B3CFF"
              maximumTrackTintColor="rgba(12,12,18,0.1)"
              thumbTintColor="#FFFFFF"
              onValueChange={(v) => onPatch({ timeRemainingSec: Math.round(v / 30) * 30 })}
            />
          </>
        );
      }
      case 'fridge': {
        const temp = override?.tempC ?? device.tempC ?? 4;
        return (
          <>
            <View style={styles.sliderRow}>
              <Text style={[styles.sliderLabel, { fontSize: sliderLabelSize }]}>Temperature</Text>
              <Text style={[styles.sliderValue, { fontSize: sliderValueSize }]}>{temp}°C</Text>
            </View>
            <Slider
              style={{ marginTop: Math.round(6 * scale) }}
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
      case 'coffee':
        return <Text style={[styles.controlHint, { fontSize: hintSize }]}>Brew uses the On/Off state.</Text>;
      default:
        return <Text style={[styles.controlHint, { fontSize: hintSize }]}>No extra controls for this device.</Text>;
    }
  };

  return (
    <View style={[styles.deviceControlCard, { padding: cardPad, borderRadius: cardRadius }]}>
      <View style={styles.deviceControlHeader}>
        <View style={[styles.deviceControlIcon, { width: iconWrap, height: iconWrap, borderRadius: iconRadius }]}>
          <DeviceIcon kind={device.kind} size={iconSize} color="#6B3CFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.deviceControlTitle, { fontSize: titleSize }]}>{device.name}</Text>
          <Text style={[styles.deviceControlSub, { fontSize: subSize }]}>{labelForKind(device.kind)}</Text>
        </View>
        <View style={styles.inlineToggleRow}>
          <Pressable
            style={[
              styles.inlineTogglePill,
              { height: toggleHeight, borderRadius: toggleRadius },
              isOn && styles.inlineTogglePillActive,
            ]}
            onPress={() => onPatch({ isOn: true })}
          >
            <Text style={[styles.inlineToggleText, { fontSize: toggleText }, isOn && styles.inlineToggleTextActive]}>
              On
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.inlineTogglePill,
              { height: toggleHeight, borderRadius: toggleRadius },
              !isOn && styles.inlineTogglePillActive,
            ]}
            onPress={() => onPatch({ isOn: false })}
          >
            <Text style={[styles.inlineToggleText, { fontSize: toggleText }, !isOn && styles.inlineToggleTextActive]}>
              Off
            </Text>
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
}: {
  scene: Scene;
  devices: Device[];
  actionLabels: string[];
  isActive: boolean;
  onRun: () => void;
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

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.sequence([
      Animated.timing(pressScale, { toValue: 0.97, duration: 90, useNativeDriver: true }),
      Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, friction: 5 }),
    ]).start();
    onRun();
  };

  return (
    <Animated.View style={{ transform: [{ scale: pressScale }] }}>
      <Pressable
        style={[
          styles.sceneCard,
          { padding: cardPad, borderRadius: cardRadius },
          isActive && styles.sceneCardActive,
        ]}
        onPress={handlePress}
      >
        <View style={styles.sceneHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sceneTitle, { fontSize: titleSize }]}>{scene.name}</Text>
            <Text style={[styles.sceneSub, { fontSize: subSize }]}>
              {scene.actions.length} actions • {devices.length} devices
            </Text>
          </View>
          <View
            style={[
              styles.runPill,
              { height: runHeight, borderRadius: runRadius },
              isActive && styles.runPillActive,
            ]}
          >
            <Ionicons
              name={isActive ? 'checkmark-circle' : 'play'}
              size={Math.round(14 * scaleFactor)}
              color={theme.colors.text}
            />
            <Text style={[styles.runText, { fontSize: runText }, isActive && styles.runTextActive]}>
              {isActive ? 'Active' : 'Run'}
            </Text>
          </View>
        </View>

        <View style={styles.iconRow}>
          {devices.slice(0, 4).map((device) => (
            <View
              key={device.id}
              style={[
                styles.iconChip,
                { width: iconChipSize, height: iconChipSize, borderRadius: iconChipRadius },
                device.isOn && styles.iconChipOn,
              ]}
            >
              <DeviceIcon kind={device.kind} size={iconSize} color={theme.colors.text} />
            </View>
          ))}
          {devices.length > 4 && (
            <View
              style={[
                styles.moreChip,
                { height: iconChipSize, borderRadius: iconChipRadius, paddingHorizontal: Math.round(iconChipSize * 0.3) },
              ]}
            >
              <Text style={[styles.moreText, { fontSize: actionText }]}>+{devices.length - 4}</Text>
            </View>
          )}
        </View>

        <View style={styles.chipRow}>
          {chips.map((label) => (
            <View
              key={label}
              style={[
                styles.actionChip,
                { paddingHorizontal: actionChipPad, paddingVertical: Math.round(actionChipPad * 0.6) },
              ]}
            >
              <Text style={[styles.actionText, { fontSize: actionText }]}>{label}</Text>
            </View>
          ))}
          {extra > 0 && (
            <View
              style={[
                styles.actionChip,
                { paddingHorizontal: actionChipPad, paddingVertical: Math.round(actionChipPad * 0.6) },
              ]}
            >
              <Text style={[styles.actionText, { fontSize: actionText }]}>+{extra} more</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function labelForKind(kind: Device['kind']) {
  switch (kind) {
    case 'ac':
      return 'Air Conditioner';
    case 'light':
      return 'Lighting';
    case 'tv':
      return 'Smart TV';
    case 'coffee':
      return 'Coffee Machine';
    case 'fridge':
      return 'Refrigerator';
    case 'garage':
      return 'Garage Door';
    case 'gate':
      return 'Front Gate';
    case 'fan':
      return 'Ceiling Fan';
    case 'door':
      return 'Door';
    case 'vacuum':
      return 'Vacuum';
    case 'camera':
      return 'Camera';
    case 'window':
      return 'Window';
    case 'stove':
      return 'Stove';
    case 'washer':
      return 'Washer';
    case 'dryer':
      return 'Dryer';
    case 'microwave':
      return 'Microwave';
    case 'energy':
      return 'Energy Monitor';
    case 'water':
      return 'Water Meter';
    case 'air':
      return 'Air Quality';
    case 'sprinkler':
      return 'Sprinkler';
    case 'speaker':
      return 'Speaker';
    case 'smoke':
      return 'Smoke/CO';
    default:
      return 'Device';
  }
}

function formatAction(action: SceneAction, devices: Map<string, Device>): string {
  const device = devices.get(action.deviceId);
  if (!device) return 'Device update';

  if (action.type === 'toggle') {
    return `${device.name} ${action.on === false ? 'OFF' : 'ON'}`;
  }

  const patch = action.patch;
  if (patch.tempC != null) return `${device.name} ${patch.tempC}°C`;
  if (patch.brightness != null) return `${device.name} ${patch.brightness}%`;
  if (patch.color) return `${device.name} Color`;
  if (patch.volume != null) return `${device.name} Vol ${patch.volume}`;
  if (patch.source) return `${device.name} ${patch.source}`;
  if (patch.muted != null) return `${device.name} ${patch.muted ? 'Muted' : 'Sound'}`;
  if (patch.openPercent != null) return `${device.name} ${patch.openPercent}%`;
  if (patch.speed != null) return `${device.name} ${patch.speed}%`;
  if (patch.status) return `${device.name} ${patch.status}`;
  if (patch.armed != null) return `${device.name} ${patch.armed ? 'Armed' : 'Disarmed'}`;
  if (patch.recording != null) return `${device.name} ${patch.recording ? 'Recording' : 'Idle'}`;
  if (patch.burnerLevel != null) return `${device.name} Heat ${patch.burnerLevel}`;
  if (patch.cycle) return `${device.name} ${patch.cycle}`;
  if (patch.channel != null) return `${device.name} Ch ${patch.channel}`;
  if (patch.timeRemainingSec != null) {
    const minutes = Math.max(1, Math.round(patch.timeRemainingSec / 60));
    return `${device.name} ${minutes}m`;
  }
  if (patch.isOn != null) return `${device.name} ${patch.isOn ? 'ON' : 'OFF'}`;
  return `${device.name} update`;
}

function buildSceneAction(device: Device, override?: Partial<Device>): SceneAction {
  const isOn = override?.isOn ?? device.isOn ?? true;
  const patch: Partial<Device> = { isOn };
  switch (device.kind) {
    case 'ac':
      patch.tempC = device.tempC ?? 22;
      patch.mode = device.mode ?? 'cold';
      break;
    case 'light':
      patch.brightness = device.brightness ?? 60;
      if (device.color) patch.color = device.color;
      break;
    case 'tv':
      patch.volume = device.volume ?? 20;
      if (device.channel != null) patch.channel = device.channel;
      if (device.muted != null) patch.muted = device.muted;
      if (device.source) patch.source = device.source;
      break;
    case 'fan':
      patch.speed = device.speed ?? 60;
      break;
    case 'garage':
    case 'door':
    case 'gate':
    case 'window':
      patch.openPercent = device.openPercent ?? 0;
      break;
    case 'vacuum':
      patch.status = device.status ?? 'cleaning';
      break;
    case 'camera':
      patch.armed = device.armed ?? true;
      patch.recording = device.recording ?? false;
      break;
    case 'stove':
      patch.burnerLevel = device.burnerLevel ?? 1;
      break;
    case 'washer':
    case 'dryer':
      patch.cycle = device.cycle ?? 'Normal';
      patch.progress = device.progress ?? 0;
      break;
    case 'microwave':
      patch.timeRemainingSec = device.timeRemainingSec ?? 60;
      break;
    case 'fridge':
      patch.tempC = device.tempC ?? 4;
      break;
    default:
      break;
  }

  if (override) Object.assign(patch, override);
  return { type: 'patch', deviceId: device.id, patch };
}
