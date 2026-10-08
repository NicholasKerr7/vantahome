import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCinematicStore } from './cinematicStore';

/** Give an idle tour one full-screen return target, outside the inert dashboard, and restore the prior focus on exit. */
export function CinematicTourOverlay() {
  const button = useRef<HTMLButtonElement>(null);
  const chapter = useCinematicStore((state) => state.chapter);
  const setShowcase = useCinematicStore((state) => state.setShowcase);
  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    button.current?.focus({ preventScroll: true });
    return () => {
      requestAnimationFrame(() => {
        const target = previous?.isConnected && !previous.closest('[inert]') ? previous : document.getElementById('house-preview');
        if (target && !target.closest('[inert]')) target.focus({ preventScroll: true });
      });
    };
  }, []);
  return createPortal(<div className="cinematic-tour-overlay">
    <button ref={button} type="button" data-cinematic-return className="cinematic-tour-return" aria-label="End property tour and return to home" onClick={() => setShowcase(false)}>
      <span className="cinematic-tour-brand" aria-hidden="true">VANTAHOME <span>THE PROPERTY</span></span>
      <span className="cinematic-tour-caption"><span className="cinematic-tour-chapter" aria-hidden="true">{chapter}</span><span className="cinematic-tour-hint">Touch to return<span aria-hidden="true">↗</span></span></span>
    </button>
  </div>, document.querySelector('.supported-device-app') ?? document.body);
}
