import React, { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { DEVICES, ROOMS, getRoom, type DeviceDefinition } from '../../../packages/home-scene/src/data';
import { deviceStatus, quickActionLabel } from '../../../packages/home-scene/src/deviceCapabilities';
import { deviceCardReading } from '../../../packages/home-scene/src/dashboardCardPresentation';
import type { ControlSnapshot } from './simulationControlClient';
import { ControlPagination } from './ControlPagination';

type Props = {
  allowedDeviceIds?: readonly string[]; onSelect: (id: string) => void; snapshot: ControlSnapshot; client: SimulationDeviceControls };

/** Present rooms as destinations and devices as actionable cards within a measured, paged space. */
export default function DeviceBrowser({ onSelect, snapshot, client, allowedDeviceIds }: Props) {
  const { fontScale } = useWindowDimensions();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const columns = space.width >= 280 && fontScale <= 1.2 ? 2 : 1;
  const rowHeight = (roomId ? 172 : 130) * Math.max(1, fontScale);
  const rows = Math.max(1, Math.min(2, Math.floor((space.height + 10) / (rowHeight + 10))));
  const pageSize = columns * rows;
  const availableDevices = allowedDeviceIds ? DEVICES.filter((device) => allowedDeviceIds.includes(device.id)) : DEVICES;
  const devices = roomId ? availableDevices.filter((device) => device.roomId === roomId) : [];
  const choices = roomId ? devices : ROOMS.filter((room) => availableDevices.some((device) => device.roomId === room.id));
  const pageCount = Math.max(1, Math.ceil(choices.length / pageSize));
  const visiblePage = Math.min(page, pageCount - 1);
  const visible = choices.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize);
  const cardRows = Array.from({ length: Math.ceil(visible.length / columns) }, (_, row) => visible.slice(row * columns, (row + 1) * columns));

  /** Recalculate card capacity only when available space actually changes. */
  function measure(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSpace((previous) => previous.width === width && previous.height === height ? previous : { width, height });
  }

  return <>
    <View style={styles.breadcrumb}>
      {roomId ? <Pressable accessibilityLabel="Browse all rooms" onPress={() => { setRoomId(null); setPage(0); }} style={styles.back}>
        <Ionicons name="arrow-back" size={18} color={theme.colors.accent} /><Text style={styles.backLabel}>Rooms</Text>
      </Pressable> : <Text style={styles.context}>ROOM DIRECTORY</Text>}
      <Text numberOfLines={1} style={styles.contextValue}>{roomId ? getRoom(roomId).name : `${choices.length} spaces`}</Text>
    </View>
    <View testID="device-browser-card-area" style={styles.cards} onLayout={measure}>
      {cardRows.map((row) => <View key={row[0].id} style={styles.cardRow}>
        {row.map((choice) => roomId ? <DeviceCard key={choice.id} device={choice as DeviceDefinition} snapshot={snapshot} client={client} onSelect={onSelect} />
          : <Pressable key={choice.id} accessibilityLabel={`${choice.name}, ${availableDevices.filter((device) => device.roomId === choice.id).length} devices`}
            onPress={() => { setRoomId(choice.id); setPage(0); }} style={styles.roomCard}>
            <View style={styles.cardTop}><Ionicons name={getRoom(choice.id).outdoor ? 'leaf-outline' : 'layers-outline'} size={24} color={theme.colors.accent} />
              <Ionicons name="arrow-forward" size={17} color={theme.colors.subtext} /></View>
            <Text numberOfLines={2} style={styles.roomName}>{choice.name}</Text>
            <Text style={styles.roomDetail}>{availableDevices.filter((device) => device.roomId === choice.id).length} devices · {getRoom(choice.id).outdoor ? 'Outside' : getRoom(choice.id).floor === 'ground' ? 'Ground' : 'Upper'}</Text>
          </Pressable>)}
        {row.length < columns && <View style={styles.spacer} />}
      </View>)}
    </View>
    <ControlPagination page={visiblePage} count={pageCount} onChange={setPage} />
  </>;
}

/** Separate an immediate device action from opening its complete capability controls. */
function DeviceCard({ device, snapshot, client, onSelect }: Props & { device: DeviceDefinition }) {
  const state = snapshot.state.deviceStates[device.id];
  const status = deviceStatus(device, state);
  const reading = deviceCardReading(device, state);
  return <View style={[styles.deviceCard, state.on && styles.deviceCardActive]}>
    <Pressable accessibilityLabel={`${device.name}, ${status}. Full controls`} accessibilityHint="Opens all settings for this device."
      onPress={() => onSelect(device.id)} style={styles.deviceIdentity}>
      <View style={styles.cardTop}><Text numberOfLines={2} style={styles.deviceName}>{device.name}</Text><Ionicons name="arrow-up-outline" size={17} color={theme.colors.subtext} style={styles.arrow} /></View>
      <View style={styles.deviceReading}>
        <Text numberOfLines={2} style={[styles.deviceStatus, reading.value.length > 9 && styles.longReading, state.on && styles.deviceStatusActive]}>{reading.value}</Text>
        <Text numberOfLines={2} style={styles.readingCaption}>{reading.caption}</Text>
      </View>
    </Pressable>
    <Pressable accessibilityLabel={`${quickActionLabel(device, state)}: ${device.name}`} disabled={!snapshot.ready} accessibilityState={{ disabled: !snapshot.ready }}
      onPress={() => client.toggle(device.id)} style={[styles.quickAction, !snapshot.ready && styles.disabled]}>
      <Text numberOfLines={2} style={styles.quickLabel}>{quickActionLabel(device, state)}</Text><Ionicons name="flash-outline" size={15} color={theme.colors.accent} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  breadcrumb: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  context: { fontSize: 9, letterSpacing: 1.6, color: theme.colors.subtext },
  contextValue: { color: theme.colors.text, fontSize: 12, flexShrink: 1 },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  backLabel: { color: theme.colors.accentText, fontSize: 12 },
  cards: { flex: 1, minHeight: 0, gap: 10 },
  cardRow: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 10 },
  roomCard: { flex: 1, minWidth: 0, padding: 14, borderRadius: 22, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.stroke, justifyContent: 'space-between', gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  roomName: { color: theme.colors.text, fontSize: 18, fontWeight: '500', letterSpacing: -0.5 },
  roomDetail: { color: theme.colors.subtext, fontSize: 10, lineHeight: 15 },
  spacer: { flex: 1 },
  deviceCard: { flex: 1, minWidth: 0, borderRadius: 22, backgroundColor: theme.colors.card2, borderWidth: 1, borderColor: theme.colors.stroke, overflow: 'hidden' },
  deviceCardActive: { borderColor: theme.colors.accent2 },
  deviceIdentity: { flex: 1, minHeight: 64, padding: 14, gap: 8, justifyContent: 'space-between' },
  deviceName: { flex: 1, color: theme.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '500' },
  arrow: { transform: [{ rotate: '45deg' }] },
  deviceReading: { gap: 4 },
  deviceStatus: { color: theme.colors.subtext, fontSize: 32, fontWeight: '500', letterSpacing: -1 },
  longReading: { fontSize: 16, letterSpacing: -0.2 },
  readingCaption: { color: theme.colors.subtext, fontSize: 10, lineHeight: 14 },
  deviceStatusActive: { color: theme.colors.accentText },
  quickAction: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.glass, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  quickLabel: { flex: 1, color: theme.colors.accentText, fontSize: 11, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
