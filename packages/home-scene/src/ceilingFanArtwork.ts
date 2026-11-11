import type { EquipmentArtworkDrawing } from './equipmentArtworkGeometry';

/** One coordinate system keeps the native and embedded suspended fan perfectly aligned. */
export const CEILING_FAN_ARTWORK = { width: 360, height: 240, rotorCenterY: 150, projection: 0.42 } as const;
export const CEILING_FAN_BLADE_ANGLES = [22, 142, 262] as const;

/** Fixed ceiling canopy and downrod sit behind the independently rotating blade plane. */
export function createCeilingFanHousing(prefix: string): EquipmentArtworkDrawing {
  const metal = `${prefix}-mount`;
  const rod = `${prefix}-rod`;
  return {
    viewBox: '0 0 360 240',
    gradients: [
      { id: metal, x2: '100%', y2: '15%', stops: [[0, '#111018'], [0.18, '#49444E'], [0.38, '#29262D'], [0.77, '#111116'], [1, '#5C5262']] },
      { id: rod, x2: '100%', y2: '0%', stops: [[0, '#15141B'], [0.35, '#77707D'], [0.55, '#3C3842'], [1, '#111118']] },
    ],
    shapes: [
      { kind: 'ellipse', cx: 180, cy: 30, rx: 46, ry: 11, fill: '#080611', opacity: 0.26 },
      { kind: 'path', d: 'M147 31 Q180 19 213 31 L211 53 Q180 66 149 53 Z', fill: `url(#${metal})`, stroke: '#716876', strokeWidth: 0.8 },
      { kind: 'ellipse', cx: 180, cy: 31, rx: 33, ry: 10, fill: '#3A3540', stroke: '#85768F', strokeWidth: 0.8 },
      { kind: 'path', d: 'M151 29 Q178 21 205 28', fill: 'none', stroke: '#B5A8BE', strokeWidth: 1, opacity: 0.65 },
      { kind: 'ellipse', cx: 180, cy: 53, rx: 31, ry: 9, fill: '#17131E', stroke: '#4C4455', strokeWidth: 0.8 },
      { kind: 'rect', x: 175, y: 54, width: 10, height: 44, rx: 3, fill: `url(#${rod})` },
      { kind: 'ellipse', cx: 180, cy: 96, rx: 12, ry: 4, fill: '#4A424F', stroke: '#76687F', strokeWidth: 0.7 },
      { kind: 'ellipse', cx: 180, cy: 218, rx: 82, ry: 5, fill: '#080510', opacity: 0.22 },
    ],
  };
}

/** A tapered walnut airfoil carries a beveled edge and quiet grain, all as lightweight vector paths. */
export function createCeilingFanBlade(prefix: string): EquipmentArtworkDrawing {
  const wood = `${prefix}-walnut`;
  return {
    viewBox: '0 0 360 360',
    gradients: [{ id: wood, x1: '0%', y1: '95%', x2: '15%', y2: '0%', stops: [
      [0, '#42231D'], [0.26, '#74432D'], [0.54, '#A86E46'], [0.8, '#C79568'], [1, '#74432F'],
    ] }],
    shapes: [
      { kind: 'path', d: 'M178 175 C220 149 274 139 336 145 Q350 145 351 155 Q352 169 336 175 C281 196 235 207 194 193 Q181 190 178 175 Z', fill: '#2C1919', stroke: '#21141A', strokeWidth: 1 },
      { kind: 'path', d: 'M178 172 C220 146 274 136 336 142 Q350 142 351 152 Q352 165 336 172 C281 193 235 204 194 190 Q181 187 178 172 Z', fill: `url(#${wood})`, stroke: '#CA9469', strokeWidth: 0.9 },
      { kind: 'path', d: 'M191 168 C236 147 285 140 335 145 Q346 145 347 151', fill: 'none', stroke: '#F2C99C', strokeWidth: 1.4, opacity: 0.64 },
      { kind: 'path', d: 'M195 186 C238 199 286 185 337 168', fill: 'none', stroke: '#40211C', strokeWidth: 1.5, opacity: 0.65 },
      { kind: 'path', d: 'M202 167 C248 151 286 150 337 151 M207 172 C250 159 297 153 340 155 M214 178 C258 168 305 157 341 158', fill: 'none', stroke: '#F0BE87', strokeWidth: 0.6, opacity: 0.35 },
      { kind: 'path', d: 'M207 184 C252 186 299 170 337 162 M226 178 C268 174 306 161 334 160 M238 154 C263 148 302 148 324 150', fill: 'none', stroke: '#4E2B24', strokeWidth: 0.7, opacity: 0.3 },
      { kind: 'path', d: 'M187 174 Q197 168 204 169 L210 183 Q202 188 194 184 Z', fill: '#694332', opacity: 0.6 },
      { kind: 'circle', cx: 196, cy: 177, r: 2.1, fill: '#3A2D29', stroke: '#AF8665', strokeWidth: 0.7 },
    ],
  };
}

/** The stationary motor occludes rear blade roots; its violet seam follows accepted power only. */
export function createCeilingFanHub(prefix: string, running: boolean): EquipmentArtworkDrawing {
  const motor = `${prefix}-motor`;
  const face = `${prefix}-face`;
  return {
    viewBox: '0 0 360 240',
    gradients: [
      { id: motor, x2: '100%', y2: '5%', stops: [[0, '#19171E'], [0.18, '#5C535F'], [0.42, '#302B34'], [0.75, '#16131B'], [1, '#4D4355']] },
      { id: face, kind: 'radial', cx: '35%', cy: '20%', stops: [[0, '#736775'], [0.28, '#443A4C'], [0.75, '#211A2C'], [1, '#110C1C']] },
    ],
    shapes: [
      { kind: 'path', d: 'M150 104 Q180 91 210 104 L208 143 Q202 158 180 159 Q157 158 152 143 Z', fill: `url(#${motor})`, stroke: '#685C72', strokeWidth: 0.8 },
      { kind: 'ellipse', cx: 180, cy: 104, rx: 30, ry: 11, fill: '#4C424F', stroke: '#9B879F', strokeWidth: 0.7 },
      { kind: 'ellipse', cx: 180, cy: 102, rx: 17, ry: 5, fill: '#211A2B' },
      { kind: 'path', d: 'M154 106 Q180 116 206 106 M154 128 Q180 138 206 128', fill: 'none', stroke: '#97849F', strokeWidth: 0.6, opacity: 0.48 },
      { kind: 'path', d: 'M158 111 L158 137', fill: 'none', stroke: '#C7ACCD', strokeWidth: 1, opacity: 0.35 },
      { kind: 'path', d: 'M188 115 V123 M192 114 V122 M196 113 V121 M200 111 V119', fill: 'none', stroke: '#110D17', strokeWidth: 2 },
      { kind: 'ellipse', cx: 180, cy: 150, rx: 29, ry: 12, fill: '#110C1B', stroke: '#796387', strokeWidth: 0.8 },
      { kind: 'path', d: 'M154 148 Q180 166 206 148', fill: 'none', stroke: running ? '#C691FF' : '#584363', strokeWidth: 1.8 },
      { kind: 'ellipse', cx: 180, cy: 152, rx: 24, ry: 9, fill: `url(#${face})`, stroke: '#71547F', strokeWidth: 0.7 },
      { kind: 'path', d: 'M173 151 L180 156 L187 151', fill: 'none', stroke: running ? '#D5B7ED' : '#8C739E', strokeWidth: 1.1 },
    ],
  };
}
