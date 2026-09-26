import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { ROOMS, getRoom } from '../data';
import { getOverviewDistanceScale } from './overviewFraming';

describe('fixed dashboard floor framing', () => {
  it.each([[364, 450], [562, 506], [796, 786], [294, 177], [594, 429]])(
    'keeps both floors inside the view at %sx%s',
    (width, height) => {
      for (const floor of ['ground', 'upper'] as const) {
        const room = getRoom(floor === 'ground' ? 'living' : 'family');
        const centerX = 8.2 + (room.center[0] - 8.2) * 0.17;
        const centerZ = -8 + (room.center[1] + 8) * 0.17;
        const scale = getOverviewDistanceScale(width, height);
        const camera = new PerspectiveCamera(42, width / height, 0.08, 500);
        camera.position.set(centerX + 10.5 * scale, 16 * scale, centerZ + 13.3 * scale);
        camera.lookAt(centerX, -1.8, centerZ);
        camera.updateMatrixWorld();
        for (const item of ROOMS.filter((candidate) => candidate.floor === floor && !candidate.outdoor && candidate.bounds)) {
          const [x1, x2, z1, z2] = item.bounds!;
          for (const [x, z] of [[x1, z1], [x1, z2], [x2, z1], [x2, z2]]) {
            for (const y of [0, 2.7]) {
              const projected = new Vector3(x, y, z).project(camera);
              expect(Math.abs(projected.x), `${item.name} horizontal framing`).toBeLessThan(1);
              expect(Math.abs(projected.y), `${item.name} vertical framing`).toBeLessThan(1);
            }
          }
        }
      }
    },
  );
});
