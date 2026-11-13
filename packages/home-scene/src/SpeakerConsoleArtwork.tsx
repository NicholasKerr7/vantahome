import { useId, useRef } from 'react';
import { createSpeakerCabinetArtwork, createSpeakerPlaybackArtwork, SPEAKER_ARTWORK_VIEWBOX } from './speakerArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { useEquipmentPulseMotion } from './useEquipmentPulseMotion';

/** A lightweight studio speaker lights only for an audible local playback state. */
export function SpeakerConsoleArtwork({ active, reduced }: { active: boolean; reduced: boolean }) {
  const prefix = `${useId().replace(/:/g, '')}-speaker`;
  const playback = useRef<HTMLDivElement>(null);
  useEquipmentPulseMotion(playback, active, reduced);
  return <div className="speaker-artwork" aria-hidden="true" data-active={active}>
    <svg viewBox={SPEAKER_ARTWORK_VIEWBOX} focusable="false"><EquipmentArtworkSvg drawing={createSpeakerCabinetArtwork(prefix)} /></svg>
    {active && <div ref={playback} className="speaker-playback-light"><svg viewBox={SPEAKER_ARTWORK_VIEWBOX} focusable="false"><EquipmentArtworkSvg drawing={createSpeakerPlaybackArtwork(prefix)} /></svg></div>}
  </div>;
}
