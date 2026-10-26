import { sculptedEnergyMaterials, type EnergyArtworkDrawing, type EnergyArtworkShape } from './energyArtworkGeometry';

/** A substantial generator enclosure reflects explicit simulation power without inventing motor movement. */
export function createBackupGeneratorArtwork(prefix: string, on: boolean): EnergyArtworkDrawing {
  const m = sculptedEnergyMaterials(prefix);
  const shapes: EnergyArtworkShape[] = [
    { kind: 'ellipse', cx: 130, cy: 183, rx: 111, ry: 12, fill: '#080510', opacity: .65 },
    { kind: 'path', d: 'M48 164 H73 V181 Q60 185 48 181 Z M185 164 H210 V181 Q197 185 185 181 Z', fill: '#0C0813' },
    { kind: 'path', d: 'M52 166 H69 V179 H52 Z M189 166 H206 V179 H189 Z', fill: '#51425F' },
    // A broad cast hood overhangs the recessed front, with the rear wall visible on the right.
    { kind: 'path', d: 'M34 48 L48 31 Q50 27 61 26 L213 27 Q224 28 230 40 L241 57 V155 Q241 166 229 169 L43 171 Q27 171 25 155 V63 Q25 54 34 48 Z', fill: m.graphite },
    { kind: 'path', d: 'M35 47 L50 32 Q53 29 62 29 H211 Q220 29 225 40 L234 53 L34 58 Z', fill: m.ceramic },
    { kind: 'path', d: 'M48 43 L58 34 H209 L217 44 Z', fill: '#92819F', opacity: .5 },
    { kind: 'path', d: 'M72 34 H102 M109 34 H139 M146 34 H176 M183 34 H202', stroke: '#62546E', strokeWidth: 2 },
    { kind: 'rect', x: 23, y: 51, width: 211, height: 118, rx: 20, fill: m.edge },
    { kind: 'rect', x: 27, y: 55, width: 203, height: 110, rx: 17, fill: m.graphite },
    { kind: 'path', d: 'M43 59 H213 Q223 60 225 73 V145 Q222 158 211 160 H43 Q31 157 31 145 V74 Q31 62 43 59 Z', fill: '#2C2238' },
    // The deep stationary grille suggests equipment construction, never a spinning engine.
    { kind: 'circle', cx: 87, cy: 110, r: 46, fill: m.edge },
    { kind: 'circle', cx: 87, cy: 110, r: 41, fill: '#0B0712', stroke: '#24142F', strokeWidth: 2 },
    { kind: 'circle', cx: 87, cy: 110, r: 36, fill: m.well },
    { kind: 'circle', cx: 87, cy: 110, r: 43, fill: 'none', stroke: on ? '#D7ABFF' : '#685272', strokeWidth: 1.2 },
  ];
  // Paired dark slots and illuminated lips provide depth with bounded geometry and no SVG filter.
  for (let offset = -28; offset <= 28; offset += 7) {
    const half = Math.sqrt(34 ** 2 - offset ** 2);
    const left = (87 - half).toFixed(2);
    const right = (87 + half).toFixed(2);
    shapes.push({ kind: 'path', d: `M${left} ${110 + offset} H${right}`, stroke: '#09060E', strokeWidth: 4 },
      { kind: 'path', d: `M${left} ${108.8 + offset} H${right}`, stroke: '#8F749F', strokeWidth: 1.1 });
  }
  shapes.push(
    { kind: 'circle', cx: 87, cy: 110, r: 12, fill: m.edge, stroke: '#21142C', strokeWidth: 1 },
    { kind: 'circle', cx: 87, cy: 110, r: 6, fill: '#2A1B36' },
    { kind: 'path', d: 'M83 110 H91', stroke: '#D6BFE6', strokeWidth: 1.4 },
    { kind: 'rect', x: 145, y: 69, width: 66, height: 81, rx: 9, fill: '#120C1C', stroke: '#7F668F', strokeWidth: .7 },
    { kind: 'rect', x: 151, y: 75, width: 54, height: 26, rx: 5, fill: m.well },
    { kind: 'path', d: 'M158 85 H179 M158 91 H171', stroke: on ? '#D8BCF5' : '#7C648B', strokeWidth: 2 },
    { kind: 'circle', cx: 195, cy: 87, r: 3.2, fill: on ? '#E6CFFF' : '#4E405D' },
    { kind: 'rect', x: 153, y: 109, width: 28, height: 31, rx: 5, fill: m.graphite },
    { kind: 'rect', x: 159, y: 113, width: 16, height: 22, rx: 4, fill: '#0B0712', stroke: '#8B729C', strokeWidth: .6 },
    { kind: 'path', d: 'M165 119 V130', stroke: '#CEB4DF', strokeWidth: 2 },
    { kind: 'path', d: 'M189 113 H202 M189 119 H202 M189 125 H202 M189 131 H202', stroke: '#5A4369', strokeWidth: 1.6 },
    { kind: 'path', d: 'M232 69 L237 66 M232 79 L237 76 M232 89 L237 86 M232 99 L237 96 M232 109 L237 106 M232 119 L237 116 M232 129 L237 126 M232 139 L237 136', stroke: '#0D0815', strokeWidth: 2 },
    { kind: 'path', d: 'M42 54 H213 Q227 54 230 66 M30 75 V143', fill: 'none', stroke: '#F3E3FF', strokeWidth: .8, opacity: .65 },
    { kind: 'path', d: 'M49 164 H204', stroke: '#B291C8', strokeWidth: 1, opacity: .6 },
  );
  return { viewBox: '0 0 260 200', gradients: m.gradients, shapes };
}
