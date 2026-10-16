import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useHomeStore } from './state';
import './page-scroll-rail.css';

const PAGE_WIDTH = 44;
const SETTLE_DELAY = 160;

interface PageScrollRailProps {
  page: number;
  count: number;
  onChange: (page: number) => void;
  label: string;
  resetKey?: string;
  statusMarker?: 'room' | 'library';
}

/** Respect system motion changes even when the surrounding surface has no motion class. */
function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Add touch and trackpad browsing beside existing buttons without intercepting device controls. */
export function PageScrollRail({ page, count, onChange, label, resetKey = '', statusMarker }: PageScrollRailProps) {
  const total = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
  const selected = Math.max(0, Math.min(total - 1, Number.isFinite(page) ? Math.floor(page) : 0));
  const motionDisabled = useHomeStore((state) => state.motionDisabled);
  const systemReducedMotion = useSystemReducedMotion();
  const reducedMotion = motionDisabled || systemReducedMotion;
  const hintId = useId();
  const track = useRef<HTMLDivElement>(null);
  const current = useRef({ page: selected, total, resetKey, onChange, reducedMotion });
  current.current = { page: selected, total, resetKey, onChange, reducedMotion };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interaction = useRef({ generation: 0, active: false, held: false, start: 0, moved: false });
  const suppressClick = useRef(false);

  /** A changed scope or external navigation invalidates every pending gesture callback. */
  function cancelInteraction() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    interaction.current = { ...interaction.current, generation: interaction.current.generation + 1, active: false, held: false };
  }

  /** Keep programmatic alignment separate from user-driven page selection. */
  function alignPage(next: number, animated: boolean) {
    const element = track.current;
    if (!element) return;
    const left = next * PAGE_WIDTH;
    if (typeof element.scrollTo === 'function') element.scrollTo({ left, behavior: animated && !current.current.reducedMotion ? 'smooth' : 'auto' });
    else element.scrollLeft = left;
  }

  /** Commit only the last settled gesture, after native momentum has stopped. */
  function scheduleSettle() {
    if (timer.current !== null) clearTimeout(timer.current);
    if (!interaction.current.active || interaction.current.held) return;
    const generation = interaction.current.generation;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!interaction.current.active || interaction.current.held || generation !== interaction.current.generation) return;
      const next = Math.max(0, Math.min(current.current.total - 1, Math.round((track.current?.scrollLeft ?? 0) / PAGE_WIDTH)));
      interaction.current.active = false;
      if (next !== current.current.page) current.current.onChange(next);
      else alignPage(next, true);
    }, SETTLE_DELAY);
  }

  /** Start a fresh user gesture; stop an unfinished button-driven smooth scroll in place. */
  function beginInteraction(held: boolean) {
    if (current.current.total < 2) return;
    cancelInteraction();
    const element = track.current;
    const left = element?.scrollLeft ?? 0;
    if (element && typeof element.scrollTo === 'function') element.scrollTo({ left, behavior: 'auto' });
    suppressClick.current = false;
    interaction.current = { ...interaction.current, active: true, held, start: left, moved: false };
  }

  /** Release touch ownership without forcing a page while scroll momentum is still moving. */
  function releaseInteraction() {
    interaction.current.held = false;
    if (interaction.current.moved) suppressClick.current = true;
    scheduleSettle();
  }

  /** Keep tapping and keyboard navigation explicit and independent from scroll-end callbacks. */
  function choosePage(next: number) {
    cancelInteraction();
    if (next !== current.current.page) current.current.onChange(next);
    else alignPage(next, true);
  }

  /** Provide a single tab stop and standard directional navigation across the page rail. */
  function navigatePages(event: KeyboardEvent<HTMLDivElement>) {
    const increment = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? total - 1 : Math.max(0, Math.min(total - 1, selected + increment));
    if (!increment && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    choosePage(next);
    track.current?.querySelector<HTMLButtonElement>(`[data-scroll-page="${next}"]`)?.focus({ preventScroll: true });
  }

  const previous = useRef({ page: selected, total, resetKey });
  useLayoutEffect(() => {
    const sameScope = previous.current.total === total && previous.current.resetKey === resetKey;
    const changedPage = previous.current.page !== selected;
    cancelInteraction();
    alignPage(selected, sameScope && changedPage);
    previous.current = { page: selected, total, resetKey };
  }, [selected, total, resetKey, reducedMotion]);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    let width = element.clientWidth;
    /** Preserve the controlled page when the footer changes size during a gesture. */
    function resize() {
      if (!element || width === element.clientWidth) return;
      width = element.clientWidth;
      cancelInteraction();
      alignPage(current.current.page, false);
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(element);
    window.addEventListener('resize', resize);
    window.addEventListener('pointerup', releaseInteraction);
    window.addEventListener('touchend', releaseInteraction);
    window.addEventListener('touchcancel', cancelInteraction);
    return () => {
      cancelInteraction();
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerup', releaseInteraction);
      window.removeEventListener('touchend', releaseInteraction);
      window.removeEventListener('touchcancel', cancelInteraction);
    };
  }, []);

  return <div className="page-scroll-rail" data-page-scroll-rail={label} data-single-page={total === 1} data-reduced-motion={reducedMotion}>
    <span className="page-scroll-status" role="status" aria-live="polite" aria-atomic="true" data-room-page={statusMarker === 'room' ? '' : undefined} data-library-page={statusMarker === 'library' ? '' : undefined}>{selected + 1} / {total}</span>
    <span id={hintId} className="sr-only">Swipe horizontally or scroll to browse pages. Arrow keys also change pages.</span>
    <div ref={track} className="page-scroll-track" role="group" aria-label={`${label} pages`} aria-describedby={total > 1 ? hintId : undefined} onKeyDown={navigatePages}
      onPointerDown={() => beginInteraction(true)} onTouchStart={() => beginInteraction(true)}
      onPointerCancel={(event) => { if (event.pointerType !== 'touch') releaseInteraction(); }}
      onWheel={(event) => {
        if (!event.ctrlKey && (event.deltaX !== 0 || event.shiftKey && event.deltaY !== 0)) {
          if (!interaction.current.active) beginInteraction(false);
          // A final wheel tick at either boundary may not emit another scroll event.
          scheduleSettle();
        }
      }}
      onScroll={() => {
        if (!interaction.current.active) return;
        if (Math.abs((track.current?.scrollLeft ?? 0) - interaction.current.start) > 5) interaction.current.moved = true;
        scheduleSettle();
      }}
      onClickCapture={(event) => { if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
      {Array.from({ length: total }, (_, index) => <button key={index} className="page-scroll-target" type="button" data-scroll-page={index} aria-label={`${label} page ${index + 1} of ${total}`} aria-current={index === selected ? 'page' : undefined} tabIndex={index === selected && total > 1 ? 0 : -1} disabled={total === 1} onClick={() => choosePage(index)}><span className="page-scroll-dot" aria-hidden="true" /></button>)}
    </div>
  </div>;
}
