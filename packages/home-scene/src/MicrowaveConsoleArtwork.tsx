import { useId } from 'react';
import { createMicrowaveEquipmentArtwork } from './microwaveArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';

/** Render the shared appliance with an accepted-power cavity light and no idle animation loop. */
export function MicrowaveConsoleArtwork({ on }: { on: boolean }) {
  const prefix = `${useId().replace(/:/g, '')}-microwave`;
  return <div className="microwave-artwork" aria-hidden="true" data-running={on}>
    <svg viewBox="0 0 320 210" focusable="false"><EquipmentArtworkSvg drawing={createMicrowaveEquipmentArtwork(prefix, on)} /></svg>
  </div>;
}
