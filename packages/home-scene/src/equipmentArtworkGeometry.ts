/** A deliberately small SVG vocabulary shared by browser and native equipment illustrations. */
interface Surface {
  fill?: string; stroke?: string; strokeWidth?: number; opacity?: number;
}
export type EquipmentArtworkShape = Surface & (
  | { kind: 'path'; d: string }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx?: number; testId?: string }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
);
export interface EquipmentArtworkGradient {
  id: string;
  kind?: 'linear' | 'radial';
  x1?: string; y1?: string; x2?: string; y2?: string;
  cx?: string; cy?: string; r?: string;
  stops: readonly (readonly [number, string])[];
}
export interface EquipmentArtworkDrawing {
  viewBox: string;
  gradients: readonly EquipmentArtworkGradient[];
  shapes: readonly EquipmentArtworkShape[];
}
