import type { EquipmentArtworkDrawing } from './equipmentArtworkGeometry';

/** One coordinate system keeps the native and embedded suspended fan perfectly aligned. */
export const CEILING_FAN_ARTWORK = { width: 360, height: 240, rotorCenterY: 150, projection: 0.42 } as const;
export const CEILING_FAN_BLADE_ANGLES = [22, 142, 262] as const;

/** A closed, tapered canopy conceals the downrod joint behind the independently rotating blades. */
export function createCeilingFanHousing(prefix: string): EquipmentArtworkDrawing {
  const metal = `${prefix}-mount`;
  const rod = `${prefix}-rod`;
  const shoulder = `${prefix}-canopy-shoulder`;
  return {
    viewBox: '0 0 360 240',
    gradients: [
      { id: metal, x2: '100%', y2: '25%', stops: [[0, '#111219'], [0.16, '#4F4E59'], [0.35, '#363640'], [0.7, '#13141C'], [0.9, '#090B12'], [1, '#35313D']] },
      { id: shoulder, x2: '15%', y2: '100%', stops: [[0, '#79737F'], [0.22, '#4E4B58'], [0.62, '#25252F'], [1, '#14151D']] },
      { id: rod, x2: '100%', y2: '0%', stops: [[0, '#101119'], [0.24, '#57535F'], [0.4, '#35343F'], [0.72, '#12131D'], [1, '#36303D']] },
    ],
    shapes: [
      { kind: 'ellipse', cx: 180, cy: 31, rx: 44, ry: 9, fill: '#080711', opacity: 0.25 },
      { kind: 'path', d: 'M174 57 L186 57 L187 105 Q180 109 173 105 Z', fill: `url(#${rod})` },
      { kind: 'path', d: 'M141 34 C142 26 218 26 219 34 L217 44 C212 61 199 67 180 67 C161 67 148 61 143 44 Z', fill: `url(#${metal})`, stroke: '#5B5663', strokeWidth: 0.55 },
      { kind: 'path', d: 'M141 34 C145 21 215 21 219 34 C209 44 151 44 141 34 Z', fill: `url(#${shoulder})` },
      { kind: 'path', d: 'M147 31 C158 25 197 24 211 30', fill: 'none', stroke: '#C0AFBA', strokeWidth: 0.8, opacity: 0.58 },
      { kind: 'path', d: 'M147 39 C149 51 155 57 164 60', fill: 'none', stroke: '#ABA0B4', strokeWidth: 1.1, opacity: 0.28 },
      { kind: 'path', d: 'M157 58 Q180 68 203 58', fill: 'none', stroke: '#917763', strokeWidth: 0.85, opacity: 0.55 },
      { kind: 'path', d: 'M176 67 L176 96', fill: 'none', stroke: '#A596AE', strokeWidth: 0.7, opacity: 0.35 },
      { kind: 'ellipse', cx: 180, cy: 218, rx: 82, ry: 5, fill: '#080510', opacity: 0.18 },
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

/** A continuous graphite motor shell hides both stem and blade joints; its fine seam follows accepted power. */
export function createCeilingFanHub(prefix: string, running: boolean): EquipmentArtworkDrawing {
  const motor = `${prefix}-motor`;
  const crown = `${prefix}-crown`;
  const face = `${prefix}-face`;
  return {
    viewBox: '0 0 360 240',
    gradients: [
      { id: motor, x1: '0%', y1: '20%', x2: '100%', y2: '45%', stops: [[0, '#14151D'], [0.13, '#53515D'], [0.29, '#3C3C47'], [0.5, '#242630'], [0.78, '#0B0D15'], [1, '#3B3343']] },
      { id: crown, x1: '15%', y1: '0%', x2: '50%', y2: '100%', stops: [[0, '#77707D'], [0.22, '#57535F'], [0.6, '#34343F'], [1, '#20212C']] },
      { id: face, kind: 'radial', cx: '33%', cy: '10%', stops: [[0, '#514A5D'], [0.35, '#30283F'], [0.8, '#171222'], [1, '#0D0916']] },
    ],
    shapes: [
      { kind: 'path', d: 'M144 109 C144 99 216 99 216 109 L215 137 C213 149 199 159 180 159 C161 159 147 149 145 137 Z', fill: `url(#${motor})`, stroke: '#5D5568', strokeWidth: 0.55 },
      { kind: 'path', d: 'M144 109 C147 96 213 96 216 109 C207 120 153 120 144 109 Z', fill: `url(#${crown})` },
      { kind: 'path', d: 'M173 95 Q180 93 187 95 L188 105 Q180 110 172 105 Z', fill: `url(#${motor})` },
      { kind: 'path', d: 'M149 106 C158 101 169 101 172 101', fill: 'none', stroke: '#CEC0CE', strokeWidth: 0.9, opacity: 0.5 },
      { kind: 'path', d: 'M149 115 L150 134 Q152 141 156 144', fill: 'none', stroke: '#ABA0B9', strokeWidth: 1.3, opacity: 0.34 },
      { kind: 'path', d: 'M212 115 L211 136 Q209 142 205 145', fill: 'none', stroke: '#81718F', strokeWidth: 0.65, opacity: 0.24 },
      { kind: 'path', d: 'M150 143 C164 155 196 155 210 143', fill: 'none', stroke: '#A38A71', strokeWidth: 1, opacity: 0.68 },
      { kind: 'path', d: 'M151 147 C163 156 197 156 209 147 C207 158 195 166 180 166 C165 166 153 158 151 147 Z', fill: `url(#${face})` },
      { kind: 'path', d: 'M154 149 Q180 164 206 149', fill: 'none', stroke: running ? '#BA85F2' : '#594366', strokeWidth: 1.1, opacity: 0.85 },
      { kind: 'path', d: 'M175 155 L180 158 L185 155', fill: 'none', stroke: '#B7A1CA', strokeWidth: 0.9, opacity: 0.8 },
    ],
  };
}
