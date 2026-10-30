import { useId } from 'react';
import type { GasLeakSnapshot } from './gasLeakController';
import { createGasLeakArtwork } from './gasLeakArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';

/** Show steady decorative signal geometry; the adjacent text conveys the complete detector state. */
export function GasLeakConsoleArtwork({ detector }: { detector: GasLeakSnapshot }) {
  const prefix = `${useId().replace(/:/g, '')}-gas-leak`;
  return <div className="gas-leak-artwork" aria-hidden="true"><svg viewBox="0 0 320 210" focusable="false"><EquipmentArtworkSvg drawing={createGasLeakArtwork(prefix, detector)} /></svg></div>;
}
