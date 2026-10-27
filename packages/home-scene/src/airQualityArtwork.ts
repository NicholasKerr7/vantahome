import type { EquipmentArtworkDrawing, EquipmentArtworkShape } from './equipmentArtworkGeometry';
import type { AirQualityControllerState } from './airQualityController';

/** Render a ceramic room sensor; the indicator reflects saved-limit comparison, never a medical air-quality grade. */
export function createAirQualityEquipmentArtwork(prefix: string, tone: AirQualityControllerState['tone']): EquipmentArtworkDrawing {
  const indicator = tone === 'exceeded' ? '#F2BE83' : tone === 'within' ? '#C3A0F5' : '#8C839B';
  const shapes: EquipmentArtworkShape[] = [
    { kind: 'ellipse', cx: 140, cy: 212, rx: 91, ry: 7, fill: '#05030B', opacity: .6 },
    { kind: 'rect', x: 48, y: 21, width: 186, height: 185, rx: 34, fill: '#241A32', stroke: '#917CA4', strokeWidth: 1.3 },
    { kind: 'rect', x: 46, y: 15, width: 186, height: 185, rx: 34, fill: `url(#${prefix}-edge)`, stroke: '#F0E8F7', strokeWidth: .6 },
    { kind: 'rect', x: 50, y: 18, width: 177, height: 177, rx: 31, fill: `url(#${prefix}-ceramic)` },
    { kind: 'path', d: 'M57 56 V48 Q58 25 82 25 H185', fill: 'none', stroke: '#FFFAFF', strokeWidth: 1.3, opacity: .8 },
    { kind: 'path', d: 'M220 62 V162 Q218 187 194 188 H99', fill: 'none', stroke: '#675770', strokeWidth: 1.2, opacity: .5 },
    { kind: 'circle', cx: 140, cy: 96, r: 64, fill: '#74617F' },
    { kind: 'circle', cx: 140, cy: 95, r: 62, fill: `url(#${prefix}-rim)`, stroke: '#FAF4FF', strokeWidth: .7 },
    { kind: 'circle', cx: 140, cy: 96, r: 57, fill: '#110C1C', stroke: '#57415E', strokeWidth: 1.3 },
    { kind: 'circle', cx: 140, cy: 96, r: 54, fill: `url(#${prefix}-glass)` },
    { kind: 'path', d: 'M93 69 A54 54 0 0 1 178 59', fill: 'none', stroke: '#EBDAF8', strokeWidth: .7, opacity: .22 },
    // Two short perimeter traces keep the display legible without a decorative full-screen glow.
    { kind: 'path', d: 'M89 80 A54 54 0 0 1 114 49 M166 143 A54 54 0 0 0 191 112', fill: 'none', stroke: indicator, strokeWidth: 1.5, opacity: .8 },
    { kind: 'rect', x: 118, y: 181, width: 44, height: 4, rx: 2, fill: '#4D3C60' },
    { kind: 'rect', x: 125, y: 182, width: 30, height: 1.5, rx: .75, fill: indicator },
  ];
  // Recessed acoustic-style perforations give the monitor a tangible sensor enclosure.
  for (const y of [164, 170]) for (let x = 83; x <= 197; x += 9.5) {
    shapes.push({ kind: 'circle', cx: x, cy: y, r: 1.5, fill: '#74647F', opacity: .75 },
      { kind: 'circle', cx: x, cy: y - .3, r: .8, fill: '#382B47' });
  }
  return { viewBox: '0 0 280 220', gradients: [
    { id: `${prefix}-edge`, x2: '100%', y2: '30%', stops: [[0, '#F4EDF9'], [.24, '#CABED9'], [.53, '#80718F'], [.78, '#DFD2E8'], [1, '#8C789F']] },
    { id: `${prefix}-ceramic`, x2: '80%', y2: '100%', stops: [[0, '#EDE5F5'], [.3, '#CDBEDB'], [.68, '#A895BA'], [1, '#D2C3E0']] },
    { id: `${prefix}-rim`, x2: '90%', y2: '100%', stops: [[0, '#FFFAFF'], [.2, '#CCB6E2'], [.47, '#5B426C'], [.72, '#D2B9E5'], [1, '#5E486F']] },
    { id: `${prefix}-glass`, kind: 'radial', cx: '30%', cy: '15%', r: '90%', stops: [[0, '#45334F'], [.48, '#201429'], [1, '#0B0713']] },
  ], shapes };
}
