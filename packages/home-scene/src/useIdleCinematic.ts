import { useEffect, useLayoutEffect, useRef } from 'react';
import { createIdleCinematicController } from './idleCinematic';
import { useCinematicStore } from './cinematicStore';

type IdleCinematicOptions = { eligible: boolean; scopeKey: string };

/** Forms and any open dialog take priority, including those outside the ordinary dashboard library. */
function editingOrDialogOpen(): boolean {
  return Boolean(document.activeElement?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
    || document.querySelector('dialog[open], [aria-modal="true"]'));
}

/** Arm the quiet property tour without polling or React updates for pointer movement, and consume its exit gesture. */
export function useIdleCinematic(options: IdleCinematicOptions): void {
  const latest = useRef(options);
  latest.current = options;
  const activity = useRef<(() => void) | null>(null);

  useEffect(() => {
    const pointers = new Set<number>();
    const keys = new Set<string>();
    let touching = false;
    let windowFocused = true;
    let exitGesture = false;
    const store = useCinematicStore;
    const controller = createIdleCinematicController({
      allowed: () => latest.current.eligible && !document.hidden && windowFocused && !pointers.size && !keys.size && !touching && !editingOrDialogOpen(),
      start: () => store.getState().setShowcase(true),
      stop: () => store.getState().setShowcase(false),
    });
    activity.current = controller.activity;

    /** Swallow only the gesture that dismisses the tour, including its eventual synthetic click. */
    function consume(event: Event) { if (event.cancelable) event.preventDefault(); event.stopImmediatePropagation(); }
    /** Keep held gestures ineligible so a long touch or keyboard press cannot start a tour underneath them. */
    function pointerDown(event: PointerEvent) {
      if (!pointers.size && !touching && !store.getState().showcase) exitGesture = false;
      if (store.getState().showcase || exitGesture) { exitGesture = true; consume(event); }
      pointers.add(event.pointerId);
      controller.activity();
    }
    /** A release rearms a full quiet interval; it cannot operate a control revealed by dismissal. */
    function pointerEnd(event: PointerEvent) {
      if (exitGesture) consume(event);
      pointers.delete(event.pointerId);
      controller.activity();
    }
    /** Hover keeps an unused dashboard awake; a live drag also exits playback immediately. */
    function pointerMove(event: PointerEvent) {
      if (!store.getState().showcase || event.buttons || pointers.size) controller.activity();
    }
    /** Touch fallback covers browsers that omit pointer events and blocks multi-touch click-through. */
    function touchStart(event: TouchEvent) {
      if (!pointers.size && !touching && !store.getState().showcase) exitGesture = false;
      if (store.getState().showcase || exitGesture) { exitGesture = true; consume(event); }
      touching = true;
      controller.activity();
    }
    /** Reset touch ownership only after the whole gesture has ended. */
    function touchEnd(event: TouchEvent) {
      if (exitGesture) consume(event);
      touching = event.touches.length > 0;
      controller.activity();
    }
    /** Keyboard activation has the same first-input-to-return behavior as a tap. */
    function keyDown(event: KeyboardEvent) {
      if (!keys.size && !store.getState().showcase) exitGesture = false;
      if (store.getState().showcase || exitGesture) { exitGesture = true; consume(event); }
      keys.add(event.key);
      controller.activity();
    }
    /** Do not let the release half of the exit key activate the restored dashboard. */
    function keyUp(event: KeyboardEvent) {
      if (exitGesture) consume(event);
      keys.delete(event.key);
      controller.activity();
    }
    /** A wheel action exits without zooming or scrolling the restored scene on that same event. */
    function wheel(event: WheelEvent) {
      if (store.getState().showcase) consume(event);
      controller.activity();
    }
    /** Screen readers may activate with a click alone; that activation also returns safely. */
    function click(event: MouseEvent) {
      if (store.getState().showcase || exitGesture) consume(event);
      exitGesture = false;
      controller.activity();
    }
    /** Programmatic focus on the tour's sole return button is presentation, not user activity. */
    function focusChanged() {
      queueMicrotask(() => {
        if (!document.activeElement?.closest('[data-cinematic-return]')) controller.activity();
      });
    }
    /** Hidden windows never catch up elapsed idle time on return. */
    function visibilityChanged() {
      pointers.clear(); keys.clear(); touching = false; exitGesture = false;
      controller.activity();
    }
    /** Losing the active window cancels an incomplete gesture as well as its timer. */
    function blur() { windowFocused = false; visibilityChanged(); }
    /** A foreground return always earns another full idle interval. */
    function focus() { windowFocused = true; controller.activity(); }
    const capture = { capture: true, passive: false };
    document.addEventListener('pointerdown', pointerDown, capture);
    document.addEventListener('pointerup', pointerEnd, capture);
    document.addEventListener('pointercancel', pointerEnd, capture);
    document.addEventListener('pointermove', pointerMove, { capture: true, passive: true });
    document.addEventListener('touchstart', touchStart, capture);
    document.addEventListener('touchend', touchEnd, capture);
    document.addEventListener('touchcancel', touchEnd, capture);
    document.addEventListener('keydown', keyDown, true);
    document.addEventListener('keyup', keyUp, true);
    document.addEventListener('wheel', wheel, capture);
    document.addEventListener('click', click, true);
    document.addEventListener('focusin', focusChanged);
    document.addEventListener('focusout', focusChanged);
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    controller.activity();
    return () => {
      activity.current = null;
      controller.dispose();
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('pointerup', pointerEnd, true);
      document.removeEventListener('pointercancel', pointerEnd, true);
      document.removeEventListener('pointermove', pointerMove, true);
      document.removeEventListener('touchstart', touchStart, true);
      document.removeEventListener('touchend', touchEnd, true);
      document.removeEventListener('touchcancel', touchEnd, true);
      document.removeEventListener('keydown', keyDown, true);
      document.removeEventListener('keyup', keyUp, true);
      document.removeEventListener('wheel', wheel, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('focusin', focusChanged);
      document.removeEventListener('focusout', focusChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
    };
  }, []);

  // A new authorization scope, navigation destination or blocker requires fresh uninterrupted inactivity.
  useLayoutEffect(() => { activity.current?.(); }, [options.eligible, options.scopeKey]);
}
