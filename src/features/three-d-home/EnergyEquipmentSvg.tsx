import React from 'react';
import { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { EnergyArtworkDrawing, EnergyArtworkShape } from '../../../packages/home-scene/src/energyArtworkGeometry';

/** Native adapter for the small, typed SVG vocabulary; no image decoding or WebGL context. */
function EquipmentShape({ shape }: { shape: EnergyArtworkShape }) {
  switch (shape.kind) {
    case 'path': { const { kind: _, ...props } = shape; return <Path {...props} />; }
    case 'circle': { const { kind: _, ...props } = shape; return <Circle {...props} />; }
    case 'ellipse': { const { kind: _, ...props } = shape; return <Ellipse {...props} />; }
    case 'rect': { const { kind: _, testId, ...props } = shape; return <Rect {...props} testID={testId} />; }
  }
}

/** Match embedded-controller materials using instance-scoped paint servers. */
export function EnergyEquipmentSvg({ drawing }: { drawing: EnergyArtworkDrawing }) {
  return <G>
    <Defs>{drawing.gradients.map((gradient) => <LinearGradient key={gradient.id} id={gradient.id} x1="0%" y1="0%" x2="100%" y2="100%">
      {gradient.stops.map(([offset, color]) => <Stop key={offset} offset={offset} stopColor={color} />)}
    </LinearGradient>)}</Defs>
    {drawing.shapes.map((shape, index) => <EquipmentShape key={index} shape={shape} />)}
  </G>;
}
