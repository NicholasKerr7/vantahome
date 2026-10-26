import type { EnergyArtworkDrawing, EnergyArtworkShape } from './energyArtworkGeometry';

/** Render the shared, local-only geometry with ordinary SVG attributes, never raw markup. */
function EquipmentShape({ shape }: { shape: EnergyArtworkShape }) {
  switch (shape.kind) {
    case 'path': { const { kind: _, ...props } = shape; return <path {...props} />; }
    case 'circle': { const { kind: _, ...props } = shape; return <circle {...props} />; }
    case 'ellipse': { const { kind: _, ...props } = shape; return <ellipse {...props} />; }
    case 'rect': { const { kind: _, testId, ...props } = shape; return <rect {...props} data-testid={testId} />; }
  }
}

/** Shared geometry makes native and embedded consoles use exactly the same equipment artwork. */
export function EnergyEquipmentSvg({ drawing }: { drawing: EnergyArtworkDrawing }) {
  return <g>
    <defs>{drawing.gradients.map((gradient) => <linearGradient key={gradient.id} id={gradient.id} x1="0%" y1="0%" x2="100%" y2="100%">
      {gradient.stops.map(([offset, color]) => <stop key={offset} offset={offset} stopColor={color} />)}
    </linearGradient>)}</defs>
    {drawing.shapes.map((shape, index) => <EquipmentShape key={index} shape={shape} />)}
  </g>;
}
