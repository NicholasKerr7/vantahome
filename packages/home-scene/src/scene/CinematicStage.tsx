import { useMemo } from 'react';
import { Color } from 'three';

// A single static shader gives the model a grounded studio setting without a postprocess pass.
const VERTEX_SHADER = `
varying vec2 stagePoint;
void main() {
  stagePoint = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT_SHADER = `
uniform float radius;
uniform vec3 baseColor;
uniform vec3 haloColor;
uniform vec3 detailColor;
varying vec2 stagePoint;

float ring(float distanceFromCenter, float ringRadius) {
  float distanceToRing = abs(distanceFromCenter - ringRadius);
  float width = max(fwidth(distanceFromCenter), 0.02);
  return 1.0 - smoothstep(0.0, width * 1.4, distanceToRing);
}

void main() {
  float distanceFromCenter = length(stagePoint);
  float halo = 1.0 - smoothstep(radius * 0.35, radius * 2.6, distanceFromCenter);
  vec3 color = mix(baseColor, haloColor, halo * 0.76);

  float gridSize = radius / 7.0;
  vec2 gridDistance = abs(mod(stagePoint + gridSize * 0.5, gridSize) - gridSize * 0.5);
  vec2 gridWidth = max(fwidth(stagePoint), vec2(0.025));
  vec2 gridLines = 1.0 - smoothstep(vec2(0.0), gridWidth, gridDistance);
  float grid = max(gridLines.x, gridLines.y);
  float gridFade = (1.0 - smoothstep(radius * 0.7, radius * 1.8, distanceFromCenter)) * 0.018;
  color = mix(color, detailColor, grid * gridFade);

  float innerRing = ring(distanceFromCenter, radius);
  float outerRing = ring(distanceFromCenter, radius * 1.17);
  float farRing = ring(distanceFromCenter, radius * 1.52);
  color = mix(color, detailColor, innerRing * 0.12 + outerRing * 0.055 + farRing * 0.028);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Frame the house with the v1 violet survey grid and soft lavender contour rings. */
export function CinematicStage({ exterior }: { exterior: boolean }) {
  const uniforms = useMemo(() => ({
    radius: { value: exterior ? 35 : 14 },
    baseColor: { value: new Color('#110530') },
    haloColor: { value: new Color('#2B0A73') },
    detailColor: { value: new Color('#B46BFF') },
  }), [exterior]);

  return (
    <mesh position={[exterior ? 10 : 8.2, -1.04, -8]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[600, 600]} />
      {/* Preserve the brand violet instead of shifting it through the house's filmic exposure. */}
      <shaderMaterial vertexShader={VERTEX_SHADER} fragmentShader={FRAGMENT_SHADER} uniforms={uniforms} toneMapped={false} />
    </mesh>
  );
}
