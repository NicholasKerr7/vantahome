import { ENERGY_ARTWORK_PLINTH, energyArtworkMaterials, type EnergyArtworkDrawing } from './energyArtworkGeometry';

/** A distribution controller shows the selected grid sample without inventing connected-home power flows. */
export function createHomeEnergyArtwork(prefix: string, available: boolean | null): EnergyArtworkDrawing {
  const material = energyArtworkMaterials(prefix);
  const indicator = available === true ? '#D4B7FC' : available === false ? '#CCAB7B' : '#756B83';
  return { gradients: material.gradients, shapes: [
    ...ENERGY_ARTWORK_PLINTH,
    // Static terminal traces communicate equipment connections, with no directional particles.
    { kind: 'path', d: 'M75 127 L47 133 L36 128 M153 118 L190 129 L209 125', fill: 'none', stroke: '#655272', strokeWidth: 1 },
    { kind: 'circle', cx: 36, cy: 128, r: 2.3, fill: '#A695BB' },
    { kind: 'circle', cx: 209, cy: 125, r: 2.3, fill: '#A695BB' },
    { kind: 'path', d: 'M67 34 L139 16 Q144 15 149 18 L176 35 Q180 37 180 43 L180 116 Q180 123 173 125 L105 144 Q99 145 94 142 L68 127 Q63 124 63 117 L63 42 Q63 36 67 34 Z', fill: material.metal, stroke: '#C2B1D3', strokeWidth: .8 },
    { kind: 'path', d: 'M147 23 L174 40 L174 115 Q174 120 169 122 L147 128 Z', fill: material.shell, stroke: '#5D4D6B', strokeWidth: .7 },
    { kind: 'path', d: 'M70 41 Q70 38 75 37 L137 21 Q142 20 142 26 L142 122 Q142 128 136 130 L79 144 L73 128 Q70 126 70 120 Z', fill: material.shell, stroke: '#B7A4CC', strokeWidth: .8 },
    { kind: 'path', d: 'M75 42 L137 26 L137 119 Q137 124 132 126 L75 141 Z', fill: '#15121F', stroke: '#675472', strokeWidth: .5 },
    { kind: 'path', d: 'M76 43 L135 28 L135 48 L76 64 Z', fill: '#E4D5FA', opacity: .06 },
    // Recessed instrument ring is a state indicator, not a measured consumption gauge.
    { kind: 'ellipse', cx: 106, cy: 84, rx: 27, ry: 32, fill: '#0A0912', stroke: '#87749B', strokeWidth: 1.5 },
    { kind: 'ellipse', cx: 106, cy: 83, rx: 24, ry: 29, fill: material.glass, stroke: '#44334E', strokeWidth: 2 },
    { kind: 'path', d: 'M88 102 Q78 88 84 72 Q89 57 102 55 M111 55 Q125 57 129 74 M130 84 Q129 100 118 108', fill: 'none', stroke: indicator, strokeWidth: 2.1 },
    { kind: 'path', d: 'M93 84 L106 71 L119 80 M97 81 L97 94 L105 97 L105 88 L111 87 L111 95 L116 92 L116 79', fill: 'none', stroke: '#DACDEB', strokeWidth: 1.3 },
    { kind: 'circle', cx: 106, cy: 105, r: 1.6, fill: indicator },
    { kind: 'path', d: 'M88 120 L124 111 M88 124 L124 115', stroke: '#867294', strokeWidth: .8 },
    { kind: 'path', d: 'M154 53 L167 60 M154 59 L167 66 M154 65 L167 72 M154 71 L167 78 M154 77 L167 84 M154 83 L167 90 M154 89 L167 96', stroke: '#71607E', strokeWidth: 1.5 },
    { kind: 'path', d: 'M155 103 L166 108 L166 114 L155 109 Z', fill: '#0C0A14', stroke: '#8C769C', strokeWidth: .6 },
    { kind: 'path', d: 'M71 42 L71 119 Q71 124 75 127 M76 36 L137 20', fill: 'none', stroke: '#F3E7FF', strokeWidth: .6, opacity: .7 },
    { kind: 'path', d: 'M86 137 L135 124', stroke: material.violet, strokeWidth: .9, opacity: .55 },
  ] };
}
