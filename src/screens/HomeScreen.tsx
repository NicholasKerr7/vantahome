import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Pressable from '../components/Pressable';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme/theme';
import AvatarChip from '../components/AvatarChip';
import GradientOrb from '../components/GradientOrb';
import BackgroundLines from '../components/BackgroundLines';
import RoomCarousel from '../components/RoomCarousel';
import { useHomeStore } from '../store/useHomeStore';
import { useResponsive } from '../theme/layout';

export default function HomeScreen() {
  const { contentWidth, gutter, isTablet, isLandscape, topPad, scale } = useResponsive(720);
  const greetingSize = Math.round((isTablet ? 22 : 16) * scale);
  const bellSize = Math.round((isTablet ? 44 : 38) * scale);
  const bellRadius = Math.round(bellSize * 0.36);
  const bellIcon = Math.round((isTablet ? 22 : 20) * scale);
  const roomsTitleSize = Math.round((isTablet ? 18 : 16) * scale);
  const roomsBtnHeight = Math.round((isTablet ? 38 : 34) * scale);
  const roomsBtnText = Math.round((isTablet ? 13 : 12) * scale);
  const roomsGap = Math.round((isTablet ? 10 : 8) * scale);
  const heroGap = Math.round((isTablet ? 28 : 16) * scale);
  const avatarSize = Math.round((isTablet ? (isLandscape ? 48 : 52) : 38) * scale);
  const topGutter = isTablet ? Math.max(12, gutter - 8) : gutter;
  const modalTitleSize = Math.round((isTablet ? 20 : 18) * scale);
  const modalSubSize = Math.round((isTablet ? 14 : 12) * scale);
  const modalInputHeight = Math.round((isTablet ? 48 : 46) * scale);
  const modalButtonHeight = Math.round((isTablet ? 46 : 44) * scale);
  const nav = useNavigation<any>();
  const goRoot = (name: string, params?: Record<string, any>) => {
    // Navigate from nested stacks without needing to know the active parent.
    const parent = nav.getParent?.();
    if (parent?.navigate) parent.navigate(name as never, params as never);
    else nav.navigate(name as never, params as never);
  };

  const userName = useHomeStore((s) => s.userName);
  const profile = useHomeStore((s) => s.profile);
  const outdoor = useHomeStore((s) => s.outdoor);
  const rooms = useHomeStore((s) => s.rooms);
  const devicesAll = useHomeStore((s) => s.devices);
  const addRoom = useHomeStore((s) => s.addRoom);
  const indoorFallback = useHomeStore((s) => s.indoor);
  const [activeRoomIndex, setActiveRoomIndex] = useState(0);

  const [showAddRoom, setShowAddRoom] = useState(false);
  const [roomName, setRoomName] = useState('');
  const canCreate = roomName.trim().length > 1;
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    // Refresh greeting at minute granularity so it stays accurate without over-rendering.
    const timer = setInterval(() => setClock(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const greeting = useMemo(() => {
    const hour = clock.getHours();
    if (hour < 5) return 'Good night';
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Good night';
  }, [clock]);

  const handleCreateRoom = () => {
    if (!canCreate) return;
    addRoom(roomName.trim());
    setRoomName('');
    setShowAddRoom(false);
  };

  const activeRoom = rooms[Math.max(0, Math.min(activeRoomIndex, rooms.length - 1))];
  const roomDevices = useMemo(
    () => devicesAll.filter((d) => d.roomId === activeRoom?.id),
    [devicesAll, activeRoom?.id]
  );
  const featuredDevices = useMemo(() => {
    // Pick attention-worthy devices first, then fill with active/any devices.
    const picked: typeof devicesAll = [];
    const seen = new Set<string>();
    const add = (device?: (typeof devicesAll)[number]) => {
      if (!device || seen.has(device.id)) return;
      picked.push(device);
      seen.add(device.id);
    };

    const alerts = devicesAll.filter(
      (d) =>
        (d.kind === 'smoke' && d.smokeDetected) ||
        (d.kind === 'water' && d.waterLeakDetected) ||
        (d.kind === 'camera' && d.recording)
    );
    alerts.forEach(add);

    ['energy', 'water', 'camera'].forEach((kind) => {
      if (picked.length >= 3) return;
      add(devicesAll.find((d) => d.kind === kind));
    });

    if (picked.length < 3) {
      devicesAll.filter((d) => d.isOn).forEach(add);
    }

    if (picked.length < 3) {
      devicesAll.forEach(add);
    }

    return picked.slice(0, 3);
  }, [devicesAll]);
  const hasWholeHome = featuredDevices.length > 0;
  const roomAcs = roomDevices.filter((d) => d.kind === 'ac' && d.isOn && typeof d.tempC === 'number');
  const indoorTemp =
    roomAcs.length > 0
      ? Math.round(roomAcs.reduce((sum, d) => sum + (d.tempC ?? 0), 0) / roomAcs.length)
      : indoorFallback.tempC;
  const indoor = {
    tempC: indoorTemp,
    label: indoorFallback.label,
  };

  return (
    <LinearGradient colors={[theme.colors.bg1, theme.colors.bg0]} style={styles.root}>
      <BackgroundLines />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Math.round((isTablet ? (isLandscape ? 140 : 160) : 120) * scale) },
        ]}
      >
        <View style={{ width: contentWidth }}>
          <View style={{ paddingHorizontal: topGutter, paddingTop: topPad }}>
            <View style={styles.topBar}>
              <Text style={[styles.greeting, { fontSize: greetingSize }]} numberOfLines={1}>
                {greeting}, {profile.name || userName}!
              </Text>
              <View style={styles.topActions}>
                <Pressable
                  style={[styles.bell, { width: bellSize, height: bellSize, borderRadius: bellRadius }]}
                  onPress={() => goRoot('Notifications')}
                  testID="home-notifications-button"
                >
                  <Ionicons name="notifications-outline" size={bellIcon} color={theme.colors.text} />
                </Pressable>
                <Pressable
                  style={styles.avatarBtn}
                  onPress={() => goRoot('Profile')}
                  hitSlop={8}
                  testID="home-avatar-button"
                >
                  <AvatarChip
                    name={profile.name || userName}
                    color={profile.avatarColor}
                    uri={profile.avatarUri}
                    size={avatarSize}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.heroStack}>
            <GradientOrb outdoor={outdoor} indoor={indoor} />

            <View style={[styles.roomsSection, { width: contentWidth, marginTop: heroGap }]}>
              <View style={[styles.roomsHeader, { paddingHorizontal: gutter }]}>
                <Text style={[styles.roomsTitle, { fontSize: roomsTitleSize }]}>Rooms</Text>
                <View style={[styles.roomsActions, { gap: roomsGap }]}>
                  <Pressable style={[styles.roomsAdd, { height: roomsBtnHeight }]} onPress={() => goRoot('ManageRooms')}>
                    <Ionicons name="settings-outline" size={Math.round(14 * scale)} color={theme.colors.text} />
                    <Text style={[styles.roomsAddText, { fontSize: roomsBtnText }]}>Manage</Text>
                  </Pressable>
                  <Pressable style={[styles.roomsAdd, { height: roomsBtnHeight }]} onPress={() => setShowAddRoom(true)}>
                    <Ionicons name="add" size={Math.round(16 * scale)} color={theme.colors.text} />
                    <Text style={[styles.roomsAddText, { fontSize: roomsBtnText }]}>Add room</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.roomsCarouselWrap}>
                <RoomCarousel
                  rooms={rooms}
                  devices={devicesAll}
                  onRoomPress={(roomId) => goRoot('Room', { roomId })}
                  onDevicePress={(deviceId) => goRoot('DeviceDetail', { deviceId })}
                  onIndexChange={(index) =>
                    setActiveRoomIndex(hasWholeHome ? Math.max(0, index - 1) : index)
                  }
                  wholeHomeDevices={hasWholeHome ? featuredDevices : undefined}
                  onWholeHomePress={() => goRoot('Room', { showAll: true })}
                />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal transparent visible={showAddRoom} animationType="fade" onRequestClose={() => setShowAddRoom(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowAddRoom(false)} />
          <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })}>
            <LinearGradient
              colors={['rgba(255,255,255,0.96)', 'rgba(246,238,255,0.90)']}
              start={{ x: 0.1, y: 0.1 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.modalCard,
                isTablet && {
                  maxWidth: 520,
                  width: Math.min(contentWidth - gutter * 2, 520),
                  alignSelf: 'center',
                },
              ]}
            >
              <Text style={[styles.modalTitle, { fontSize: modalTitleSize }]}>Add room</Text>
              <Text style={[styles.modalSub, { fontSize: modalSubSize }]}>
                Name your space so it stays organized.
              </Text>

              <TextInput
                value={roomName}
                onChangeText={setRoomName}
                placeholder="Office, Patio, Studio..."
                placeholderTextColor="rgba(12,12,18,0.45)"
                style={[styles.modalInput, { height: modalInputHeight, borderRadius: Math.round(modalInputHeight * 0.3) }]}
                autoCapitalize="words"
                returnKeyType="done"
              />

              <View style={styles.modalRow}>
                <Pressable
                  style={[
                    styles.modalGhost,
                    { height: modalButtonHeight, borderRadius: Math.round(modalButtonHeight * 0.3) },
                  ]}
                  onPress={() => setShowAddRoom(false)}
                >
                  <Text style={[styles.modalGhostText, { fontSize: modalSubSize }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalPrimary,
                    { height: modalButtonHeight, borderRadius: Math.round(modalButtonHeight * 0.3) },
                    !canCreate && styles.modalPrimaryDisabled,
                  ]}
                  onPress={handleCreateRoom}
                  disabled={!canCreate}
                >
                  <Text style={[styles.modalPrimaryText, { fontSize: modalSubSize }]}>Create</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  avatarBtn: { padding: 1 },
  greeting: { flex: 1, color: theme.colors.text, fontWeight: '800' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bell: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStack: { marginTop: 8, alignItems: 'center' },
  roomsSection: { alignSelf: 'center' },
  roomsCarouselWrap: { alignItems: 'center' },
  roomsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  roomsActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  roomsTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  roomsAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  roomsAddText: { color: theme.colors.text, fontWeight: '800', fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 18,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.40)',
  },
  modalTitle: { color: 'rgba(12,12,18,0.9)', fontWeight: '900', fontSize: 18 },
  modalSub: { color: 'rgba(12,12,18,0.55)', fontWeight: '700', marginTop: 6 },
  modalInput: {
    marginTop: 14,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.08)',
    paddingHorizontal: 12,
    color: 'rgba(12,12,18,0.9)',
    fontWeight: '700',
  },
  modalRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalGhost: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalGhostText: { color: 'rgba(12,12,18,0.75)', fontWeight: '800' },
  modalPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#6B3CFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryDisabled: { opacity: 0.6 },
  modalPrimaryText: { color: '#FFFFFF', fontWeight: '900' },
});
