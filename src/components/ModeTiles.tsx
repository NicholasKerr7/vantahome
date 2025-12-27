import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Pressable from './Pressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme/theme';
import { useResponsive } from '../theme/layout';

export type ModeKey = 'cold' | 'fan' | 'dry';

const MODES: Array<{
  key: ModeKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'cold', label: 'Cold', icon: 'thermometer' },
  { key: 'fan', label: 'Fan', icon: 'aperture' },
  { key: 'dry', label: 'Dry', icon: 'water' },
];

export default function ModeTiles({
  value,
  onChange,
}: {
  value: ModeKey;
  onChange: (m: ModeKey) => void;
}) {
  const { isTablet, isLandscape, scale } = useResponsive();
  const tileSize = Math.round((isTablet ? (isLandscape ? 104 : 112) : 92) * scale);
  const tileRadius = Math.round(tileSize * 0.24);
  const iconBubble = Math.round(tileSize * 0.48);
  const iconBubbleRadius = Math.round(iconBubble / 2);
  const iconSize = Math.round((isTablet ? 22 : 20) * scale);
  const textSize = Math.round((isTablet ? 13 : 12) * scale);
  const gap = Math.round((isTablet ? 16 : 14) * scale);
  return (
    <View style={[styles.modes, { gap }]}>
      {MODES.map((m) => {
        const active = value === m.key;
        return (
          <Pressable
            key={m.key}
            style={[
              styles.modeTile,
              { width: tileSize, height: tileSize, borderRadius: tileRadius },
              active && styles.modeTileActive,
            ]}
            onPress={() => onChange(m.key)}
          >
            {active ? (
              <LinearGradient
                colors={[theme.colors.accent2, theme.colors.accent]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.iconBubbleActive, { width: iconBubble, height: iconBubble, borderRadius: iconBubbleRadius }]}
              >
                <Ionicons name={m.icon} size={iconSize} color="#FFFFFF" />
              </LinearGradient>
            ) : (
              <View style={[styles.iconBubble, { width: iconBubble, height: iconBubble, borderRadius: iconBubbleRadius }]}>
                <Ionicons name={m.icon} size={iconSize} color="rgba(12,12,18,0.65)" />
              </View>
            )}
            <Text style={[styles.modeText, { fontSize: textSize }, active && styles.modeTextActive]}>
              {m.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  modes: { flexDirection: 'row', gap: 14, marginTop: 22, paddingHorizontal: 6, justifyContent: 'center' },
  modeTile: {
    width: 92,
    height: 92,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  modeTileActive: {
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderColor: 'rgba(122,92,255,0.25)',
    shadowColor: 'rgba(122,92,255,0.40)',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubbleActive: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(122,92,255,0.65)',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  modeText: { color: 'rgba(12,12,18,0.58)', fontWeight: '900', fontSize: 12 },
  modeTextActive: { color: 'rgba(12,12,18,0.86)' },
});
