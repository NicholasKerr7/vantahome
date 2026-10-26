import { sculptedEnergyMaterials, type EnergyArtworkDrawing } from './energyArtworkGeometry';

/** A broad ceramic storage tower retains the saved charge even when its preview power is disabled. */
export function createSolarBatteryArtwork(prefix: string, charge: number | null, on: boolean): EnergyArtworkDrawing {
  const m = sculptedEnergyMaterials(prefix);
  const fillHeight = charge !== null && Number.isFinite(charge) ? Math.max(0, Math.min(100, charge)) * .57 : 0;
  return { viewBox: '0 0 260 200', gradients: m.gradients, shapes: [
    { kind: 'ellipse', cx: 132, cy: 187, rx: 84, ry: 10, fill: '#080510', opacity: .6 },
    { kind: 'ellipse', cx: 132, cy: 186, rx: 61, ry: 5, fill: '#080510', opacity: .65 },
    // A charcoal core sits behind a softly rounded, deliberately brighter front shell.
    { kind: 'rect', x: 73, y: 16, width: 128, height: 168, rx: 23, fill: m.graphite },
    { kind: 'rect', x: 66, y: 11, width: 128, height: 169, rx: 24, fill: m.edge },
    { kind: 'rect', x: 62, y: 9, width: 126, height: 168, rx: 23, fill: m.ceramic },
    { kind: 'path', d: 'M84 14 H162 Q181 14 182 34 V151 Q182 167 165 171 H84 Q67 170 67 151 V34 Q67 17 84 14 Z', fill: 'none', stroke: '#F5EBFF', strokeWidth: .75, opacity: .7 },
    { kind: 'path', d: 'M85 17 H106 Q81 79 86 164 H82 Q70 163 70 149 V36 Q70 20 85 17 Z', fill: '#FFFFFF', opacity: .22 },
    { kind: 'path', d: 'M161 17 Q180 19 180 35 V148 Q179 163 163 167 H150 Q169 113 161 17 Z', fill: '#5D4B71', opacity: .1 },
    // One black instrument spine combines the quiet power indicator and sampled charge.
    { kind: 'rect', x: 103, y: 30, width: 45, height: 130, rx: 21, fill: '#665373' },
    { kind: 'rect', x: 105, y: 32, width: 41, height: 126, rx: 19, fill: '#110B1A' },
    { kind: 'rect', x: 108, y: 35, width: 35, height: 119, rx: 16, fill: m.well },
    { kind: 'circle', cx: 125.5, cy: 56, r: 13, fill: '#17101F', stroke: '#A38AB8', strokeWidth: .8 },
    { kind: 'path', d: 'M125 47 L119 57 H125 L123 65 L132 53 H126 L129 47 Z', fill: on ? m.signal : '#766581' },
    { kind: 'rect', x: 115, y: 83, width: 21, height: 68, rx: 9, fill: '#090610', stroke: '#564260', strokeWidth: .7 },
    { kind: 'rect', testId: 'energy-battery-charge-fill', x: 119, y: 147 - fillHeight, width: 13, height: fillHeight, rx: 5, fill: m.signal, opacity: charge === null ? 0 : .95 },
    { kind: 'path', d: 'M117 102 H134 M117 117 H134 M117 132 H134', stroke: '#1A0F24', strokeWidth: 2 },
    { kind: 'path', d: 'M112 42 Q111 38 116 37 H124 Q115 67 115 77 L110 76 Z', fill: '#FFFFFF', opacity: .1 },
    // The side seam and small vents provide scale without competing with the main silhouette.
    { kind: 'path', d: 'M192 40 V147 Q192 171 181 176', fill: 'none', stroke: '#C9B1DC', strokeWidth: .8, opacity: .6 },
    { kind: 'path', d: 'M193 61 H197 M193 67 H197 M193 73 H197 M193 79 H197 M193 85 H197 M193 91 H197', stroke: '#0C0712', strokeWidth: 2 },
    { kind: 'path', d: 'M81 172 H166', stroke: '#B7A1CB', strokeWidth: 1, opacity: .7 },
    { kind: 'path', d: 'M82 180 H102 M151 180 H172', stroke: '#130D1C', strokeWidth: 5 },
  ] };
}
