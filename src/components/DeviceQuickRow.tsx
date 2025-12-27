import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Pressable from './Pressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../theme/theme';
import type { Device } from '../store/useHomeStore';
import { useResponsive } from '../theme/layout';

function iconFor(kind: Device['kind']): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'ac':
      return 'snow';
    case 'light':
      return 'bulb';
    case 'tv':
      return 'tv';
    case 'coffee':
      return 'cafe';
    case 'fan':
      return 'aperture';
    case 'fridge':
      return 'thermometer';
    case 'gate':
      return 'exit';
    case 'garage':
      return 'car-sport';
    case 'door':
      return 'home';
    case 'vacuum':
      return 'sparkles';
    case 'camera':
      return 'videocam';
    case 'window':
      return 'copy';
    case 'stove':
      return 'flame';
    case 'washer':
    case 'dryer':
      return 'sync';
    case 'microwave':
      return 'timer';
    case 'energy':
      return 'stats-chart';
    case 'water':
      return 'water';
    case 'air':
      return 'leaf';
    case 'sprinkler':
      return 'rainy';
    case 'speaker':
      return 'volume-high';
    case 'smoke':
      return 'alert-circle';
    default:
      return 'cube';
  }
}

export default function DeviceQuickRow({
  devices,
  onPressDevice,
}: {
  devices: Device[];
  onPressDevice: (id: string) => void;
}) {
  const { isTablet, scale } = useResponsive();
  const rowGap = Math.round((isTablet ? 18 : 14) * scale);
  const iconWrapSize = Math.round((isTablet ? 54 : 44) * scale);
  const iconWrapRadius = Math.round(iconWrapSize * 0.36);
  const iconSize = Math.round((isTablet ? 20 : 18) * scale);
  const labelSize = Math.round((isTablet ? 13 : 12) * scale);
  return (
    <View style={[styles.row, { gap: rowGap }]}>
      {devices.map((d) => (
        <Pressable key={d.id} style={styles.item} onPress={() => onPressDevice(d.id)}>
          <View
            style={[
              styles.iconWrap,
              { width: iconWrapSize, height: iconWrapSize, borderRadius: iconWrapRadius },
              d.isOn && styles.iconWrapOn,
            ]}
          >
            <Ionicons name={iconFor(d.kind)} size={iconSize} color={theme.colors.text} />
          </View>
          <Text style={[styles.label, { fontSize: labelSize }]}>{d.kind.toUpperCase()}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, marginTop: 14, justifyContent: 'space-between' },
  item: { alignItems: 'center', flex: 1 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapOn: { backgroundColor: 'rgba(180,107,255,0.28)' },
  label: { marginTop: 8, color: theme.colors.subtext, fontSize: 12, fontWeight: '700' },
});
