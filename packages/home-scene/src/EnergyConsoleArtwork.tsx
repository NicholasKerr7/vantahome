import { useId } from 'react';
import type { EnergyControllerState } from './energyController';
import { createEnergyArtwork } from './energyArtwork';
import { EnergyEquipmentSvg } from './EnergyEquipmentSvg';

/** Render lightweight equipment with local paint servers and meaningful readings outside the artwork. */
export function EnergyConsoleArtwork({ energy }: { energy: EnergyControllerState }) {
  const prefix = `${useId().replace(/:/g, '')}-energy`;
  return <svg className="energy-artwork" viewBox="0 0 240 160" aria-hidden="true" focusable="false" data-kind={energy.kind}>
    <EnergyEquipmentSvg drawing={createEnergyArtwork(prefix, energy)} />
  </svg>;
}
