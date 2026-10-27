import { useId, useRef } from 'react';
import { createIrrigationEquipmentArtwork, createIrrigationSprayArtwork } from './irrigationArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { useIrrigationSprayMotion } from './useIrrigationSprayMotion';

/** Keep the sculpture static while a single optional spray layer softly breathes above it. */
export function IrrigationConsoleArtwork({ on, reduced }: { on: boolean; reduced: boolean }) {
  const id = `${useId().replace(/:/g, '')}-irrigation`;
  const layer = useRef<HTMLDivElement>(null);
  useIrrigationSprayMotion(layer, on, reduced);
  return <div className="irrigation-artwork" aria-hidden="true" data-running={on}>
    <svg viewBox="0 0 280 210" focusable="false"><EquipmentArtworkSvg drawing={createIrrigationEquipmentArtwork(id, on)} /></svg>
    {on && <div ref={layer} className="irrigation-spray"><svg viewBox="0 0 280 210" focusable="false"><EquipmentArtworkSvg drawing={createIrrigationSprayArtwork(id)} /></svg></div>}
  </div>;
}
