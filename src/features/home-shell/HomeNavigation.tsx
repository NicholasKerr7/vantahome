import React, { type PropsWithChildren } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';

export type HomeSection = 'home' | 'devices' | 'scenes' | 'automations' | 'more';
const DESTINATIONS = [
  { id: 'home', label: 'Home', accessibilityLabel: 'Back to 3D home', icon: 'cube-outline' },
  { id: 'devices', label: 'Devices', accessibilityLabel: 'Open house device library', icon: 'hardware-chip-outline' },
  { id: 'scenes', label: 'Scenes', accessibilityLabel: 'Scenes', icon: 'sparkles-outline' },
  { id: 'automations', label: 'Routines', accessibilityLabel: 'Routines', icon: 'git-branch-outline' },
  { id: 'more', label: 'More', accessibilityLabel: 'Open home menu', icon: 'grid-outline' },
] as const;

type Props = PropsWithChildren<{ selected: HomeSection; onSelect: (section: HomeSection) => void; availableSections?: Readonly<Partial<Record<HomeSection, boolean>>> }>;

/** Keep primary destinations visible, placing navigation beside the landscape tablet canvas. */
export default function HomeNavigation({ selected, onSelect, children, availableSections }: Props) {
  const { width, height } = useWindowDimensions();
  const rail = width >= 900 && width > height;
  const navigation = <View accessibilityLabel="Home navigation" style={[styles.dock, rail && styles.rail]}>
    {DESTINATIONS.filter((destination) => !availableSections || availableSections[destination.id]).map((destination) => {
      const active = destination.id === selected;
      return <Pressable key={destination.id} accessibilityLabel={destination.accessibilityLabel}
        accessibilityState={{ selected: active }} onPress={() => onSelect(destination.id)}
        style={[styles.destination, rail && styles.railDestination, active && styles.active]}>
        <Ionicons name={destination.icon} size={21} color={active ? theme.colors.accent : theme.colors.subtext} />
        <Text numberOfLines={1} style={[styles.label, active && styles.activeLabel]}>{destination.label}</Text>
        <View style={[styles.selection, active && styles.selectionActive]} />
      </Pressable>;
    })}
  </View>;
  return <View style={[styles.workspace, rail && styles.landscape]}>
    {rail && navigation}
    <View style={styles.content}>{children}</View>
    {!rail && navigation}
  </View>;
}

const styles = StyleSheet.create({
  workspace: { flex: 1, minHeight: 0, minWidth: 0, backgroundColor: theme.colors.bg0 },
  landscape: { flexDirection: 'row' },
  content: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' },
  dock: { flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingTop: 7, paddingBottom: 5, borderTopWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.bg0 },
  rail: { width: 86, flexDirection: 'column', gap: 12, paddingTop: 20, paddingHorizontal: 8, borderTopWidth: 0, borderRightWidth: 1 },
  destination: { flex: 1, minWidth: 0, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 3, paddingVertical: 6, borderRadius: 17 },
  railDestination: { flex: 0, minHeight: 68 },
  active: { backgroundColor: theme.colors.card },
  label: { fontSize: 10, fontWeight: '500', color: theme.colors.subtext },
  activeLabel: { color: theme.colors.accentText },
  selection: { width: 12, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  selectionActive: { backgroundColor: theme.colors.accent },
});
