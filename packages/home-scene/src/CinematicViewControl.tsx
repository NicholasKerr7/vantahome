import { Clapperboard, Pause, Play } from 'lucide-react';
import { useCinematicStore } from './cinematicStore';

/** Offer deliberate camera playback while explaining when motion preferences prevent it. */
export function CinematicViewControl({ reducedMotion, immersive, unavailable }: { reducedMotion: boolean; immersive: boolean; unavailable: boolean }) {
  const showcase = useCinematicStore((state) => state.showcase);
  const setShowcase = useCinematicStore((state) => state.setShowcase);
  const disabled = !showcase && (reducedMotion || immersive || unavailable);
  const explanation = reducedMotion ? 'Cinematic view is paused by your motion preference.'
    : immersive ? 'Choose landscape or a floor plan to use cinematic view.'
      : unavailable ? 'Cinematic view is available when the scene is ready.'
        : showcase ? 'Stop the camera tour. Dragging the house also stops the tour.' : 'Start a slow camera tour of your current view.';
  return <button type="button" className="cinematic-view-control" data-cinematic-control="true" aria-label={showcase ? 'Stop cinematic view' : 'Start cinematic view'} aria-pressed={showcase}
    disabled={disabled} title={explanation} onClick={() => setShowcase(!showcase)}>
    <Clapperboard className="cinematic-control-symbol" size={17} strokeWidth={1.5} aria-hidden="true" />
    <span>{showcase ? 'Cinematic playing' : 'Cinematic view'}</span>
    {showcase ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
  </button>;
}
