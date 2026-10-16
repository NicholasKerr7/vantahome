import React, { useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Pressable from './Pressable';
import { useDecorativeMotion } from './useDecorativeMotion';
import { PAGE_RAIL_INTERVAL, usePageScrollRail } from './usePageScrollRail';
import { theme } from '../theme/theme';
import { useHomeStore } from '../store/useHomeStore';

export type PageScrollRailProps = {
  page: number;
  count: number;
  onChange: (page: number) => void;
  label: string;
  /** Change this when a different collection shares the same page number and count. */
  resetKey?: string | number;
};

/** Add a bounded, momentum-driven horizontal companion without replacing the footer's arrow buttons. */
export default function PageScrollRail({ page, count, onChange, label, resetKey }: PageScrollRailProps) {
  const safeCount = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
  const currentPage = Number.isFinite(page) ? Math.max(0, Math.min(safeCount - 1, Math.floor(page))) : 0;
  if (safeCount === 1) return <View style={styles.staticRail}>
    <Text accessibilityLiveRegion="polite" style={styles.staticLabel}>1 / 1</Text>
  </View>;
  return <ScrollablePageRail page={currentPage} count={safeCount} onChange={onChange} label={label} resetKey={resetKey} />;
}

/** Subscribe to scrolling and motion preferences only when the collection has another page. */
function ScrollablePageRail({ page, count, onChange, label, resetKey }: PageScrollRailProps) {
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const motionAllowed = useDecorativeMotion(true);
  const homeScope = useHomeStore((state) => `${state.sessionEpoch}:${state.authenticatedUserId}:${state.activeHomeId}`);
  const rail = usePageScrollRail(scrollRef, {
    page, count, width, resetKey: `${homeScope}:${resetKey ?? label}`, motionAllowed,
  }, onChange);
  const contentStyle = useMemo(() => StyleSheet.create({
    content: { paddingHorizontal: Math.max(0, (width - PAGE_RAIL_INTERVAL) / 2) },
  }).content, [width]);

  /** Avoid updating state for repeated measurements of an unchanged footer. */
  function measure(event: LayoutChangeEvent): void {
    const measuredWidth = Math.max(0, event.nativeEvent.layout.width);
    setWidth((previous) => previous === measuredWidth ? previous : measuredWidth);
  }

  return <View style={styles.rail} onLayout={measure} testID="page-scroll-rail">
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}
      bounces={false} alwaysBounceHorizontal={false} overScrollMode="never" directionalLockEnabled
      decelerationRate="fast" snapToInterval={PAGE_RAIL_INTERVAL} snapToAlignment="start"
      scrollEventThrottle={16} contentContainerStyle={contentStyle} style={styles.scroll}
      onScroll={rail.onScroll} onScrollBeginDrag={rail.onScrollBeginDrag} onScrollEndDrag={rail.onScrollEndDrag}
      onMomentumScrollBegin={rail.onMomentumScrollBegin} onMomentumScrollEnd={rail.onMomentumScrollEnd}
      {...rail.webInputHandlers}>
      {Array.from({ length: count }, (_, index) => <Pressable key={index}
        accessibilityLabel={`Go to ${label} page ${index + 1} of ${count}`}
        accessibilityHint="Scroll horizontally or use the previous and next buttons."
        accessibilityState={{ selected: index === page }}
        onPress={() => rail.selectPage(index)} style={styles.target}>
        <View style={[styles.pill, index === page && styles.selectedPill]}>
          <Text numberOfLines={1} style={[styles.pageLabel, index === page && styles.selectedLabel]}>
            {index === page ? `${index + 1} / ${count}` : String(index + 1)}
          </Text>
        </View>
      </Pressable>)}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  rail: { flex: 1, minWidth: 0, height: 46, overflow: 'hidden', borderRadius: 18, backgroundColor: theme.colors.surface },
  scroll: { flex: 1, minWidth: 0, ...Platform.select({ web: { overscrollBehavior: 'contain' as const } }) },
  staticRail: { flex: 1, minWidth: 0, height: 46, justifyContent: 'center', alignItems: 'center' },
  target: { width: PAGE_RAIL_INTERVAL, minHeight: 46, justifyContent: 'center', alignItems: 'center' },
  pill: { minHeight: 32, minWidth: 62, paddingHorizontal: 5, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  selectedPill: { backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.stroke },
  pageLabel: { color: theme.colors.muted, fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '500' },
  selectedLabel: { color: theme.colors.accentText },
  staticLabel: { color: theme.colors.subtext, fontSize: 12, fontVariant: ['tabular-nums'] },
});
