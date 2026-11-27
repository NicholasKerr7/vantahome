import { useRef } from 'react';
import { ENERGY_FLOW_ARTWORK, ENERGY_FLOW_ROUTES, ENERGY_FLOW_VIEWBOX } from './powerFlowGeometry';
import { sourceFlowDirection, type EnergySourceId } from './energyFlowInsights';
import type { EnergyFlow } from './energyFlowPresentation';
import { useEquipmentPulseMotion } from './useEquipmentPulseMotion';

interface Props { flow: EnergyFlow | null; selected: EnergySourceId | null; motionDisabled: boolean }
const sources = Object.keys(ENERGY_FLOW_ROUTES) as EnergySourceId[];

/** One decorative compositor pulse serves all active routes; arrows retain direction without motion. */
export function EnergyFlowArtwork({ flow, selected, motionDisabled }: Props) {
  const pulse = useRef<HTMLDivElement>(null);
  const active = sources.filter((source) => sourceFlowDirection(flow, source) !== 'idle');
  useEquipmentPulseMotion(pulse, active.length > 0, motionDisabled);
  return <div className="energy-flow-artwork" aria-hidden="true">
    <svg viewBox={ENERGY_FLOW_VIEWBOX} focusable="false">
      {sources.map((source) => <path key={source} d={ENERGY_FLOW_ROUTES[source].d} className="energy-flow-track" data-selected={selected === source} />)}
      {ENERGY_FLOW_ARTWORK.map((path, index) => <path key={index} {...path} />)}
    </svg>
    <div ref={pulse} className="energy-flow-current">
      <svg viewBox={ENERGY_FLOW_VIEWBOX} focusable="false">
        {active.map((source) => {
          const route = ENERGY_FLOW_ROUTES[source];
          const direction = sourceFlowDirection(flow, source);
          return <g key={source} data-source={source} data-direction={direction} data-selected={selected === source}>
            <path d={route.d} className="energy-flow-live-route" />
            <path d={direction === 'out' ? route.arrowOut : route.arrowIn} className="energy-flow-arrow" />
          </g>;
        })}
      </svg>
    </div>
  </div>;
}
