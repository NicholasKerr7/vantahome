import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Pressable from '../components/Pressable';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import BackgroundLines from '../components/BackgroundLines';
import { theme } from '../theme/theme';
import { useHomeStore } from '../store/useHomeStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../app/AppNavigator';
import { useResponsive } from '../theme/layout';

type Props = NativeStackScreenProps<RootStackParamList, 'ManageRooms'>;

export default function ManageRoomsScreen({ navigation }: Props) {
  const { contentWidth, gutter, topPad, isTablet, isLandscape, scale } = useResponsive(900);
  const isWide = isTablet && isLandscape;
  const iconSize = Math.round((isTablet ? 46 : 40) * scale);
  const iconRadius = Math.round(iconSize * 0.4);
  const titleSize = Math.round((isTablet ? 20 : 18) * scale);
  const cardPad = Math.round((isTablet ? 18 : 14) * scale);
  const cardRadius = Math.round((isTablet ? 26 : 24) * scale);
  const inputHeight = Math.round((isTablet ? 48 : 44) * scale);
  const inputRadius = Math.round(inputHeight * 0.28);
  const labelSize = Math.round((isTablet ? 13 : 12) * scale);
  const metaSize = Math.round((isTablet ? 13 : 12) * scale);
  const actionBtnSize = Math.round((isTablet ? 40 : 36) * scale);
  const actionBtnRadius = Math.round(actionBtnSize * 0.33);
  const rowGap = Math.round((isTablet ? 14 : 12) * scale);
  const gridGap = Math.round((isTablet ? 18 : 12) * scale);
  const primaryHeight = Math.round((isTablet ? 46 : 42) * scale);
  const primaryRadius = Math.round(primaryHeight * 0.28);
  const modalPad = Math.round((isTablet ? 20 : 18) * scale);
  const modalRadius = Math.round((isTablet ? 24 : 22) * scale);
  const modalTitleSize = Math.round((isTablet ? 20 : 18) * scale);
  const modalSubSize = Math.round((isTablet ? 14 : 12) * scale);
  const modalInputHeight = Math.round((isTablet ? 48 : 44) * scale);
  const modalButtonHeight = Math.round((isTablet ? 46 : 42) * scale);
  const rooms = useHomeStore((s) => s.rooms);
  const devices = useHomeStore((s) => s.devices);
  const addRoom = useHomeStore((s) => s.addRoom);
  const renameRoom = useHomeStore((s) => s.renameRoom);
  const moveRoom = useHomeStore((s) => s.moveRoom);
  const removeRoom = useHomeStore((s) => s.removeRoom);

  const [showAdd, setShowAdd] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const deviceCountByRoom = useMemo(() => {
    const map: Record<string, number> = {};
    rooms.forEach((r) => {
      map[r.id] = devices.filter((d) => d.roomId === r.id).length;
    });
    return map;
  }, [rooms, devices]);

  const handleCreate = () => {
    const trimmed = roomName.trim();
    if (!trimmed) return;
    addRoom(trimmed);
    setRoomName('');
    setShowAdd(false);
  };

  return (
    <LinearGradient colors={[theme.colors.bg1, theme.colors.bg0]} style={[styles.root, { paddingTop: topPad }]}>
      <BackgroundLines />

      <View style={[styles.top, { paddingHorizontal: gutter, width: contentWidth, alignSelf: 'center' }]}>
        <Pressable
          style={[styles.iconBtn, { width: iconSize, height: iconSize, borderRadius: iconRadius }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.title, { fontSize: titleSize }]}>Manage Rooms</Text>
        <Pressable
          style={[styles.iconBtn, { width: iconSize, height: iconSize, borderRadius: iconRadius }]}
          onPress={() => setShowAdd(true)}
        >
          <Ionicons name="add" size={20} color={theme.colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: isTablet ? gutter : 0,
            paddingTop: 12,
            paddingBottom: Math.round((isTablet ? (isLandscape ? 120 : 140) : 120) * scale),
          },
        ]}
      >
        <View style={{ width: contentWidth, paddingHorizontal: isTablet ? 0 : gutter }}>
          <View style={[styles.cardsGrid, isWide && { flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }]}>
          {rooms.map((room, idx) => {
            const draft = drafts[room.id] ?? room.name;
            const canSave = draft.trim().length > 1 && draft.trim() !== room.name;
            const isLastRoom = rooms.length <= 1;
            return (
              <View
                key={room.id}
                style={[
                  styles.card,
                  {
                    padding: cardPad,
                    borderRadius: cardRadius,
                    width: isWide ? (contentWidth - gridGap) / 2 : '100%',
                  },
                ]}
              >
                <View style={[styles.rowTop, { gap: rowGap }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { fontSize: labelSize }]}>Room name</Text>
                    <TextInput
                      value={draft}
                      onChangeText={(value) => setDrafts((prev) => ({ ...prev, [room.id]: value }))}
                      placeholder="Room name"
                      placeholderTextColor="rgba(255,255,255,0.45)"
                      style={[styles.input, { height: inputHeight, borderRadius: inputRadius }]}
                    />
                    <Text style={[styles.meta, { fontSize: metaSize }]}>
                      {deviceCountByRoom[room.id] ?? 0} devices
                    </Text>
                  </View>

                  <View style={styles.actions}>
                    <Pressable
                      style={[
                        styles.actionBtn,
                        { width: actionBtnSize, height: actionBtnSize, borderRadius: actionBtnRadius },
                        idx === 0 && styles.actionBtnDisabled,
                      ]}
                      onPress={() => moveRoom(room.id, -1)}
                      disabled={idx === 0}
                    >
                      <Ionicons name="chevron-up" size={18} color={theme.colors.text} />
                    </Pressable>
                    <Pressable
                      style={[
                        styles.actionBtn,
                        { width: actionBtnSize, height: actionBtnSize, borderRadius: actionBtnRadius },
                        idx === rooms.length - 1 && styles.actionBtnDisabled,
                      ]}
                      onPress={() => moveRoom(room.id, 1)}
                      disabled={idx === rooms.length - 1}
                    >
                      <Ionicons name="chevron-down" size={18} color={theme.colors.text} />
                    </Pressable>
                  </View>
                </View>

                <View style={[styles.rowBottom, { gap: rowGap }]}>
                  <Pressable
                    style={[
                      styles.primaryBtn,
                      { height: primaryHeight, borderRadius: primaryRadius },
                      !canSave && styles.primaryBtnDisabled,
                    ]}
                    onPress={() => {
                      if (!canSave) return;
                      renameRoom(room.id, draft.trim());
                    }}
                    disabled={!canSave}
                  >
                    <Text style={[styles.primaryText, { fontSize: labelSize }]}>Save</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.deleteBtn,
                      { height: primaryHeight, borderRadius: primaryRadius },
                      isLastRoom && styles.actionBtnDisabled,
                    ]}
                    onPress={() => {
                      if (isLastRoom) return;
                      removeRoom(room.id);
                    }}
                    disabled={isLastRoom}
                  >
                    <Text style={[styles.deleteText, { fontSize: labelSize }]}>
                      {isLastRoom ? 'Keep at least 1 room' : 'Delete'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          </View>
        </View>
      </ScrollView>

      <Modal transparent visible={showAdd} animationType="fade" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowAdd(false)} />
          <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })}>
            <LinearGradient
              colors={['rgba(255,255,255,0.96)', 'rgba(246,238,255,0.90)']}
              start={{ x: 0.1, y: 0.1 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.modalCard,
                {
                  padding: modalPad,
                  borderRadius: modalRadius,
                  maxWidth: isTablet ? 520 : undefined,
                  width: isTablet ? Math.min(contentWidth - gutter * 2, 520) : undefined,
                  alignSelf: isTablet ? 'center' : 'stretch',
                },
              ]}
            >
              <Text style={[styles.modalTitle, { fontSize: modalTitleSize }]}>Add room</Text>
              <Text style={[styles.modalSub, { fontSize: modalSubSize }]}>Give the room a friendly name.</Text>

              <TextInput
                value={roomName}
                onChangeText={setRoomName}
                placeholder="Office, Patio, Studio..."
                placeholderTextColor="rgba(12,12,18,0.45)"
                style={[styles.modalInput, { height: modalInputHeight, borderRadius: Math.round(modalInputHeight * 0.28) }]}
                autoCapitalize="words"
                returnKeyType="done"
              />

              <View style={styles.modalRow}>
                <Pressable
                  style={[
                    styles.modalGhost,
                    { height: modalButtonHeight, borderRadius: Math.round(modalButtonHeight * 0.28) },
                  ]}
                  onPress={() => setShowAdd(false)}
                >
                  <Text style={[styles.modalGhostText, { fontSize: labelSize }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalPrimary,
                    { height: modalButtonHeight, borderRadius: Math.round(modalButtonHeight * 0.28) },
                    !roomName.trim() && styles.modalPrimaryDisabled,
                  ]}
                  onPress={handleCreate}
                  disabled={!roomName.trim()}
                >
                  <Text style={[styles.modalPrimaryText, { fontSize: labelSize }]}>Create</Text>
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
  content: { alignItems: 'center' },
  cardsGrid: { gap: 12 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: theme.colors.text, fontWeight: '900', fontSize: 18 },

  card: {
    borderRadius: 24,
    padding: 14,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  rowTop: { flexDirection: 'row', gap: 12 },
  rowBottom: { flexDirection: 'row', gap: 10, marginTop: 12 },
  label: { color: theme.colors.subtext, fontWeight: '800', marginBottom: 6 },
  input: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    color: theme.colors.text,
    fontWeight: '800',
  },
  meta: { color: theme.colors.subtext, fontWeight: '700', marginTop: 6, fontSize: 12 },

  actions: { gap: 8, justifyContent: 'center' },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDisabled: { opacity: 0.45 },

  primaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(180,107,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryText: { color: '#FFFFFF', fontWeight: '900' },
  deleteBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 99, 132, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: '#ffdbe6', fontWeight: '900', fontSize: 12 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 18,
  },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
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
