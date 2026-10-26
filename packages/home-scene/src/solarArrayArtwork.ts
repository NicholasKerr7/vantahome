import { sculptedEnergyMaterials, type EnergyArtworkDrawing, type EnergyArtworkShape } from './energyArtworkGeometry';

/** Project a point onto the tilted glass plane, retaining one consistent perspective for every cell. */
function panelPoint(u: number, v: number): string {
  return `${(29 + 186 * u + v * (-11 + 33 * u)).toFixed(2)} ${(34 + 12 * u + v * (99 + 2 * u)).toFixed(2)}`;
}

/** Inset module corners share the same optical plane as their fine busbars. */
function moduleFace(left: number, right: number): string {
  return `M${panelPoint(left, 0)} L${panelPoint(right, 0)} L${panelPoint(right, 1)} L${panelPoint(left, 1)} Z`;
}

/** A broad three-module array uses substantial frames and glass reflections without implying live sunlight. */
export function createSolarArrayArtwork(prefix: string): EnergyArtworkDrawing {
  const m = sculptedEnergyMaterials(prefix);
  const shapes: EnergyArtworkShape[] = [
    { kind: 'ellipse', cx: 130, cy: 182, rx: 110, ry: 12, fill: '#080510', opacity: .6 },
    { kind: 'ellipse', cx: 130, cy: 181, rx: 82, ry: 6, fill: '#080510', opacity: .5 },
    // The rack has its own believable footing, rather than a decorative platform.
    { kind: 'path', d: 'M43 101 L53 102 L61 174 L51 175 Z M190 108 L199 109 L215 182 L204 181 Z', fill: m.graphite },
    { kind: 'path', d: 'M51 106 L56 107 L62 173 L57 174 Z M198 115 L202 116 L215 182 L209 181 Z', fill: m.edge },
    { kind: 'path', d: 'M53 169 L125 138 L128 143 L58 175 Z M199 173 L131 142 L127 146 L204 180 Z', fill: '#7E6C8F' },
    { kind: 'path', d: 'M41 173 L63 171 L73 177 L47 180 Z M195 179 L217 180 L226 186 L200 185 Z', fill: m.edge },
    // Thick aluminium extrusion separates the glass from the dark undercarriage.
    { kind: 'path', d: 'M22 27 L222 40 L247 153 L245 162 L12 146 L10 138 Z', fill: m.graphite },
    { kind: 'path', d: 'M22 27 L222 40 L247 153 L10 138 Z', fill: m.edge },
    { kind: 'path', d: 'M26 31 L218 44 L241 149 L15 135 Z', fill: '#070E1D' },
  ];
  // Three broad cells sets: module gaps remain dark and metallic busbars stay subtle.
  for (let module = 0; module < 3; module += 1) {
    const left = module / 3 + .009;
    const right = (module + 1) / 3 - .009;
    shapes.push({ kind: 'path', d: moduleFace(left, right), fill: m.cells });
    let grid = '';
    let busbars = '';
    for (let row = 1; row < 6; row += 1) grid += `M${panelPoint(left, row / 6)} L${panelPoint(right, row / 6)} `;
    for (let column = 1; column < 3; column += 1) {
      const u = left + (right - left) * column / 3;
      grid += `M${panelPoint(u, 0)} L${panelPoint(u, 1)} `;
    }
    for (let column = 0; column < 3; column += 1) for (const fraction of [.3, .7]) {
      const u = left + (right - left) * (column + fraction) / 3;
      busbars += `M${panelPoint(u, 0)} L${panelPoint(u, 1)} `;
    }
    shapes.push({ kind: 'path', d: grid, fill: 'none', stroke: '#A4ACCA', strokeWidth: .65, opacity: .65 },
      { kind: 'path', d: busbars, fill: 'none', stroke: '#8096BA', strokeWidth: .3, opacity: .55 });
  }
  shapes.push(
    { kind: 'path', d: 'M32 35 L103 40 L69 136 L19 133 Z', fill: '#D0E0FF', opacity: .12 },
    { kind: 'path', d: 'M148 43 L178 45 L146 141 L123 140 Z', fill: '#E9F1FF', opacity: .055 },
    { kind: 'path', d: 'M23 28 L221 41 M13 139 L245 154', fill: 'none', stroke: '#F2E9FF', strokeWidth: 1.25, opacity: .8 },
    { kind: 'path', d: 'M15 143 L242 158', stroke: '#80678D', strokeWidth: 2 },
    { kind: 'path', d: 'M28 33 L18 132 M219 46 L239 147', stroke: '#C4B2D4', strokeWidth: .7 },
    { kind: 'circle', cx: 25, cy: 33, r: 1.2, fill: '#3D314B' },
    { kind: 'circle', cx: 219, cy: 44, r: 1.2, fill: '#3D314B' },
    { kind: 'circle', cx: 17, cy: 136, r: 1.2, fill: '#3D314B' },
    { kind: 'circle', cx: 242, cy: 151, r: 1.2, fill: '#3D314B' },
  );
  return { viewBox: '0 0 260 200', gradients: m.gradients, shapes };
}
