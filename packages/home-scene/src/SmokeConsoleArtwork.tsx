import { useId } from 'react';
import type { SmokeControllerState } from './smokeController';
import { createSmokeArtwork } from './smokeArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';

/** Use local SVG paints; the neighboring readout conveys the full incident state. */
export function SmokeConsoleArtwork({ tone }: { tone: SmokeControllerState['tone'] }) {
  const prefix = `${useId().replace(/:/g, '')}-smoke`;
  return <div className="smoke-artwork" aria-hidden="true"><svg viewBox="0 0 320 220" focusable="false"><EquipmentArtworkSvg drawing={createSmokeArtwork(prefix, tone)} /></svg></div>;
}
