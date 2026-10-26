import { useId } from 'react';
import type { EnergyControllerState } from './energyController';
import { createEnergyArtwork } from './energyArtwork';
import { EnergyEquipmentSvg } from './EnergyEquipmentSvg';

/** Render lightweight equipment with local paint servers and meaningful readings outside the artwork. */
export function EnergyConsoleArtwork({ energy }: { energy: EnergyControllerState }) {
  const prefix = `${useId().replace(/:/g, '')}-energy`;
  const drawing = createEnergyArtwork(prefix, energy);
  return <svg className="energy-artwork" viewBox={drawing.viewBox} aria-hidden="true" focusable="false" data-kind={energy.kind}>
    <EnergyEquipmentSvg drawing={drawing} />
  </svg>;
}
