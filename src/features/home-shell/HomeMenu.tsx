import React, { useState } from 'react';
import { Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';
import { HOME_MENU_PAGES, type HomeDestination } from './homeDestinations';

type Props = { onClose: () => void; onSelect: (destination: HomeDestination) => void; rendererAvailable: boolean; activityAvailable: boolean };

/** Page through app features without covering the house with a scrolling drawer. */
export default function HomeMenu({ onClose, onSelect, rendererAvailable, activityAvailable }: Props) {
  const [page, setPage] = useState(0);
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 700 || fontScale > 1.15;
  const current = HOME_MENU_PAGES[page];
  const items = current.items.filter((item) => (item.id !== 'renderer' || rendererAvailable)
    && (item.id !== 'activity' || activityAvailable));
  return <Modal transparent visible animationType="none" onRequestClose={onClose}>
    <SafeAreaView style={styles.overlay}>
      <View accessibilityViewIsModal style={[styles.card, compact && styles.compact]}>
        <View style={styles.header}>
          <View style={styles.grow}><Text style={styles.eyebrow}>VANTAHOME</Text><Text accessibilityRole="header" style={styles.title}>Your home, connected.</Text></View>
          <Pressable accessibilityLabel="Close home menu" style={styles.iconButton} onPress={onClose}><Ionicons name="close" size={22} color={theme.colors.text} /></Pressable>
        </View>
        <View accessibilityRole="tablist" style={styles.tabs}>{HOME_MENU_PAGES.map((section, index) => <Pressable key={section.title}
          accessibilityRole="tab" accessibilityState={{ selected: page === index }} aria-selected={page === index}
          onPress={() => setPage(index)} style={[styles.tab, page === index && styles.selectedTab]}>
          <Text style={[styles.tabText, page === index && styles.selectedText]}>{section.title}</Text>
        </Pressable>)}</View>
        <Text style={styles.description}>{current.description}</Text>
        <View style={styles.grid}>{items.map((item) => <Pressable key={item.id} accessibilityLabel={item.title}
          accessibilityHint={item.detail} style={[styles.tile, compact && styles.compactTile]} onPress={() => onSelect(item.id)}>
          <Ionicons name={item.icon} size={compact ? 23 : 28} color={theme.colors.accent} />
          <Text style={styles.tileTitle}>{item.title}</Text>
          {!compact && <Text style={styles.tileDetail}>{item.detail}</Text>}
        </Pressable>)}</View>
        <Text style={styles.footer}>House controls stay saved as you explore.</Text>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(5,9,5,0.78)', justifyContent: 'center', alignItems: 'center', padding: 14 },
  card: { width: '100%', maxWidth: 640, maxHeight: '100%', padding: 22, gap: 16, backgroundColor: theme.colors.bg0, borderWidth: 1, borderColor: theme.colors.stroke, borderRadius: 26 },
  compact: { padding: 16, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10, letterSpacing: 2, color: theme.colors.accent, marginBottom: 6 },
  title: { color: theme.colors.text, fontSize: 21, fontWeight: '600' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: theme.colors.card },
  tabs: { flexDirection: 'row', gap: 4, borderRadius: 14, backgroundColor: theme.colors.card2, padding: 4 },
  tab: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  selectedTab: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.stroke },
  tabText: { fontSize: 12, color: theme.colors.subtext },
  selectedText: { color: theme.colors.accent, fontWeight: '600' },
  description: { fontSize: 12, color: theme.colors.subtext },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '46%', flexGrow: 1, minHeight: 126, padding: 16, gap: 9, borderRadius: 18, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.stroke },
  compactTile: { minHeight: 94, padding: 12, gap: 7 },
  tileTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
  tileDetail: { color: theme.colors.subtext, fontSize: 11, lineHeight: 16 },
  footer: { color: theme.colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
