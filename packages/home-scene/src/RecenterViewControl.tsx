import type { MouseEvent } from 'react';
import { Focus } from 'lucide-react';
import { useCinematicStore } from './cinematicStore';
import './recenter-view.css';

/** Offer camera recovery only after deliberate exploration, without changing home state. */
export function RecenterViewControl({ unavailable }: { unavailable: boolean }) {
  const canRecenter = useCinematicStore((state) => state.canRecenter);
  const showcase = useCinematicStore((state) => state.showcase);
  const resetView = useCinematicStore((state) => state.resetView);
  if (unavailable || showcase || !canRecenter) return null;

  /** Hand focus to the stable scene before this contextual button disappears. */
  function recenter(event: MouseEvent<HTMLButtonElement>) {
    event.currentTarget.closest<HTMLElement>('#house-preview')?.focus({ preventScroll: true });
    resetView();
  }

  return <button type="button" className="recenter-view-control" onClick={recenter}
    title="Restore the current camera angle and zoom" aria-controls="house-preview">
    <Focus size={17} strokeWidth={1.7} aria-hidden="true" />
    <span>Recenter view</span>
  </button>;
}
