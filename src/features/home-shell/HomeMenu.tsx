import React, { useState } from 'react';
import { Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInRight, ReduceMotion } from 'react-native-reanimated';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';
import { HOME_MENU_PAGES, type HomeDestination } from './homeDestinations';

type Props = {
  onClose: () => void;
  onSelect: (destination: HomeDestination) => void;
  rendererAvailable: boolean;
  activityAvailable: boolean;
  availableDestinations?: Readonly<Partial<Record<HomeDestination, boolean>>>;
  motionAllowed?: boolean;
};

/** Reserve space for the heading, categories, and paging before fitting complete directory rows. */
export function getMenuPageSize(availableHeight: number, fontScale: number): number {
  const largeText = fontScale > 1.2;
  const stackedTabs = fontScale > 1.5;
  const headerBudget = 32 + Math.max(44, 34 * fontScale);
  const categoriesBudget = stackedTabs ? 3 * Math.max(44, 18 * fontScale + 16) : Math.max(48, 36 * fontScale);
  const descriptionBudget = largeText || availableHeight < 600 ? 12 : 62;
  const rowBudget = largeText ? Math.max(84, 44 * fontScale + 24) : 84;
  const roomForRows = availableHeight - headerBudget - categoriesBudget - descriptionBudget - 64;
  const capacity = Math.floor(roomForRows / rowBudget);
  return capacity >= 4 ? 4 : capacity >= 2 ? 2 : 1;
}

/** A utility directory complements the primary dock without introducing a scrolling menu. */
export default function HomeMenu({ onClose, onSelect, rendererAvailable, activityAvailable, availableDestinations, motionAllowed = false }: Props) {
  const [sectionTitle, setSectionTitle] = useState<string>(HOME_MENU_PAGES[0].title);
  const [itemPage, setItemPage] = useState(0);
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableHeight = height - insets.top - insets.bottom - 24;
  const tablet = Math.min(width, height) >= 600;
  const largeText = fontScale > 1.2;
  const stackedTabs = fontScale > 1.5;
  const compact = availableHeight < 600 || largeText;
  const pages = HOME_MENU_PAGES.map((page) => ({ ...page, items: page.items.filter((item) =>
    (!availableDestinations || availableDestinations[item.id]) && (item.id !== 'renderer' || rendererAvailable)
    && (item.id !== 'activity' || activityAvailable)) })).filter((page) => page.items.length > 0);
  const section = pages.find((page) => page.title === sectionTitle) ?? pages[0];
  const items = section?.items ?? [];
  const pageSize = getMenuPageSize(availableHeight, fontScale);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const visiblePage = Math.min(itemPage, pageCount - 1);
  const entrance = tablet ? FadeInRight : FadeInDown;

  return <Modal transparent visible animationType="none" onRequestClose={onClose}>
    <SafeAreaView style={[styles.overlay, tablet ? styles.tabletOverlay : styles.phoneOverlay]}>
      <Animated.View entering={motionAllowed ? entrance.duration(220).reduceMotion(ReduceMotion.System) : undefined}
        style={[styles.panelWrap, tablet ? styles.tabletWrap : styles.phoneWrap]}>
        <View accessibilityViewIsModal style={[styles.panel, tablet && styles.tabletPanel]}>
          <View style={styles.header}>
            <View style={styles.headingCopy}>
              {!compact && <Text style={styles.eyebrow}>VANTAHOME / EXPLORE</Text>}
              <Text accessibilityRole="header" style={styles.title}>{compact ? 'Your home' : 'Your home, connected.'}</Text>
            </View>
            <Pressable accessibilityLabel="Close home menu" style={styles.iconButton} onPress={onClose}>
              <Ionicons name="close" size={23} color={theme.colors.text} />
            </Pressable>
          </View>
          <View accessibilityRole="tablist" style={[styles.tabs, stackedTabs && styles.stackedTabs]}>
            {pages.map((category) => <Pressable key={category.title}
              accessibilityRole="tab" accessibilityState={{ selected: section?.title === category.title }} aria-selected={section?.title === category.title}
              onPress={() => { setSectionTitle(category.title); setItemPage(0); }}
              style={[styles.tab, stackedTabs && styles.stackedTab, section?.title === category.title && styles.selectedTab]}>
              <Text style={[styles.tabText, section?.title === category.title && styles.selectedText]}>{category.title}</Text>
            </Pressable>)}
          </View>
          {!compact && section && <Text style={styles.description}>{section.description}</Text>}
          <View style={[styles.directory, compact && styles.compactDirectory, tablet && styles.tabletDirectory]}>
            {items.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize).map((item) => <Pressable key={item.id}
              accessibilityLabel={item.title} accessibilityHint={item.detail}
              style={styles.destination} onPress={() => onSelect(item.id)}>
              {!largeText && <View style={styles.destinationIcon}><Ionicons name={item.icon} size={23} color={theme.colors.accent} /></View>}
              <View style={styles.destinationCopy}>
                <Text style={styles.destinationTitle}>{item.title}</Text>
                {!largeText && <Text style={styles.destinationDetail}>{item.detail}</Text>}
              </View>
              <Ionicons name="arrow-forward" size={18} color={theme.colors.accentText} />
            </Pressable>)}
          </View>
          {pageCount > 1 && <View style={styles.footer}>
            <Pressable accessibilityLabel="Previous menu destinations" disabled={visiblePage === 0}
              style={[styles.iconButton, visiblePage === 0 && styles.disabled]} onPress={() => setItemPage(visiblePage - 1)}>
              <Ionicons name="arrow-back" size={19} color={theme.colors.text} />
            </Pressable>
            <Text accessibilityLiveRegion="polite" style={styles.pageLabel}>Page {visiblePage + 1} of {pageCount}</Text>
            <Pressable accessibilityLabel="Next menu destinations" disabled={visiblePage === pageCount - 1}
              style={[styles.iconButton, visiblePage === pageCount - 1 && styles.disabled]} onPress={() => setItemPage(visiblePage + 1)}>
              <Ionicons name="arrow-forward" size={19} color={theme.colors.text} />
            </Pressable>
          </View>}
        </View>
      </Animated.View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, padding: 12, backgroundColor: theme.colors.overlay },
  phoneOverlay: { justifyContent: 'flex-end', alignItems: 'center' },
  tabletOverlay: { alignItems: 'flex-end' },
  panelWrap: { width: '100%', maxHeight: '100%' },
  phoneWrap: { maxWidth: 560 },
  tabletWrap: { maxWidth: 420, flex: 1 },
  panel: { padding: 16, borderWidth: 1, borderColor: theme.colors.stroke, borderRadius: 28, backgroundColor: theme.colors.bg0 },
  tabletPanel: { flex: 1, borderRadius: 22 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 16 },
  headingCopy: { flex: 1, gap: 6 },
  eyebrow: { color: theme.colors.accentText, fontSize: 9, fontWeight: '600', letterSpacing: 1.5 },
  title: { color: theme.colors.text, fontSize: 24, lineHeight: 30, fontWeight: '500', letterSpacing: -0.7 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.stroke },
  tabs: { flexDirection: 'row', gap: 4, backgroundColor: theme.colors.card2, padding: 4, borderRadius: 18 },
  stackedTabs: { flexDirection: 'column' },
  tab: { flex: 1, minHeight: 44, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  stackedTab: { flex: 0, alignItems: 'flex-start', paddingHorizontal: 12 },
  selectedTab: { backgroundColor: theme.colors.card },
  tabText: { fontSize: 12, lineHeight: 18, color: theme.colors.subtext },
  selectedText: { color: theme.colors.accentText, fontWeight: '600' },
  description: { fontSize: 12, lineHeight: 18, color: theme.colors.subtext, paddingTop: 18, paddingBottom: 8 },
  directory: { minHeight: 0, gap: 8 },
  compactDirectory: { marginTop: 12 },
  tabletDirectory: { flex: 1 },
  destination: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 76, padding: 12, borderWidth: 1, borderColor: theme.colors.stroke, borderRadius: 21, backgroundColor: theme.colors.card2 },
  destinationIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center' },
  destinationCopy: { flex: 1, minWidth: 0, gap: 4 },
  destinationTitle: { color: theme.colors.text, fontSize: 17, lineHeight: 22, fontWeight: '500', letterSpacing: -0.2 },
  destinationDetail: { color: theme.colors.subtext, fontSize: 12, lineHeight: 17, fontWeight: '400' },
  footer: { paddingTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pageLabel: { flex: 1, textAlign: 'center', color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.35 },
});
