import { useId, useRef } from 'react';
import { CEILING_FAN_BLADE_ANGLES, createCeilingFanBlade, createCeilingFanHousing, createCeilingFanHub } from './ceilingFanArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { useCeilingFanMotion } from './useCeilingFanMotion';

/** The fixed projected plane contains a rotating rotor; canopy and motor never spin with the blades. */
export function CeilingFanConsoleArtwork({ velocity, reduced }: { velocity: number; reduced: boolean }) {
  const id = useId().replace(/:/g, '');
  const rotor = useRef<HTMLDivElement>(null);
  useCeilingFanMotion(rotor, velocity, reduced);
  const housing = createCeilingFanHousing(id);
  const hub = createCeilingFanHub(id, velocity !== 0);
  return <div className="fan-instrument fan-suspended" data-running={velocity !== 0} data-extractor="false" aria-hidden="true">
    <svg className="fan-suspended-housing" viewBox={housing.viewBox}><EquipmentArtworkSvg drawing={housing} /></svg>
    <div className="fan-ceiling-plane"><div ref={rotor} className="fan-ceiling-rotor">
      <svg viewBox="0 0 360 360">
        {CEILING_FAN_BLADE_ANGLES.map((angle) => <g key={angle} transform={`rotate(${angle} 180 180)`}>
          <EquipmentArtworkSvg drawing={createCeilingFanBlade(`${id}-${angle}`)} />
        </g>)}
      </svg>
    </div></div>
    <svg className="fan-suspended-hub" viewBox={hub.viewBox}><EquipmentArtworkSvg drawing={hub} /></svg>
  </div>;
}
