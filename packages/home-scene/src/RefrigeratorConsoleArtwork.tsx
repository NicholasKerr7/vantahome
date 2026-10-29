import { useId } from 'react';
import { createRefrigeratorEquipmentArtwork } from './refrigeratorArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';

/** Share the sculpted appliance with native controls; the accent follows accepted simulated power only. */
export function RefrigeratorConsoleArtwork({ on }: { on: boolean }) {
  const prefix = `${useId().replace(/:/g, '')}-refrigerator`;
  return <div className="refrigerator-artwork" data-powered={on}>
    <svg viewBox="0 0 280 260" aria-hidden="true" focusable="false"><EquipmentArtworkSvg drawing={createRefrigeratorEquipmentArtwork(prefix, on)} /></svg>
  </div>;
}
