import { useId } from 'react';
import type { GasMeterSnapshot } from './gasMeterController';
import { createGasMeterArtwork } from './gasMeterArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';

/** Keep artwork decorative and lightweight; accepted valve/supply state drives its geometry. */
export function GasMeterConsoleArtwork({ meter }: { meter: GasMeterSnapshot }) {
  const prefix = `${useId().replace(/:/g, '')}-gas-meter`;
  return <div className="gas-meter-artwork" aria-hidden="true"><svg viewBox="0 0 320 210" focusable="false"><EquipmentArtworkSvg drawing={createGasMeterArtwork(prefix, meter)} /></svg></div>;
}
