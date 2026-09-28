import React, { useState } from 'react';
import { Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import Pressable from '../../components/Pressable';
import CinematicSurface from '../../components/CinematicSurface';
import { theme } from '../../theme/theme';
import { HOME_MENU_PAGES, type HomeDestination } from './homeDestinations';

type Props = { onClose: () => void; onSelect: (destination: HomeDestination) => void; rendererAvailable: boolean; activityAvailable: boolean; motionAllowed?: boolean };

/** A floating launch deck keeps every home destination reachable without vertical scrolling. */
export default function HomeMenu({ onClose, onSelect, rendererAvailable, activityAvailable, motionAllowed = false }: Props) {
  const [page, setPage] = useState(0);
  const [itemPage, setItemPage] = useState(0);
  const { height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableHeight = height - insets.top - insets.bottom - 28;
  const compact = height < 700 || fontScale > 1.15;
  const largeText = fontScale > 1.2;
  const current = HOME_MENU_PAGES[page];
  const items = current.items.filter((item) => (item.id !== 'renderer' || rendererAvailable)
    && (item.id !== 'activity' || activityAvailable));
  // Short phones and enlarged text get fewer destinations instead of clipped controls.
  const pageSize = largeText ? (availableHeight < 550 || fontScale > 1.6 ? 1 : 2) : availableHeight < 570 ? 2 : 4;
  const itemPageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const visiblePage = Math.min(itemPage, itemPageCount - 1);
  return <Modal transparent visible animationType="none" onRequestClose={onClose}>
    <SafeAreaView style={styles.overlay}>
      <Animated.View entering={motionAllowed ? FadeInDown.duration(260).reduceMotion(ReduceMotion.System) : undefined} style={styles.cardWrap}>
        <CinematicSurface variant="orbit" active={motionAllowed} style={[styles.card, compact && styles.compact]}>
          <View accessibilityViewIsModal>
            <View style={styles.header}>
              <View style={styles.grow}>
                {!largeText && <Text style={styles.eyebrow}>VANTAHOME / CONTROL SPACE</Text>}
                <Text accessibilityRole="header" style={[styles.title, compact && styles.compactTitle]}>{largeText ? 'Your home' : <>Your home,<Text style={styles.titleAccent}> in motion.</Text></>}</Text>
              </View>
              <Pressable accessibilityLabel="Close home menu" style={styles.iconButton} onPress={onClose}><Ionicons name="close" size={22} color={theme.colors.text} /></Pressable>
            </View>
            <View accessibilityRole="tablist" style={styles.tabs}>
              {HOME_MENU_PAGES.map((section, index) => <Pressable key={section.title}
                accessibilityRole="tab" accessibilityState={{ selected: page === index }} aria-selected={page === index}
                onPress={() => { setPage(index); setItemPage(0); }} style={[styles.tab, page === index && styles.selectedTab]}>
                <Text style={[styles.tabText, page === index && styles.selectedText]}>{section.title}</Text>
              </Pressable>)}
            </View>
            {!largeText && <Text style={styles.description}>{current.description}</Text>}
            <View style={[styles.grid, largeText && styles.largeTextGrid]}>
              {items.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize).map((item, index) => <Pressable key={item.id} accessibilityLabel={item.title}
                accessibilityHint={item.detail} style={[styles.destination, compact && styles.compactDestination, largeText && styles.largeDestination]} onPress={() => onSelect(item.id)}>
                <View style={styles.tileTop}>
                  <View style={[styles.iconDisc, index === 0 && styles.iconDiscFeatured]}><Ionicons name={item.icon} size={23} color={index === 0 ? theme.colors.bg0 : theme.colors.accent} /></View>
                  <Ionicons name="arrow-up-outline" size={15} color={theme.colors.muted} style={styles.arrow} />
                </View>
                <Text style={styles.destinationTitle}>{item.title}</Text>
                {!compact && <Text style={styles.destinationDetail}>{item.detail}</Text>}
              </Pressable>)}
            </View>
            <View style={styles.footer}>
              {itemPageCount > 1 ? <>
                <Pressable accessibilityLabel="Previous menu destinations" disabled={visiblePage === 0} style={[styles.iconButton, visiblePage === 0 && styles.disabled]} onPress={() => setItemPage(visiblePage - 1)}><Ionicons name="arrow-back" size={18} color={theme.colors.text} /></Pressable>
                <Text style={styles.footerText}>{visiblePage + 1} / {itemPageCount}</Text>
                <Pressable accessibilityLabel="Next menu destinations" disabled={visiblePage === itemPageCount - 1} style={[styles.iconButton, visiblePage === itemPageCount - 1 && styles.disabled]} onPress={() => setItemPage(visiblePage + 1)}><Ionicons name="arrow-forward" size={18} color={theme.colors.text} /></Pressable>
              </> : <>
                <View style={styles.footerIdentity}><View style={styles.dot} /><Text style={styles.footerText}>A living home. Always within reach.</Text></View>
                <Text style={styles.pageNumber}>0{page + 1} / 03</Text>
              </>}
            </View>
          </View>
        </CinematicSurface>
      </Animated.View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(3,8,12,0.86)', justifyContent: 'center', alignItems: 'center', padding: 14 },
  cardWrap: { width: '100%', maxWidth: 640, maxHeight: '100%' },
  card: { padding: 24, borderWidth: 1, borderColor: theme.colors.stroke, borderRadius: 30 },
  compact: { padding: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingBottom: 20 },
  grow: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 8, fontWeight: '600', letterSpacing: 2, color: theme.colors.accent, marginBottom: 10 },
  title: { color: theme.colors.text, fontSize: 33, lineHeight: 38, letterSpacing: -1.2, fontWeight: '500', maxWidth: 350 },
  titleAccent: { color: theme.colors.accent },
  compactTitle: { fontSize: 26, lineHeight: 31 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.glass },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.card2 },
  tab: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 14 },
  selectedTab: { backgroundColor: theme.colors.accent2 },
  tabText: { fontSize: 12, color: theme.colors.subtext },
  selectedText: { color: theme.colors.accent, fontWeight: '600' },
  description: { fontSize: 11, lineHeight: 16, color: theme.colors.subtext, paddingVertical: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  largeTextGrid: { marginTop: 14 },
  destination: { flexBasis: '46%', flexGrow: 1, minHeight: 134, padding: 16, gap: 9, borderWidth: 1, borderColor: theme.colors.stroke, borderRadius: 22, backgroundColor: theme.colors.glass },
  compactDestination: { minHeight: 100, padding: 12, gap: 7 },
  largeDestination: { flexBasis: '100%' },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconDisc: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.accent2 },
  iconDiscFeatured: { backgroundColor: theme.colors.accent },
  arrow: { transform: [{ rotate: '45deg' }] },
  destinationTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '500', letterSpacing: -0.3 },
  destinationDetail: { color: theme.colors.subtext, fontSize: 11, lineHeight: 16 },
  footer: { minHeight: 38, marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  footerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.accent },
  footerText: { color: theme.colors.muted, fontSize: 10, lineHeight: 16 },
  pageNumber: { color: theme.colors.accent, fontSize: 10, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.35 },
});
