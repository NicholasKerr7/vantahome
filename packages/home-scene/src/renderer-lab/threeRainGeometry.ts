import {
  Box3, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry,
  Sphere, Vector3,
} from 'three';
import surfaces from './weather-surfaces.json';

export type RainGeometryKind = 'rain' | 'splash' | 'runoff';

/** Produce a stable, exactly representable float32 fraction without mutable random state. */
function particleHash(index: number, channel: number): number {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  value ^= value >>> 16;
  return (value & 0x00ffffff) / 0x01000000;
}

/**
 * Build one fixed instanced quad pool using surveyed contact points, without spatial jitter.
 * aSeed stores phase, size (or splash arm angle in radians), intensity tier, and variation.
 * Splash arms share a phase and height variation so they form one coherent impact burst.
 */
export function createRainGeometry(kind: RainGeometryKind): InstancedBufferGeometry {
  const points = kind === 'rain' ? surfaces.landingPoints
    : kind === 'splash' ? surfaces.splashPoints : surfaces.runoffPoints;
  const copies = kind === 'rain' ? 2 : kind === 'splash' ? 3 : 1;
  const count = points.length * copies;
  const anchors = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const hashOffset = kind === 'rain' ? 0 : kind === 'splash' ? 5000 : 10000;

  for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
    const point = points[pointIndex];
    for (let copy = 0; copy < copies; copy++) {
      const instance = pointIndex * copies + copy;
      const hashIndex = hashOffset + (kind === 'splash' ? pointIndex : instance);
      anchors.set(point.position, instance * 3);
      seeds[instance * 4] = particleHash(hashIndex, 0);
      seeds[instance * 4 + 1] = kind === 'splash'
        ? copy * Math.PI * 2 / 3 + particleHash(hashIndex, 1) * Math.PI * 2
        : particleHash(hashIndex, 1);
      seeds[instance * 4 + 2] = kind === 'rain' ? point.phase % 3 + 1
        : kind === 'splash' ? (point.phase < 2 ? 1 : 2) : 2;
      seeds[instance * 4 + 3] = particleHash(hashIndex, 2);
    }
  }

  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  const anchorAttribute = new InstancedBufferAttribute(anchors, 3);
  geometry.setAttribute('aAnchor', anchorAttribute);
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = count;
  // Shader motion is invisible to Three's default bounds calculation. Cover the
  // surveyed lot plus wind/splash width and the six-metre fall volume with headroom.
  geometry.boundingBox = new Box3().setFromBufferAttribute(anchorAttribute).expandByVector(new Vector3(2, 10, 2));
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new Sphere());
  return geometry;
}
