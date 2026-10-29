import { useId, useRef } from 'react';
import { createCoffeeEquipmentArtwork, createCoffeeSteamArtwork } from './coffeeArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { useEquipmentPulseMotion } from './useEquipmentPulseMotion';

/** Keep the machine static; a single optional steam layer follows accepted preview activity. */
export function CoffeeConsoleArtwork({ on, reduced }: { on: boolean; reduced: boolean }) {
  const prefix = `${useId().replace(/:/g, '')}-coffee`;
  const steam = useRef<HTMLDivElement>(null);
  useEquipmentPulseMotion(steam, on, reduced);
  return <div className="coffee-artwork" aria-hidden="true" data-running={on}>
    <svg viewBox="0 0 280 240" focusable="false"><EquipmentArtworkSvg drawing={createCoffeeEquipmentArtwork(prefix, on)} /></svg>
    {on && <div ref={steam} className="coffee-steam"><svg viewBox="0 0 280 240" focusable="false"><EquipmentArtworkSvg drawing={createCoffeeSteamArtwork()} /></svg></div>}
  </div>;
}
