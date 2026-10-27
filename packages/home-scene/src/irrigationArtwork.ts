import type { EquipmentArtworkDrawing, EquipmentArtworkShape } from './equipmentArtworkGeometry';

/** Sculpt a brushed-metal pop-up sprinkler, with power reflected only in its small status light. */
export function createIrrigationEquipmentArtwork(prefix: string, on: boolean): EquipmentArtworkDrawing {
  return { viewBox: '0 0 280 210', gradients: [
    { id: `${prefix}-metal`, x2: '100%', y2: '10%', stops: [[0, '#554564'], [.17, '#DCCBE8'], [.32, '#A38BB4'], [.56, '#36243F'], [.79, '#826B93'], [1, '#D5BFE5']] },
    { id: `${prefix}-rim`, x2: '85%', y2: '100%', stops: [[0, '#F9EFFF'], [.24, '#B59DCB'], [.49, '#44334F'], [.75, '#CDB0E2'], [1, '#6F507F']] },
    { id: `${prefix}-cap`, kind: 'radial', cx: '35%', cy: '20%', r: '80%', stops: [[0, '#867598'], [.48, '#382B48'], [1, '#130D20']] },
    { id: `${prefix}-ground`, kind: 'radial', cx: '46%', cy: '35%', r: '65%', stops: [[0, '#486550'], [.5, '#263D32'], [1, '#0D1B19']] },
  ], shapes: [
    { kind: 'ellipse', cx: 140, cy: 194, rx: 111, ry: 12, fill: '#08050D', opacity: .65 },
    { kind: 'ellipse', cx: 140, cy: 180, rx: 103, ry: 20, fill: '#101219', stroke: '#5F536C', strokeWidth: .8 },
    { kind: 'ellipse', cx: 140, cy: 176, rx: 103, ry: 19, fill: `url(#${prefix}-ground)`, stroke: '#719078', strokeWidth: .6 },
    // A few blades of turf provide scale, without pretending to map a property's watering zones.
    { kind: 'path', d: 'M55 176 L52 169 M57 175 L60 167 M71 166 L70 160 M78 164 L81 159 M209 169 L214 163 M221 175 L224 168 M197 182 L199 176 M79 184 L76 179', fill: 'none', stroke: '#90A582', strokeWidth: 1.1, opacity: .65 },
    { kind: 'ellipse', cx: 140, cy: 175, rx: 57, ry: 13, fill: '#0A0B10', opacity: .7 },
    { kind: 'path', d: 'M96 155 V173 C97 190 183 190 184 173 V155 Z', fill: '#1B1524', stroke: '#73617F', strokeWidth: 1 },
    { kind: 'ellipse', cx: 140, cy: 155, rx: 44, ry: 13, fill: `url(#${prefix}-rim)` },
    { kind: 'ellipse', cx: 140, cy: 154, rx: 38, ry: 9, fill: '#15101D', stroke: '#BEA3D2', strokeWidth: .7 },
    { kind: 'path', d: 'M110 105 V158 C110 174 170 174 170 158 V105 Z', fill: `url(#${prefix}-metal)`, stroke: '#AA92BA', strokeWidth: .8 },
    { kind: 'path', d: 'M119 115 V158 Q119 163 126 164 V117 Z', fill: '#F0DFFF', opacity: .3 },
    { kind: 'path', d: 'M154 114 V164 M159 114 V163', stroke: '#1D1328', strokeWidth: 1, opacity: .5 },
    { kind: 'path', d: 'M111 149 C122 158 157 158 169 149 M111 153 C122 162 157 162 169 153', fill: 'none', stroke: '#3B2A46', strokeWidth: 1 },
    // Broad beveled nozzle head and recessed outlet give the centerpiece a physical silhouette.
    { kind: 'path', d: 'M92 87 V108 C92 132 188 132 188 108 V87 Z', fill: `url(#${prefix}-metal)`, stroke: '#A68BB9', strokeWidth: .8 },
    { kind: 'ellipse', cx: 140, cy: 88, rx: 48, ry: 18, fill: `url(#${prefix}-rim)` },
    { kind: 'ellipse', cx: 140, cy: 86, rx: 43, ry: 14, fill: `url(#${prefix}-cap)`, stroke: '#9C83AF', strokeWidth: .7 },
    { kind: 'ellipse', cx: 140, cy: 85, rx: 28, ry: 8, fill: '#110C1C', stroke: '#7B608F', strokeWidth: .7 },
    { kind: 'ellipse', cx: 140, cy: 84, rx: 17, ry: 5, fill: '#7D648D', stroke: '#C7AFD8', strokeWidth: .6 },
    { kind: 'path', d: 'M130 84 H150', stroke: '#21152B', strokeWidth: 2 },
    { kind: 'path', d: 'M102 103 C121 113 159 113 178 103 L178 112 C159 122 121 122 102 112 Z', fill: '#090710', stroke: '#57415F', strokeWidth: .5 },
    { kind: 'path', d: 'M108 106 V113 M117 109 V116 M127 111 V118 M138 112 V119 M149 112 V119 M160 110 V117 M171 108 V114', stroke: '#AD8AC3', strokeWidth: 1.2, opacity: .65 },
    { kind: 'path', d: 'M99 89 C107 98 127 103 146 102', fill: 'none', stroke: '#F6E5FF', strokeWidth: 1, opacity: .7 },
    { kind: 'rect', x: 132, y: 136, width: 16, height: 6, rx: 3, fill: '#100A18', stroke: '#786087', strokeWidth: .5 },
    { kind: 'rect', x: 136, y: 138, width: 8, height: 2, rx: 1, fill: on ? '#CDA9FF' : '#665571' },
    { kind: 'path', d: 'M104 174 C119 183 164 183 178 173', fill: 'none', stroke: '#D5B6E9', strokeWidth: .8, opacity: .5 },
  ] };
}

/** Fixed decorative spray arcs respond to accepted power only, with no flow-rate or zone-coverage claim. */
export function createIrrigationSprayArtwork(prefix: string): EquipmentArtworkDrawing {
  const shapes: EquipmentArtworkShape[] = [];
  const arcs = [
    'M113 103 C84 21 28 26 18 150', 'M119 100 C101 3 46 2 38 132',
    'M126 99 C120 6 79 6 64 102', 'M167 103 C196 21 252 26 262 150',
    'M161 100 C179 3 234 2 242 132', 'M154 99 C160 6 201 6 216 102',
  ];
  for (const d of arcs) {
    shapes.push({ kind: 'path', d, fill: 'none', stroke: `url(#${prefix}-water)`, strokeWidth: 2.2, opacity: .25 },
      { kind: 'path', d, fill: 'none', stroke: `url(#${prefix}-water)`, strokeWidth: .8, opacity: .95 });
  }
  for (const [x, y, r] of [[18, 157, 1.5], [17, 167, 1], [37, 139, 1.2], [35, 149, .9], [62, 109, 1.1],
    [262, 157, 1.5], [263, 167, 1], [243, 139, 1.2], [245, 149, .9], [218, 109, 1.1]]) {
    shapes.push({ kind: 'ellipse', cx: x, cy: y, rx: r, ry: r * 1.8, fill: '#C4E1E6', opacity: .7 });
  }
  return { viewBox: '0 0 280 210', gradients: [
    { id: `${prefix}-water`, x1: '0%', y1: '0%', x2: '0%', y2: '100%', stops: [[0, '#D7BFFF'], [.36, '#B6D7F2'], [1, '#54798C']] },
  ], shapes };
}
