import React, { useState } from 'react';
import { Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';
import { HOME_MENU_PAGES, type HomeDestination } from './homeDestinations';

type Props = { onClose: () => void; onSelect: (destination: HomeDestination) => void; rendererAvailable: boolean; activityAvailable: boolean };

/** Present a compact home index with a fixed set of destinations on each page. */
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
          <View style={styles.grow}>
            <Text style={styles.eyebrow}>VANTAHOME / EXPLORE</Text>
            <Text accessibilityRole="header" style={[styles.title, compact && styles.compactTitle]}>Home index</Text>
          </View>
          <Pressable accessibilityLabel="Close home menu" style={styles.iconButton} onPress={onClose}>
            <Ionicons name="close" size={22} color={theme.colors.text} />
          </Pressable>
        </View>
        <View accessibilityRole="tablist" style={styles.tabs}>
          {HOME_MENU_PAGES.map((section, index) => <Pressable key={section.title}
            accessibilityRole="tab" accessibilityState={{ selected: page === index }} aria-selected={page === index}
            onPress={() => setPage(index)} style={[styles.tab, page === index && styles.selectedTab]}>
            <Text style={[styles.tabText, page === index && styles.selectedText]}>{section.title}</Text>
          </Pressable>)}
        </View>
        <Text style={styles.description}>{current.description}</Text>
        <View style={styles.index}>
          {items.map((item, index) => <Pressable key={item.id} accessibilityLabel={item.title}
            accessibilityHint={item.detail} style={[styles.destination, compact && styles.compactDestination]} onPress={() => onSelect(item.id)}>
            <Text accessible={false} style={styles.number}>{String(page * 4 + index + 1).padStart(2, '0')}</Text>
            <Ionicons name={item.icon} size={22} color={theme.colors.accent} />
            <View style={styles.grow}>
              <Text style={styles.destinationTitle}>{item.title}</Text>
              {!compact && <Text style={styles.destinationDetail}>{item.detail}</Text>}
            </View>
            <Ionicons name="arrow-forward" size={18} color={theme.colors.subtext} />
          </Pressable>)}
        </View>
        <View style={styles.footer}>
          <View style={styles.footerIdentity}><View style={styles.dot} /><Text style={styles.footerText}>A place for everything.</Text></View>
          <Text style={styles.pageNumber}>{String(page + 1).padStart(2, '0')} / 03</Text>
        </View>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(5,9,5,0.84)', justifyContent: 'center', alignItems: 'center', padding: 14 },
  card: { width: '100%', maxWidth: 620, maxHeight: '100%', padding: 24, gap: 18, backgroundColor: theme.colors.bg0, borderWidth: 1, borderColor: theme.colors.stroke, borderRadius: 24 },
  compact: { padding: 16, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
  grow: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 9, fontWeight: '600', letterSpacing: 2.2, color: theme.colors.accent, marginBottom: 9 },
  title: { color: theme.colors.text, fontSize: 34, letterSpacing: -1.2, fontWeight: '500' },
  compactTitle: { fontSize: 28 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: theme.colors.stroke },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.colors.stroke },
  tab: { flex: 1, minHeight: 46, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  selectedTab: { borderBottomColor: theme.colors.accent },
  tabText: { fontSize: 12, color: theme.colors.subtext },
  selectedText: { color: theme.colors.accent, fontWeight: '600' },
  description: { fontSize: 12, lineHeight: 18, color: theme.colors.subtext },
  index: { borderTopWidth: 1, borderTopColor: theme.colors.stroke },
  destination: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.stroke },
  compactDestination: { minHeight: 62, gap: 12, paddingVertical: 9 },
  number: { width: 20, color: theme.colors.muted, fontSize: 10, fontVariant: ['tabular-nums'] },
  destinationTitle: { color: theme.colors.text, fontSize: 17, fontWeight: '500', letterSpacing: -0.3 },
  destinationDetail: { color: theme.colors.subtext, fontSize: 11, lineHeight: 16, marginTop: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  footerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.accent },
  footerText: { color: theme.colors.muted, fontSize: 10, lineHeight: 16 },
  pageNumber: { color: theme.colors.accent, fontSize: 10, letterSpacing: 1, fontVariant: ['tabular-nums'] },
});
