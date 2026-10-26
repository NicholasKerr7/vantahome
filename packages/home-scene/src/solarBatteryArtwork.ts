import { ENERGY_ARTWORK_PLINTH, energyArtworkMaterials, type EnergyArtworkDrawing } from './energyArtworkGeometry';

/** A recessed charge window reflects the saved sample, independently of power and reserve preferences. */
export function createSolarBatteryArtwork(prefix: string, charge: number | null, on: boolean): EnergyArtworkDrawing {
  const material = energyArtworkMaterials(prefix);
  const fillHeight = charge !== null && Number.isFinite(charge) ? Math.max(0, Math.min(100, charge)) * .57 : 0;
  return { gradients: material.gradients, shapes: [
    ...ENERGY_ARTWORK_PLINTH,
    // Layered feet, side wall and curved front form one compact storage cabinet.
    { kind: 'path', d: 'M77 127 L145 119 L167 129 L167 136 L99 147 L77 138 Z', fill: '#100D18', stroke: '#65546F', strokeWidth: .7 },
    { kind: 'path', d: 'M76 34 Q76 27 84 25 L138 14 Q144 13 150 17 L168 28 Q172 31 172 37 L172 119 Q172 127 164 130 L110 143 Q104 145 99 142 L82 132 Q76 129 76 122 Z', fill: material.metal, stroke: '#B7A8CA', strokeWidth: .8 },
    { kind: 'path', d: 'M142 20 L164 32 Q168 34 168 40 L168 118 Q168 124 162 126 L142 131 Z', fill: material.shell },
    { kind: 'path', d: 'M82 34 Q82 30 88 29 L136 19 Q142 18 142 25 L142 124 Q142 132 135 134 L91 144 L85 131 Q82 129 82 123 Z', fill: material.shell, stroke: '#B9A8CF', strokeWidth: .8 },
    { kind: 'path', d: 'M85 37 L137 25 L137 125 Q137 129 133 130 L88 140 Z', fill: '#1A1627', stroke: '#53455F', strokeWidth: .5 },
    { kind: 'path', d: 'M86 36 L135 25 L135 50 L86 61 Z', fill: '#CDC0E6', opacity: .06 },
    // Decorative embossed mark remains quiet when disabled; it is not a charging animation.
    { kind: 'path', d: 'M104 45 L112 53 L122 40 M104 45 L104 56 L112 63 L122 50 L122 40', fill: 'none', stroke: '#9C8CAF', strokeWidth: 1.3 },
    { kind: 'path', d: 'M101 74 L125 68 L125 118 L101 124 Z', fill: '#0C0B14', stroke: '#625070', strokeWidth: .7 },
    { kind: 'path', d: 'M109 86 L118 80 L114 94 L120 93 L108 113 L111 99 L105 101 Z', fill: material.violet, opacity: on ? .8 : .25 },
    // The side gauge remains readable at compact sizes and keeps the sample while powered off.
    { kind: 'rect', x: 149, y: 53, width: 13, height: 64, rx: 5, fill: '#0A0912', stroke: '#675773', strokeWidth: .7 },
    { kind: 'rect', testId: 'energy-battery-charge-fill', x: 152, y: 113 - fillHeight, width: 7, height: fillHeight, rx: 2, fill: material.violet, opacity: charge === null ? 0 : .9 },
    { kind: 'path', d: 'M150 70 L161 70 M150 85 L161 85 M150 100 L161 100', stroke: '#21172E', strokeWidth: 2 },
    { kind: 'circle', cx: 155, cy: 43, r: 2.4, fill: on ? '#D9C1FA' : '#62596D' },
    { kind: 'path', d: 'M86 125 L95 123 M86 128 L95 126 M86 131 L95 129 M124 117 L134 115 M124 120 L134 118 M124 123 L134 121', stroke: '#6A5C78', strokeWidth: 1 },
    { kind: 'path', d: 'M82 35 L82 122 Q82 127 87 130 M88 29 L136 19', fill: 'none', stroke: '#F1E6FF', strokeWidth: .7, opacity: .65 },
    { kind: 'path', d: 'M95 139 L135 129 M146 132 L164 126', fill: 'none', stroke: material.violet, strokeWidth: 1, opacity: .6 },
  ] };
}
