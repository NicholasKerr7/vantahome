import type { EnergyArtworkDrawing, EnergyArtworkGradient, EnergyArtworkShape } from './energyArtworkGeometry';

/** Render the shared, local-only geometry with ordinary SVG attributes, never raw markup. */
function EquipmentShape({ shape }: { shape: EnergyArtworkShape }) {
  switch (shape.kind) {
    case 'path': { const { kind: _, ...props } = shape; return <path {...props} />; }
    case 'circle': { const { kind: _, ...props } = shape; return <circle {...props} />; }
    case 'ellipse': { const { kind: _, ...props } = shape; return <ellipse {...props} />; }
    case 'rect': { const { kind: _, testId, ...props } = shape; return <rect {...props} data-testid={testId} />; }
  }
}

/** Use gradient paint servers for depth, with no blur filters or raster surfaces. */
function EquipmentGradient({ gradient }: { gradient: EnergyArtworkGradient }) {
  const stops = gradient.stops.map(([offset, color]) => <stop key={offset} offset={offset} stopColor={color} />);
  return gradient.kind === 'radial'
    ? <radialGradient id={gradient.id} cx={gradient.cx ?? '50%'} cy={gradient.cy ?? '50%'} r={gradient.r ?? '50%'}>{stops}</radialGradient>
    : <linearGradient id={gradient.id} x1={gradient.x1 ?? '0%'} y1={gradient.y1 ?? '0%'} x2={gradient.x2 ?? '100%'} y2={gradient.y2 ?? '100%'}>{stops}</linearGradient>;
}

/** Shared geometry makes native and embedded consoles use exactly the same equipment artwork. */
export function EnergyEquipmentSvg({ drawing }: { drawing: EnergyArtworkDrawing }) {
  return <g>
    <defs>{drawing.gradients.map((gradient) => <EquipmentGradient key={gradient.id} gradient={gradient} />)}</defs>
    {drawing.shapes.map((shape, index) => <EquipmentShape key={index} shape={shape} />)}
  </g>;
}
