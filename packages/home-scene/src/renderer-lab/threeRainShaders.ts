/** Camera-facing water quads, animated entirely on the GPU from surveyed anchors. */
export const WATER_VERTEX = /* glsl */ `
attribute vec3 aAnchor;
attribute vec4 aSeed;
uniform float uTime;
uniform float uIntensity;
uniform float uViewportHeight;
uniform vec2 uWind;
varying vec2 vWaterUv;
varying float vFade;

void main() {
  vec3 head = aAnchor;
  vec3 tail;
  float width;
  float fade = step(aSeed.z, uIntensity);
  #ifdef RAIN
    float speed = mix(7.0, 15.0, (uIntensity - 1.0) * 0.5);
    float age = fract(uTime * speed / 6.0 + aSeed.x);
    float height = 6.0 * (1.0 - age);
    float streakLength = mix(0.32, 1.05, (uIntensity - 1.0) * 0.5) * (0.75 + aSeed.y * 0.5);
    head += vec3(uWind.x * height, height + 0.018, uWind.y * height);
    tail = head + vec3(uWind.x * streakLength, streakLength, uWind.y * streakLength);
    width = 0.018 + aSeed.w * 0.009;
    fade *= smoothstep(0.0, 0.06, age) * (0.62 + aSeed.y * 0.38);
  #elif defined(SPLASH)
    float age = fract(uTime * (1.7 + uIntensity * 0.28) + aSeed.x);
    float life = min(age / 0.58, 1.0);
    float radius = life * (0.09 + aSeed.w * 0.13);
    head += vec3(sin(aSeed.y) * radius,
      0.03 + sin(life * 3.14159265) * (0.09 + aSeed.w * 0.16), cos(aSeed.y) * radius);
    tail = head + vec3(0.0, 0.045, 0.0);
    width = 0.015;
    fade *= (1.0 - smoothstep(0.35, 0.58, age)) * smoothstep(0.0, 0.04, age);
  #else
    float age = fract(uTime * (1.6 + aSeed.y * 0.7) + aSeed.x);
    head.y -= 0.26 + age * 0.72;
    tail = head + vec3(0.0, 0.16 + aSeed.y * 0.07, 0.0);
    width = 0.014;
    fade *= smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.82, 1.0, age));
  #endif
  vec4 viewHead = viewMatrix * modelMatrix * vec4(head, 1.0);
  vec4 viewTail = viewMatrix * modelMatrix * vec4(tail, 1.0);
  vec2 projected = viewTail.xy - viewHead.xy;
  vec2 side = vec2(-projected.y, projected.x) / max(length(projected), 0.0001);
  vec4 viewPoint = mix(viewHead, viewTail, uv.y);
  // Retain a soft one-pixel footprint at property scale instead of subpixel flicker.
  float pixelWidth = 0.52 * max(-viewPoint.z, 0.1) / (uViewportHeight * projectionMatrix[1][1]);
  viewPoint.xy += side * position.x * max(width, pixelWidth);
  gl_Position = projectionMatrix * viewPoint;
  vWaterUv = uv;
  vFade = fade;
}
`;

/** Soft normal-alpha streaks stay readable during storms without a bloom pass. */
export const WATER_FRAGMENT = /* glsl */ `
uniform float uNight;
varying vec2 vWaterUv;
varying float vFade;
void main() {
  float edge = 1.0 - smoothstep(0.12, 1.0, abs(vWaterUv.x * 2.0 - 1.0));
  float taper = smoothstep(0.0, 0.09, vWaterUv.y) * pow(1.0 - vWaterUv.y, 0.65);
  float alpha = edge * taper * vFade * mix(0.65, 0.86, uNight);
  if (alpha < 0.008) discard;
  gl_FragColor = vec4(mix(vec3(0.56, 0.73, 0.83), vec3(0.66, 0.82, 0.94), uNight), alpha);
  #include <colorspace_fragment>
}
`;

/** Use the exact pavement triangles as the ripple mask, including narrow path edges. */
export const WET_VERTEX = /* glsl */ `
varying vec3 vSurface;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vSurface = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/** Two staggered ripple fields and a restrained view-angle sheen, with no screen-space pass. */
export const WET_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uNight;
uniform float uMotion;
varying vec3 vSurface;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ripple(vec2 position, float offset) {
  vec2 grid = position / 2.3 + offset;
  vec2 cell = floor(grid);
  float seed = hash(cell);
  vec2 center = 0.28 + 0.44 * vec2(seed, hash(cell + 9.7));
  float age = fract(uTime * (0.7 + uIntensity * 0.24) + seed);
  float distance = length((fract(grid) - center) * 2.3);
  float radius = mix(0.025, 0.37, age);
  float antialias = max(fwidth(distance) * 0.5, 0.006);
  float ring = 1.0 - smoothstep(0.009, 0.009 + antialias, abs(distance - radius));
  // Preserve thin-ring coverage at distance; widening it would create bright discs.
  ring *= 0.012 / max(0.012, antialias);
  return ring * (1.0 - age) * smoothstep(0.0, 0.07, age) * step(seed, uIntensity * 0.25);
}

void main() {
  vec3 viewDirection = normalize(cameraPosition - vSurface);
  float grazing = pow(1.0 - abs(viewDirection.y), 3.0);
  float rings = (ripple(vSurface.xz, 0.0) + ripple(vSurface.xz, 5.37)) * uMotion;
  float wetness = uIntensity / 3.0;
  vec3 coat = mix(vec3(0.16, 0.23, 0.29), vec3(0.055, 0.095, 0.15), uNight);
  vec3 color = mix(coat, vec3(0.59, 0.77, 0.88), min(rings * 0.6 + grazing * 0.18, 0.6));
  float alpha = wetness * (0.12 + grazing * 0.10 + rings * 0.18);
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}
`;
