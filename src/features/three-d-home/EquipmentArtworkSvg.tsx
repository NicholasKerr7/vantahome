import React from 'react';
import { Circle, Defs, Ellipse, G, LinearGradient, RadialGradient, Path, Rect, Stop } from 'react-native-svg';
import type { EquipmentArtworkDrawing, EquipmentArtworkGradient, EquipmentArtworkShape } from '../../../packages/home-scene/src/equipmentArtworkGeometry';

/** Native adapter for the small, typed SVG vocabulary; no image decoding or WebGL context. */
function EquipmentShape({ shape }: { shape: EquipmentArtworkShape }) {
  switch (shape.kind) {
    case 'path': { const { kind: _, ...props } = shape; return <Path {...props} />; }
    case 'circle': { const { kind: _, ...props } = shape; return <Circle {...props} />; }
    case 'ellipse': { const { kind: _, ...props } = shape; return <Ellipse {...props} />; }
    case 'rect': { const { kind: _, testId, ...props } = shape; return <Rect {...props} testID={testId} />; }
  }
}

/** Use gradient paint servers for depth, with no blur filters or raster surfaces. */
function EquipmentGradient({ gradient }: { gradient: EquipmentArtworkGradient }) {
  const stops = gradient.stops.map(([offset, color]) => <Stop key={offset} offset={offset} stopColor={color} />);
  return gradient.kind === 'radial'
    ? <RadialGradient id={gradient.id} cx={gradient.cx ?? '50%'} cy={gradient.cy ?? '50%'} r={gradient.r ?? '50%'}>{stops}</RadialGradient>
    : <LinearGradient id={gradient.id} x1={gradient.x1 ?? '0%'} y1={gradient.y1 ?? '0%'} x2={gradient.x2 ?? '100%'} y2={gradient.y2 ?? '100%'}>{stops}</LinearGradient>;
}

/** Match embedded-controller materials using instance-scoped paint servers. */
export function EquipmentArtworkSvg({ drawing }: { drawing: EquipmentArtworkDrawing }) {
  return <G>
    <Defs>{drawing.gradients.map((gradient) => <EquipmentGradient key={gradient.id} gradient={gradient} />)}</Defs>
    {drawing.shapes.map((shape, index) => <EquipmentShape key={index} shape={shape} />)}
  </G>;
}
