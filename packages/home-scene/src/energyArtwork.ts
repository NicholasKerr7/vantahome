import type { EnergyControllerState } from './energyController';
import type { EnergyArtworkDrawing } from './energyArtworkGeometry';
import { createSolarArrayArtwork } from './solarArrayArtwork';
import { createSolarBatteryArtwork } from './solarBatteryArtwork';
import { createBackupGeneratorArtwork } from './backupGeneratorArtwork';
import { createHomeEnergyArtwork } from './homeEnergyArtwork';

/** Select only this device's illustration; no subscriptions, timers or inferred cross-device flows. */
export function createEnergyArtwork(prefix: string, energy: EnergyControllerState): EnergyArtworkDrawing {
  switch (energy.kind) {
    case 'solar': return createSolarArrayArtwork(prefix);
    case 'battery': return createSolarBatteryArtwork(prefix, energy.chargePercent, energy.on);
    case 'generator': return createBackupGeneratorArtwork(prefix, energy.on);
    case 'energy': return createHomeEnergyArtwork(prefix, energy.gridAvailable);
  }
}
