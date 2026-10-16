import React, { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useHomeStore } from '../store/useHomeStore';
import { useDecorativeMotion } from './useDecorativeMotion';
import { CardScrollInteractionContext } from './cardScrollInteraction';
import { useCardPageScroll } from './useCardPageScroll';

type Props = {
  page: number; count: number; onChange: (page: number) => void;
  resetKey: string | number; renderPage: (page: number) => ReactNode; testID?: string;
};

/** Scroll complete card grids horizontally while retaining the existing fixed navigation and bounded viewport. */
export default function ScrollableCardPages({ page, count, onChange, resetKey, renderPage, testID = 'scrollable-card-pages' }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const list = useRef<FlatList<number>>(null);
  const safeCount = Math.max(1, Number.isFinite(count) ? Math.floor(count) : 1);
  const currentPage = Math.max(0, Math.min(safeCount - 1, Number.isFinite(page) ? Math.floor(page) : 0));
  const motionAllowed = useDecorativeMotion(true);
  const homeScope = useHomeStore((state) => `${state.sessionEpoch}:${state.authenticatedUserId}:${state.activeHomeId}`);
  const scroll = useCardPageScroll(list, { page: currentPage, count: safeCount, ...size, scope: `${homeScope}:${resetKey}`, motionAllowed }, onChange);
  const pages = useMemo(() => Array.from({ length: safeCount }, (_, index) => index), [safeCount]);
  const pageStyle = useMemo(() => StyleSheet.create({ page: { width: size.width, height: size.height } }).page, [size]);

  /** Let the caller's existing card capacity settle before positioning the measured horizontal list. */
  function measure(event: LayoutChangeEvent): void {
    const { width, height } = event.nativeEvent.layout;
    setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height });
  }

  return <View style={styles.viewport} onLayout={measure} testID={testID}>
    {size.width > 0 && size.height > 0 && safeCount > 1 ? <FlatList ref={list} horizontal pagingEnabled
      data={pages} extraData={currentPage} keyExtractor={(index) => String(index)}
      initialScrollIndex={currentPage} initialNumToRender={3} maxToRenderPerBatch={3} windowSize={3}
      getItemLayout={(_data, index) => ({ length: size.width, offset: size.width * index, index })}
      showsHorizontalScrollIndicator={false} bounces={false} alwaysBounceHorizontal={false} overScrollMode="never"
      directionalLockEnabled decelerationRate="fast" keyboardShouldPersistTaps="handled" scrollEventThrottle={16}
      style={styles.list} onScroll={scroll.onScroll} onScrollBeginDrag={scroll.onScrollBeginDrag}
      onScrollEndDrag={scroll.onScrollEndDrag} onMomentumScrollBegin={scroll.onMomentumScrollBegin}
      onMomentumScrollEnd={scroll.onMomentumScrollEnd} {...scroll.webHandlers}
      renderItem={({ item }) => <CardPage active={item === currentPage} canActivate={scroll.canActivateCard} testID={`${testID}-page-${item}`}>
        <View style={pageStyle}>{renderPage(item)}</View>
      </CardPage>} /> : <CardPage active canActivate={scroll.canActivateCard} testID={`${testID}-page-${currentPage}`}>{renderPage(currentPage)}</CardPage>}
  </View>;
}

/** Keep adjacent pre-rendered pages visible during a drag but out of assistive technology and keyboard focus. */
function CardPage({ active, canActivate, testID, children }: { active: boolean; canActivate: () => boolean; testID: string; children: ReactNode }) {
  const acceptsAction = useCallback(() => active && canActivate(), [active, canActivate]);
  const setWebInert = useCallback((node: View | null) => {
    if (Platform.OS !== 'web' || !node) return;
    const element = node as unknown as { setAttribute?: (name: string, value: string) => void; removeAttribute?: (name: string) => void };
    if (active) element.removeAttribute?.('inert'); else element.setAttribute?.('inert', '');
  }, [active]);
  return <CardScrollInteractionContext.Provider value={acceptsAction}>
    <View ref={setWebInert} style={styles.page} testID={testID} pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'} aria-hidden={!active}>
      {children}
    </View>
  </CardScrollInteractionContext.Provider>;
}

const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' },
  list: { flex: 1, minHeight: 0, ...Platform.select({ web: { overscrollBehavior: 'contain' as const } }) },
  page: { flex: 1, minHeight: 0 },
});
