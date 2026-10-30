import type { EquipmentArtworkDrawing, EquipmentArtworkShape } from './equipmentArtworkGeometry';

/** Draw a beveled induction surface; all rings illustrate the single shared preview setting. */
export function createCooktopArtwork(prefix: string, on: boolean, heat: number | null): EquipmentArtworkDrawing {
  const active = on && heat !== null && heat > 0;
  const signal = active ? '#F5AE86' : '#776785';
  const rings: EquipmentArtworkShape[] = [];
  for (const [cx, cy, rx, ry] of [[111, 70, 37, 24], [246, 70, 31, 20], [96, 137, 30, 20], [245, 135, 43, 28]]) {
    rings.push(
      { kind: 'ellipse', cx, cy, rx: rx + 4, ry: ry + 3, fill: active ? `url(#${prefix}-heat)` : '#14101F', opacity: active ? .4 + (heat ?? 0) * .05 : 1 },
      { kind: 'ellipse', cx, cy, rx, ry, fill: 'none', stroke: signal, strokeWidth: 1.3 },
      { kind: 'ellipse', cx, cy, rx: rx - 7, ry: ry - 5, fill: 'none', stroke: signal, strokeWidth: .8, opacity: .65 },
      { kind: 'path', d: `M${cx - 5} ${cy} h10 M${cx} ${cy - 4} v8`, fill: 'none', stroke: '#B8A5C6', strokeWidth: .8, opacity: .65 },
    );
  }
  return {
    viewBox: '0 0 360 230',
    gradients: [
      { id: `${prefix}-edge`, x2: '80%', y2: '100%', stops: [[0, '#EBE4F0'], [.2, '#85758F'], [.5, '#D5CEDD'], [.75, '#4B3E58'], [1, '#A797B7']] },
      { id: `${prefix}-glass`, x2: '80%', y2: '100%', stops: [[0, '#3D3449'], [.33, '#1A1425'], [.7, '#0C0912'], [1, '#30223C']] },
      { id: `${prefix}-heat`, kind: 'radial', stops: [[0, '#25162C'], [.6, '#482235'], [.88, '#E69676'], [1, '#3D2437']] },
      { id: `${prefix}-reflection`, x2: '100%', y2: '100%', stops: [[0, '#E6D8F5'], [.7, '#776187'], [1, '#20172D']] },
    ],
    shapes: [
      { kind: 'ellipse', cx: 180, cy: 210, rx: 151, ry: 14, fill: '#06030C', opacity: .65 },
      { kind: 'path', d: 'M47 24 L313 24 Q322 24 324 33 L351 194 Q353 204 342 207 L23 207 Q11 204 13 194 L36 34 Q37 24 47 24 Z', fill: '#19121F', stroke: '#6B597D', strokeWidth: 1 },
      { kind: 'path', d: 'M47 18 H313 Q321 18 323 29 L350 185 Q352 197 339 199 H23 Q10 197 13 185 L36 29 Q38 18 47 18 Z', fill: `url(#${prefix}-edge)` },
      { kind: 'path', d: 'M49 23 H311 Q318 23 319 31 L345 184 Q347 191 338 193 H25 Q17 191 19 183 L41 31 Q42 23 49 23 Z', fill: `url(#${prefix}-glass)`, stroke: '#776486', strokeWidth: .7 },
      { kind: 'path', d: 'M50 26 H309 M43 34 L22 181', fill: 'none', stroke: '#E9E0F2', strokeWidth: .8, opacity: .5 },
      { kind: 'path', d: 'M50 28 H161 L104 163 H29 Z', fill: `url(#${prefix}-reflection)`, opacity: .09 },
      ...rings,
      { kind: 'path', d: 'M51 172 H310', fill: 'none', stroke: '#6F5A80', strokeWidth: .7, opacity: .6 },
      { kind: 'rect', x: 147, y: 177, width: 66, height: 8, rx: 4, fill: '#09060F', stroke: '#54415F', strokeWidth: .6 },
      { kind: 'rect', x: 150, y: 180, width: active ? Math.max(3, (heat ?? 0) * 6) : 3, height: 2, rx: 1, fill: signal, testId: 'cooktop-preview-indicator' },
      { kind: 'circle', cx: 129, cy: 181, r: 3, fill: on ? '#E1BEFA' : '#574662' },
      { kind: 'path', d: 'M240 180 h9 M244.5 176 v8 M113 181 h-9', fill: 'none', stroke: '#9681A8', strokeWidth: .8 },
      { kind: 'path', d: 'M26 203 H336', fill: 'none', stroke: '#BCABC9', strokeWidth: .6, opacity: .6 },
    ],
  };
}
