import { useRef } from 'react';
import { Html } from '@react-three/drei';
import { Vector3 } from 'three';
import { HotspotLeader, useHotspotLayout } from './HotspotLayout';
import './hotspot.css';

interface HotspotProps {
  id: string;
  label: string;
  icon: string;
  position: [number, number, number];
  on: boolean;
  monitoring?: boolean;
  selected: boolean;
  expanded: boolean;
  controlMode: 'inspector' | 'quick';
  stateLabel?: string;
  tone?: 'normal' | 'warning' | 'alarm' | 'closed';
  onSelect: (id: string) => void;
}

/** An accessible DOM target stays legible as the 3D camera changes distance. */
export function Hotspot({
  id,
  label,
  icon,
  position,
  on,
  monitoring = false,
  selected,
  expanded,
  controlMode,
  stateLabel,
  tone = 'normal',
  onSelect,
}: HotspotProps) {
  const layout = useHotspotLayout();
  const button = useRef<HTMLButtonElement>(null);
  const quickControls = controlMode === 'quick';
  const status = stateLabel ?? (on ? 'On' : 'Off');
  return (
    <>
      <HotspotLeader id={id} position={position} />
      <Html
        calculatePosition={(object, camera, size) => {
          const placed = layout?.current[id];
          if (layout) {
            const edge =
              placed && placed[0] < 100
                ? 'left'
                : placed && placed[0] > size.width - 100
                  ? 'right'
                  : 'center';
            // Align edge labels inward without changing the projected touch target.
            if (button.current && button.current.dataset.labelEdge !== edge)
              button.current.dataset.labelEdge = edge;
            return placed ?? [-10000, -10000];
          }
          const projected = new Vector3()
            .setFromMatrixPosition(object.matrixWorld)
            .project(camera);
          return [
            ((projected.x + 1) * size.width) / 2,
            ((1 - projected.y) * size.height) / 2,
          ];
        }}
        position={position}
        center
        zIndexRange={[30, 0]}
        wrapperClass="device-hotspot-layer"
        className="device-hotspot-anchor"
      >
        <button
          ref={button}
          type="button"
          className={`device-hotspot ${on ? 'is-on' : ''} ${selected ? 'is-selected' : ''}`}
          data-device-hotspot={id}
          data-device-tone={tone}
          data-device-monitoring={monitoring}
          aria-label={`${label}: ${status}. ${quickControls ? 'Quick controls.' : 'Show full controls.'}`}
          aria-haspopup={quickControls ? 'dialog' : undefined}
          aria-expanded={quickControls ? expanded : undefined}
          aria-pressed={quickControls ? undefined : selected}
          aria-controls={
            quickControls
              ? expanded
                ? 'quick-device-controls'
                : undefined
              : 'room-controls'
          }
          onClick={(event) => {
            event.stopPropagation();
            onSelect(id);
          }}
        >
          <span className="device-hotspot-symbol" aria-hidden="true">
            {icon}
          </span>
          <span className="device-hotspot-label" aria-hidden="true">
            <span>{label}</span>
            <span className="device-hotspot-state">{status}</span>
          </span>
        </button>
      </Html>
    </>
  );
}
