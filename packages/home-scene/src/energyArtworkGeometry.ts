/** A deliberately small SVG vocabulary shared by browser and native equipment illustrations. */
interface Surface {
  fill?: string; stroke?: string; strokeWidth?: number; opacity?: number;
}
export type EnergyArtworkShape = Surface & (
  | { kind: 'path'; d: string }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx?: number; testId?: string }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
);
export interface EnergyArtworkGradient {
  id: string;
  stops: readonly (readonly [number, string])[];
}
export interface EnergyArtworkDrawing {
  gradients: readonly EnergyArtworkGradient[];
  shapes: readonly EnergyArtworkShape[];
}

/** Prefix material IDs per mounted console so several previews never share paint servers. */
export function energyArtworkMaterials(prefix: string) {
  const gradients: EnergyArtworkGradient[] = [
    { id: `${prefix}-titanium`, stops: [[0, '#F0E7FF'], [.22, '#8B839E'], [.48, '#3B344B'], [.8, '#71677D'], [1, '#282033']] },
    { id: `${prefix}-shell`, stops: [[0, '#615A73'], [.3, '#2B2639'], [1, '#100D1C']] },
    { id: `${prefix}-glass`, stops: [[0, '#605694'], [.36, '#29264C'], [.7, '#11152D'], [1, '#393258']] },
    { id: `${prefix}-violet`, stops: [[0, '#F0DFFF'], [.4, '#C39AFF'], [1, '#7656B4']] },
  ];
  return { gradients, metal: `url(#${prefix}-titanium)`, shell: `url(#${prefix}-shell)`, glass: `url(#${prefix}-glass)`, violet: `url(#${prefix}-violet)` };
}

/** Equipment rests on a quiet architectural plinth, without suggesting measured energy flow. */
export const ENERGY_ARTWORK_PLINTH: readonly EnergyArtworkShape[] = [
  { kind: 'ellipse', cx: 120, cy: 141, rx: 103, ry: 12, fill: '#090713', opacity: .7 },
  { kind: 'path', d: 'M18 126 L144 100 L226 128 L226 132 L101 158 L18 130 Z', fill: '#151020', stroke: '#43364F', strokeWidth: .7 },
  { kind: 'path', d: 'M18 126 L143 101 L226 128 L101 154 Z', fill: '#241D31', stroke: '#615075', strokeWidth: .6 },
  { kind: 'path', d: 'M25 128 L101 150 L217 127', fill: 'none', stroke: '#B798DD', strokeWidth: .7, opacity: .4 },
];
