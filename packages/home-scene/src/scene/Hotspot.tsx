import { useRef } from 'react';
import { Html } from '@react-three/drei';
import { Vector3 } from 'three';
import { HotspotLeader, useHotspotLayout } from './HotspotLayout';

interface HotspotProps {
  id: string;
  label: string;
  icon: string;
  position: [number, number, number];
  on: boolean;
  selected: boolean;
  expanded: boolean;
  controlMode: 'inspector' | 'quick';
  stateLabel?: string;
  onSelect: (id: string) => void;
}

/** An accessible DOM target stays legible as the 3D camera changes distance. */
export function Hotspot({
  id,
  label,
  icon,
  position,
  on,
  selected,
  expanded,
  controlMode,
  stateLabel,
  onSelect,
}: HotspotProps) {
  const layout = useHotspotLayout();
  const button = useRef<HTMLButtonElement>(null);
  const quickControls = controlMode === 'quick';
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
        className="device-hotspot-anchor"
      >
        <button
          ref={button}
          type="button"
          className={`device-hotspot ${on ? 'is-on' : ''} ${selected ? 'is-selected' : ''}`}
          data-device-hotspot={id}
          aria-label={`${label}: ${stateLabel ?? (on ? 'on' : 'off')}. ${quickControls ? 'Quick controls.' : 'Show full controls.'}`}
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
          <span className="device-hotspot-label">{label}</span>
        </button>
      </Html>
    </>
  );
}
