import { useEffect, useRef, type RefObject } from 'react';
import { Platform, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';

export const PAGE_RAIL_INTERVAL = 76;
const SETTLE_DELAY_MS = 160;

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;
type WheelInput = { deltaX: number; deltaY: number; shiftKey: boolean; ctrlKey: boolean };
type Position = { page: number; count: number; width: number; resetKey: string | number; motionAllowed: boolean };
type Gesture = { position: Position; phase: 'dragging' | 'momentum' | 'settling'; offset: number };

/** Detect changed data, geometry or selection before a delayed scroll can navigate another view. */
function samePosition(left: Position, right: Position): boolean {
  return left.page === right.page && left.count === right.count && left.width === right.width
    && left.resetKey === right.resetKey && left.motionAllowed === right.motionAllowed;
}

/** Keep scroll updates imperative; only a completed user gesture changes the collection page. */
export function usePageScrollRail(
  scrollRef: RefObject<ScrollView | null>,
  position: Position,
  onChange: (page: number) => void,
) {
  const current = useRef({ position, onChange });
  current.current = { position, onChange };
  const previousPosition = useRef<Position | null>(null);
  const pendingSelection = useRef<number | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Cancel pending work before programmatic navigation, changed layout or unmount. */
  function cancelGesture(): void {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    gesture.current = null;
  }

  /** Center the selected page without letting programmatic scroll events commit another page. */
  function centerPage(page: number, animated: boolean): void {
    scrollRef.current?.scrollTo({ x: page * PAGE_RAIL_INTERVAL, y: 0, animated });
  }

  /** Clamp a user selection and retain the same callback used by the explicit arrow buttons. */
  function selectPage(requestedPage: number): void {
    const { position: latest, onChange: change } = current.current;
    cancelGesture();
    const next = Math.max(0, Math.min(latest.count - 1, requestedPage));
    centerPage(next, latest.motionAllowed);
    pendingSelection.current = next !== latest.page ? next : null;
    if (next !== latest.page) change(next);
  }

  /** Commit only the final resting position of the still-current user interaction. */
  function finishGesture(): void {
    const pending = gesture.current;
    if (!pending || !samePosition(pending.position, current.current.position)) {
      cancelGesture();
      return;
    }
    selectPage(Math.round(pending.offset / PAGE_RAIL_INTERVAL));
  }

  /** Web does not emit native momentum events; an idle tail also covers native drags without momentum. */
  function scheduleFinish(): void {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(finishGesture, SETTLE_DELAY_MS);
  }

  /** Start only from explicit user input, never from a programmatic scroll event. */
  function beginGesture(): void {
    cancelGesture();
    const latest = current.current.position;
    if (latest.count < 2 || latest.width <= 0) return;
    gesture.current = { position: latest, phase: 'dragging', offset: latest.page * PAGE_RAIL_INTERVAL };
  }

  /** Let a trackpad or horizontal wheel use the browser's own momentum and bounded scrolling. */
  function beginWheelGesture(event: WheelInput): void {
    if (event.ctrlKey || (!event.deltaX && !(event.shiftKey && event.deltaY))) return;
    if (!gesture.current || !samePosition(gesture.current.position, current.current.position)) beginGesture();
    if (gesture.current) {
      gesture.current.phase = 'settling';
      scheduleFinish();
    }
  }

  /** Track offsets in a ref so every animation frame avoids a React render. */
  function onScroll(event: ScrollEvent): void {
    const pending = gesture.current;
    if (!pending || !samePosition(pending.position, current.current.position)) return;
    const offset = event.nativeEvent.contentOffset.x;
    if (!Number.isFinite(offset)) return;
    pending.offset = offset;
    if (pending.phase === 'settling') scheduleFinish();
  }

  /** Wait for a native momentum event or a short idle tail after the finger lifts. */
  function endDrag(event?: ScrollEvent): void {
    if (event) onScroll(event);
    if (gesture.current) {
      gesture.current.phase = 'settling';
      scheduleFinish();
    }
  }

  /** Native momentum owns completion until its final event, avoiding an early timeout during a fling. */
  function beginMomentum(): void {
    if (!gesture.current) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    gesture.current.phase = 'momentum';
  }

  /** Use the native terminal offset rather than an earlier throttled scroll sample. */
  function endMomentum(event: ScrollEvent): void {
    onScroll(event);
    finishGesture();
  }

  useEffect(() => {
    const previous = previousPosition.current;
    cancelGesture();
    previousPosition.current = position;
    const sameGeometry = Boolean(previous && previous.width === position.width && previous.count === position.count
      && previous.resetKey === position.resetKey && previous.motionAllowed === position.motionAllowed);
    const alreadyCentered = sameGeometry && pendingSelection.current === position.page;
    pendingSelection.current = null;
    const animate = Boolean(previous && previous.page !== position.page && sameGeometry && position.motionAllowed);
    if (position.width > 0 && !alreadyCentered) centerPage(position.page, animate);
  }, [position.page, position.count, position.width, position.resetKey, position.motionAllowed]);

  useEffect(() => cancelGesture, []);

  return {
    selectPage,
    onScroll,
    onScrollBeginDrag: beginGesture,
    onScrollEndDrag: endDrag,
    onMomentumScrollBegin: beginMomentum,
    onMomentumScrollEnd: endMomentum,
    // React Native Web exposes wheel and touch events but does not synthesize native drag/momentum events.
    webInputHandlers: Platform.OS === 'web' ? {
      onWheel: beginWheelGesture,
      onTouchStart: beginGesture,
      onTouchEnd: () => endDrag(),
      onTouchCancel: cancelGesture,
    } : {},
  };
}
