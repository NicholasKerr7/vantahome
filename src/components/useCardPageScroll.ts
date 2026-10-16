import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { Platform, type FlatList, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;
type Position = { page: number; count: number; width: number; height: number; scope: string; motionAllowed: boolean };
type Gesture = { position: Position; phase: 'armed' | 'dragging' | 'momentum' | 'settling'; offset: number };
type TouchEvent = { nativeEvent: { touches?: ReadonlyArray<{ pageX: number; pageY: number }> } };
type WheelEvent = { deltaX: number; deltaY: number; shiftKey: boolean; ctrlKey: boolean };

/** Invalidate delayed gestures when another collection, layout or selection replaces their starting point. */
function samePosition(left: Position, right: Position): boolean {
  return left.page === right.page && left.count === right.count && left.width === right.width && left.height === right.height
    && left.scope === right.scope && left.motionAllowed === right.motionAllowed;
}

/** Drive the actual card list imperatively; React only changes collection selection after a gesture settles. */
export function useCardPageScroll(list: RefObject<FlatList<number> | null>, position: Position, onChange: (page: number) => void) {
  const current = useRef({ position, onChange });
  current.current = { position, onChange };
  const previous = useRef<Position | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ pageX: number; pageY: number } | null>(null);
  const blockedUntil = useRef(0);
  const pendingPage = useRef<number | null>(null);

  /** Clear gesture state without allowing an already scheduled callback to navigate a replacement list. */
  function cancel(): void {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    gesture.current = null;
    touchStart.current = null;
  }

  /** Native press cancellation is backed by a scoped guard for browsers that synthesize a release click. */
  const canActivateCard = useCallback(() => (!gesture.current || gesture.current.phase === 'armed') && Date.now() >= blockedUntil.current, []);

  /** Move the same list that the finger drags, rather than replacing cards behind a footer animation. */
  function scrollToPage(page: number, animated: boolean): void {
    list.current?.scrollToOffset({ offset: page * current.current.position.width, animated });
  }

  /** Finish a current user gesture once, then suppress its trailing click. */
  function finish(): void {
    const pending = gesture.current;
    if (!pending || !samePosition(pending.position, current.current.position)) { cancel(); return; }
    if (pending.phase === 'armed') { cancel(); return; }
    const latest = current.current.position;
    const next = Math.max(0, Math.min(latest.count - 1, Math.round(pending.offset / latest.width)));
    cancel();
    blockedUntil.current = Date.now() + 180;
    pendingPage.current = next !== latest.page ? next : null;
    scrollToPage(next, latest.motionAllowed);
    if (next !== latest.page) current.current.onChange(next);
  }

  /** Wait for the end of web momentum or a native drag that produces no momentum event. */
  function scheduleFinish(): void {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(finish, 160);
  }

  /** Begin from explicit user input so programmatic arrow scrolling cannot echo back as another change. */
  function begin(armed = false): void {
    cancel();
    const latest = current.current.position;
    if (latest.width <= 0 || latest.count <= 1) return;
    gesture.current = { position: latest, phase: armed ? 'armed' : 'dragging', offset: latest.page * latest.width };
  }

  /** Keep frame-by-frame offsets out of React state. */
  function onScroll(event: ScrollEvent): void {
    const pending = gesture.current;
    if (!pending || !samePosition(pending.position, current.current.position)) return;
    const offset = event.nativeEvent.contentOffset.x;
    if (!Number.isFinite(offset)) return;
    if (pending.phase === 'armed' && Math.abs(offset - pending.offset) > 3) pending.phase = 'dragging';
    pending.offset = offset;
    if (pending.phase === 'settling') scheduleFinish();
  }

  /** Native momentum will cancel this fallback before it can settle an in-flight fling. */
  function endDrag(event?: ScrollEvent): void {
    if (event) onScroll(event);
    if (!gesture.current) return;
    if (gesture.current.phase === 'armed') { cancel(); return; }
    gesture.current.phase = 'settling';
    scheduleFinish();
  }

  /** Keep long native flings alive until the platform emits their terminal offset. */
  function beginMomentum(): void {
    if (!gesture.current) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    gesture.current.phase = 'momentum';
  }

  /** Accept only horizontal wheel input; ordinary vertical scrolling and browser zoom remain unaffected. */
  function wheel(event: WheelEvent): void {
    if (event.ctrlKey || (!event.deltaX && !(event.shiftKey && event.deltaY))) return;
    if (!gesture.current || !samePosition(gesture.current.position, current.current.position)) begin();
    if (gesture.current) { gesture.current.phase = 'settling'; scheduleFinish(); }
  }

  /** Arm a touch without blocking deliberate taps on the card's actions. */
  function startTouch(event: TouchEvent): void {
    begin(true);
    touchStart.current = event.nativeEvent.touches?.[0] ?? null;
  }

  /** A moved finger must not activate the control where the drag began, even before the first scroll event. */
  function moveTouch(event: TouchEvent): void {
    const point = event.nativeEvent.touches?.[0];
    if (gesture.current && touchStart.current && point
      && Math.hypot(point.pageX - touchStart.current.pageX, point.pageY - touchStart.current.pageY) > 8) {
      gesture.current.phase = 'dragging';
    }
  }

  /** An interrupted drag must not leave a synthetic click free to activate its starting card. */
  function cancelTouch(): void {
    if (gesture.current && gesture.current.phase !== 'armed') blockedUntil.current = Date.now() + 180;
    cancel();
  }

  useEffect(() => {
    const before = previous.current;
    const stableLayout = before && before.width === position.width && before.height === position.height
      && before.count === position.count && before.scope === position.scope && before.motionAllowed === position.motionAllowed;
    const alreadyPositioned = stableLayout && pendingPage.current === position.page;
    const animated = Boolean(stableLayout && before.page !== position.page && position.motionAllowed);
    cancel();
    pendingPage.current = null;
    previous.current = position;
    if (position.width > 0 && !alreadyPositioned) {
      blockedUntil.current = animated ? Date.now() + 400 : 0;
      scrollToPage(position.page, animated);
    }
  }, [position.page, position.count, position.width, position.height, position.scope, position.motionAllowed]);
  useEffect(() => cancel, []);

  return {
    canActivateCard,
    onScroll,
    onScrollBeginDrag: () => begin(),
    onScrollEndDrag: endDrag,
    onMomentumScrollBegin: beginMomentum,
    onMomentumScrollEnd: (event: ScrollEvent) => { onScroll(event); finish(); },
    webHandlers: Platform.OS === 'web' ? {
      onWheel: wheel, onTouchStart: startTouch, onTouchMove: moveTouch, onTouchEnd: () => endDrag(), onTouchCancel: cancelTouch,
    } : {},
  };
}
