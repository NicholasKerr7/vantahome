import { useId } from 'react';
import { createCooktopArtwork } from './cooktopArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';

/** Keep the decorative induction surface separate from accessible shared-setting controls. */
export function CooktopConsoleArtwork({ on, heat }: { on: boolean; heat: number | null }) {
  const prefix = `${useId().replace(/:/g, '')}-cooktop`;
  return <div className="cooktop-artwork" aria-hidden="true">
    <svg viewBox="0 0 360 230" focusable="false"><EquipmentArtworkSvg drawing={createCooktopArtwork(prefix, on, heat)} /></svg>
  </div>;
}
