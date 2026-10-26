import type { EnergyControllerState } from './energyController';
import type { EnergyArtworkDrawing } from './energyArtworkGeometry';
import { createSolarArrayArtwork } from './solarArrayArtwork';
import { createSolarBatteryArtwork } from './solarBatteryArtwork';
import { createBackupGeneratorArtwork } from './backupGeneratorArtwork';
import { createHomeEnergyArtwork } from './homeEnergyArtwork';

/** Select only this device's illustration; no subscriptions, timers or inferred cross-device flows. */
function selectedEquipmentArtwork(prefix: string, energy: EnergyControllerState): EnergyArtworkDrawing {
  switch (energy.kind) {
    case 'solar': return createSolarArrayArtwork(prefix);
    case 'battery': return createSolarBatteryArtwork(prefix, energy.chargePercent, energy.on);
    case 'generator': return createBackupGeneratorArtwork(prefix, energy.on);
    case 'energy': return createHomeEnergyArtwork(prefix, energy.gridAvailable);
  }
}

/** Keep only the material paint servers used by this selected device and current state. */
export function createEnergyArtwork(prefix: string, energy: EnergyControllerState): EnergyArtworkDrawing {
  const drawing = selectedEquipmentArtwork(prefix, energy);
  const paints = new Set(drawing.shapes.flatMap((shape) => [shape.fill, shape.stroke]));
  return { ...drawing, gradients: drawing.gradients.filter(({ id }) => paints.has(`url(#${id})`)) };
}
