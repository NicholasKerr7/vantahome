import { useEffect, useLayoutEffect, useRef, useState, type RefObject, type PointerEvent } from 'react';
import { useHomeStore } from './state';

const SETTLE_MS = 170;
type Options = { page: number; count: number; resetKey: string; onChange: (page: number) => void };

/** Keep card movement native; commit pagination only after a still-current gesture settles. */
export function useCardScroll(track: RefObject<HTMLDivElement | null>, options: Options) {
  const appReduced = useHomeStore((state) => state.motionDisabled);
  const [systemReduced, setSystemReduced] = useState(true);
  const reduced = appReduced || systemReduced;
  const [windowPage, setWindowPage] = useState(options.page);
  const [dragging, setDragging] = useState(false);
  const current = useRef({ ...options, reduced });
  current.current = { ...options, reduced };
  const geometry = useRef({ width: 0, step: 0 });
  const visiblePage = useRef(options.page);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesture = useRef({ active: false, held: false, generation: 0, startOffset: 0, startX: 0, pointerId: -1, mouse: false, moved: false });
  const suppressClick = useRef(false);

  /** Clear delayed navigation before a filter, membership, viewport or page changes. */
  function cancel() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    gesture.current = { ...gesture.current, active: false, held: false, generation: gesture.current.generation + 1 };
  }

  /** Center the existing content surface without interpreting its events as a new swipe. */
  function align(page: number, animated: boolean) {
    const element = track.current;
    if (!element || geometry.current.step <= 0) return;
    const left = page * geometry.current.step;
    if (typeof element.scrollTo === 'function') element.scrollTo({ left, behavior: animated && !current.current.reduced ? 'smooth' : 'auto' });
    else element.scrollLeft = left;
  }

  /** Render neighboring card pages only when crossing a page, never on every animation frame. */
  function updateWindow(page: number) {
    if (visiblePage.current === page) return;
    visiblePage.current = page;
    setWindowPage(page);
  }

  /** Ignore programmatic scroll echoes and commit only the latest settled user position. */
  function settleSoon() {
    if (timer.current !== null) clearTimeout(timer.current);
    if (!gesture.current.active || gesture.current.held) return;
    const generation = gesture.current.generation;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!gesture.current.active || gesture.current.held || generation !== gesture.current.generation) return;
      const next = Math.max(0, Math.min(current.current.count - 1, Math.round((track.current?.scrollLeft ?? 0) / (geometry.current.step || 1))));
      gesture.current.active = false;
      setDragging(false);
      if (next !== current.current.page) current.current.onChange(next);
      else align(next, true);
    }, SETTLE_MS);
  }

  /** Track input separately from scrolling so taps remain taps and drags cannot open a card. */
  function begin(held: boolean, x = 0, pointerId = -1, mouse = false) {
    suppressClick.current = false;
    if (current.current.count < 2) return;
    cancel();
    gesture.current = { ...gesture.current, active: true, held, startOffset: track.current?.scrollLeft ?? 0, startX: x, pointerId, mouse, moved: false };
  }

  /** Retain native touch/trackpad momentum; mouse dragging moves this same overflow surface. */
  function movePointer(event: PointerEvent<HTMLDivElement>) {
    const pending = gesture.current;
    if (!pending.active || !pending.held || !pending.mouse || event.pointerId !== pending.pointerId) return;
    const delta = event.clientX - pending.startX;
    if (Math.abs(delta) < 7 && !pending.moved) return;
    event.preventDefault();
    if (!pending.moved) setDragging(true);
    pending.moved = true;
    suppressClick.current = true;
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.scrollLeft = pending.startOffset - delta;
  }

  /** Native momentum may continue after release, so the final scroll event owns the idle tail. */
  function release() {
    gesture.current.held = false;
    if (gesture.current.moved) suppressClick.current = true;
    settleSoon();
  }

  /** A cancelled browser gesture returns to its authoritative page without changing cards. */
  function abort() {
    cancel();
    setDragging(false);
    align(current.current.page, false);
  }

  const previous = useRef({ ...options, reduced });
  useLayoutEffect(() => {
    const element = track.current;
    if (!element) return;
    const width = element.getBoundingClientRect().width || element.clientWidth;
    const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
    geometry.current = { width, step: width + gap };
    const sameScope = previous.current.resetKey === options.resetKey && previous.current.count === options.count;
    const changedPage = previous.current.page !== options.page;
    cancel();
    setDragging(false);
    updateWindow(options.page);
    align(options.page, sameScope && changedPage);
    previous.current = { ...options, reduced };
  }, [options.page, options.count, options.resetKey, reduced]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    /** Use fractional geometry so even a narrow responsive repartition cancels stale input. */
    function resize() {
      if (!element) return;
      const width = element.getBoundingClientRect().width || element.clientWidth;
      const step = width + (Number.parseFloat(getComputedStyle(element).columnGap) || 0);
      if (width === geometry.current.width && step === geometry.current.step) return;
      geometry.current = { width, step };
      abort();
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(element);
    window.addEventListener('resize', resize);
    window.addEventListener('pointerup', release);
    window.addEventListener('touchend', release);
    window.addEventListener('touchcancel', abort);
    return () => {
      cancel();
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('touchend', release);
      window.removeEventListener('touchcancel', abort);
    };
  }, []);

  return {
    dragging,
    windowPage,
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => { if (event.button === 0) begin(true, event.clientX, event.pointerId, event.pointerType === 'mouse'); },
    onPointerMove: movePointer,
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => { if (event.pointerType !== 'touch') release(); },
    onTouchStart: () => begin(true),
    onWheel: (event: { deltaX: number; deltaY: number; shiftKey: boolean; ctrlKey: boolean }) => {
      if (event.ctrlKey || !event.deltaX && !(event.shiftKey && event.deltaY)) return;
      if (!gesture.current.active) begin(false);
      settleSoon();
    },
    onScroll: () => {
      const left = track.current?.scrollLeft ?? 0;
      const next = Math.max(0, Math.min(current.current.count - 1, Math.round(left / (geometry.current.step || 1))));
      updateWindow(next);
      if (!gesture.current.active) return;
      if (Math.abs(left - gesture.current.startOffset) > 7) {
        if (!gesture.current.moved) setDragging(true);
        gesture.current.moved = true;
        suppressClick.current = true;
      }
      settleSoon();
    },
    shouldBlockClick: () => suppressClick.current || gesture.current.moved && gesture.current.active,
  };
}
