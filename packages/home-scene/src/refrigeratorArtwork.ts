import type { EquipmentArtworkDrawing } from './equipmentArtworkGeometry';

/** Sculpt a pearl-metal French-door refrigerator with dark glass, recessed handles and a freezer drawer. */
export function createRefrigeratorEquipmentArtwork(prefix: string, on: boolean): EquipmentArtworkDrawing {
  return { viewBox: '0 0 280 260', gradients: [
    { id: `${prefix}-edge`, x2: '100%', y2: '20%', stops: [[0, '#F0EAF8'], [.16, '#756C84'], [.4, '#3D344B'], [.8, '#C1B6CC'], [1, '#72667F']] },
    { id: `${prefix}-pearl`, x2: '100%', y2: '12%', stops: [[0, '#9D93AC'], [.08, '#EBE6F0'], [.34, '#D7D0DF'], [.7, '#C1B6CE'], [1, '#91829F']] },
    { id: `${prefix}-right`, x2: '100%', y2: '70%', stops: [[0, '#DDD5E6'], [.28, '#F0EBF4'], [.7, '#B6A8C7'], [1, '#82728E']] },
    { id: `${prefix}-drawer`, x2: '20%', y2: '100%', stops: [[0, '#D7CCDF'], [.12, '#EDE6F4'], [.65, '#ADA0BC'], [1, '#766586']] },
    { id: `${prefix}-handle`, x2: '100%', y2: '0%', stops: [[0, '#F8F3FF'], [.24, '#DCD0E8'], [.5, '#857491'], [.76, '#F1E4FF'], [1, '#6B597B']] },
    { id: `${prefix}-glass`, kind: 'radial', cx: '25%', cy: '10%', r: '95%', stops: [[0, '#544761'], [.35, '#292332'], [1, '#0D0B13']] },
  ], shapes: [
    { kind: 'ellipse', cx: 144, cy: 244, rx: 91, ry: 10, fill: '#07050D', opacity: .65 },
    { kind: 'path', d: 'M60 19 Q60 9 72 8 H201 L221 22 V230 L208 240 H66 Q57 239 57 229 Z', fill: `url(#${prefix}-edge)`, stroke: '#A59AB8', strokeWidth: 1 },
    { kind: 'path', d: 'M206 16 L220 23 V230 L207 238 Z', fill: '#3D344B', stroke: '#71627E', strokeWidth: .6 },
    { kind: 'path', d: 'M211 23 L216 27 V225 L211 230 Z', fill: '#85748F', opacity: .25 },
    { kind: 'rect', x: 62, y: 15, width: 144, height: 221, rx: 9, fill: '#100D18', stroke: '#4E415B', strokeWidth: 1.2 },
    { kind: 'rect', x: 65, y: 18, width: 68, height: 143, rx: 6, fill: `url(#${prefix}-pearl)`, stroke: '#D3C8E1', strokeWidth: .7 },
    { kind: 'rect', x: 138, y: 18, width: 65, height: 143, rx: 6, fill: `url(#${prefix}-right)`, stroke: '#D4C6E0', strokeWidth: .7 },
    { kind: 'path', d: 'M68 25 Q68 21 74 21 H127 M142 21 H195 Q200 21 200 27', stroke: '#FFFFFF', fill: 'none', strokeWidth: .8, opacity: .75 },
    { kind: 'path', d: 'M70 29 V153 M142 31 V152', stroke: '#FFFFFF', strokeWidth: .8, opacity: .25 },
    // Recessed dark dispenser cavity, tactile outlet and drip tray; no live delivery is implied.
    { kind: 'rect', x: 76, y: 54, width: 42, height: 72, rx: 6, fill: '#7F708E', stroke: '#E6DDEE', strokeWidth: .9 },
    { kind: 'rect', x: 79, y: 57, width: 36, height: 66, rx: 4, fill: `url(#${prefix}-glass)`, stroke: '#40374D', strokeWidth: .8 },
    { kind: 'path', d: 'M81 60 H111 V75 H81 Z', fill: '#30263E' },
    { kind: 'path', d: 'M94 77 H103 V83 H100 V89 H96 V82 H94 Z', fill: '#AB9DBB', stroke: '#E4D9EF', strokeWidth: .6 },
    { kind: 'path', d: 'M93 89 H104 L106 112 H91 Z', fill: '#201A2A', stroke: '#574765', strokeWidth: .7 },
    { kind: 'path', d: 'M81 116 H113 V121 H81 Z', fill: '#9585A7' },
    { kind: 'path', d: 'M84 117 V120 M89 117 V120 M94 117 V120 M99 117 V120 M104 117 V120 M109 117 V120', stroke: '#302739', strokeWidth: 1.2 },
    { kind: 'rect', x: 85, y: 65, width: 23, height: 2, rx: 1, fill: on ? '#D5B5FF' : '#65566F', testId: 'refrigerator-status-light' },
    { kind: 'circle', cx: 88, cy: 71, r: 1, fill: '#B6A6C6' },
    { kind: 'circle', cx: 96, cy: 71, r: 1, fill: '#B6A6C6' },
    { kind: 'circle', cx: 104, cy: 71, r: 1, fill: '#B6A6C6' },
    // Long metal pulls have a narrow cast shadow and continuous highlight.
    { kind: 'rect', x: 123, y: 57, width: 6, height: 82, rx: 3, fill: '#4D3F59', opacity: .75 },
    { kind: 'rect', x: 120, y: 54, width: 6, height: 81, rx: 3, fill: `url(#${prefix}-handle)`, stroke: '#E0D3EA', strokeWidth: .5 },
    { kind: 'rect', x: 145, y: 57, width: 6, height: 82, rx: 3, fill: '#594969', opacity: .6 },
    { kind: 'rect', x: 142, y: 54, width: 6, height: 81, rx: 3, fill: `url(#${prefix}-handle)`, stroke: '#E0D3EA', strokeWidth: .5 },
    { kind: 'path', d: 'M172 36 H189 M176 40 H185', stroke: '#71617F', strokeWidth: 1, opacity: .65 },
    { kind: 'rect', x: 65, y: 165, width: 138, height: 25, rx: 4, fill: `url(#${prefix}-drawer)`, stroke: '#D7C9E4', strokeWidth: .7 },
    { kind: 'path', d: 'M76 170 H192 V175 Q134 179 76 175 Z', fill: '#4E3F5F', stroke: '#9F8BB2', strokeWidth: .7 },
    { kind: 'path', d: 'M77 170 H191', stroke: '#F2E6FE', strokeWidth: 1.3 },
    { kind: 'rect', x: 65, y: 194, width: 138, height: 36, rx: 5, fill: `url(#${prefix}-drawer)`, stroke: '#BAA7CD', strokeWidth: .7 },
    { kind: 'path', d: 'M76 200 H192 V205 Q134 210 76 205 Z', fill: '#4E3F5F', stroke: '#9F8BB2', strokeWidth: .7 },
    { kind: 'path', d: 'M77 200 H191', stroke: '#F2E6FE', strokeWidth: 1.3 },
    { kind: 'path', d: 'M71 224 H197', stroke: '#F0E1FC', strokeWidth: .7, opacity: .45 },
    { kind: 'rect', x: 73, y: 233, width: 11, height: 7, rx: 2, fill: '#15101D' },
    { kind: 'rect', x: 185, y: 233, width: 11, height: 7, rx: 2, fill: '#15101D' },
    { kind: 'path', d: 'M96 234 H173 M96 237 H173', stroke: '#665873', strokeWidth: .7 },
  ] };
}
