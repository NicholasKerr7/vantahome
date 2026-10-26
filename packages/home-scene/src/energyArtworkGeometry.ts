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
  kind?: 'linear' | 'radial';
  x1?: string; y1?: string; x2?: string; y2?: string;
  cx?: string; cy?: string; r?: string;
  stops: readonly (readonly [number, string])[];
}
export interface EnergyArtworkDrawing {
  viewBox: string;
  gradients: readonly EnergyArtworkGradient[];
  shapes: readonly EnergyArtworkShape[];
}

/** Broad highlights and recessed radial glass give the equipment the same material depth as the appliance consoles. */
export function sculptedEnergyMaterials(prefix: string) {
  const gradients: EnergyArtworkGradient[] = [
    { id: `${prefix}-ceramic`, x2: '100%', y2: '25%', stops: [[0, '#F1EAF9'], [.22, '#C7BBD8'], [.53, '#9485AA'], [.82, '#DBCFEB'], [1, '#79658F']] },
    { id: `${prefix}-graphite`, stops: [[0, '#766687'], [.3, '#382E46'], [.68, '#1B1526'], [1, '#4D3B60']] },
    { id: `${prefix}-edge`, x2: '80%', stops: [[0, '#FAF1FF'], [.19, '#CAB4DC'], [.43, '#584267'], [.64, '#9B7CAC'], [.85, '#EBD1FB'], [1, '#665173']] },
    { id: `${prefix}-well`, kind: 'radial', cx: '36%', cy: '25%', r: '80%', stops: [[0, '#806099'], [.4, '#3A244C'], [.78, '#140D20'], [1, '#090610']] },
    { id: `${prefix}-cells`, stops: [[0, '#52628D'], [.28, '#25365C'], [.7, '#0E1730'], [1, '#344569']] },
    { id: `${prefix}-signal`, x2: '90%', y2: '100%', stops: [[0, '#F9E9FF'], [.35, '#E4B9FF'], [.7, '#B373F3'], [1, '#7144AF']] },
  ];
  return { gradients, ceramic: `url(#${prefix}-ceramic)`, graphite: `url(#${prefix}-graphite)`,
    edge: `url(#${prefix}-edge)`, well: `url(#${prefix}-well)`, cells: `url(#${prefix}-cells)`, signal: `url(#${prefix}-signal)` };
}
