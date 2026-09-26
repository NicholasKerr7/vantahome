import { describe, expect, it } from 'vitest';
import { arrangeHotspots, type ScreenAnchor } from './arrangeHotspots';

const kitchen: ScreenAnchor[] = [
  { id: 'stove', x: 619, y: 417 },
  { id: 'window', x: 634.4, y: 426 },
  { id: 'dishwasher', x: 625.5, y: 392.5 },
  { id: 'coffee', x: 622.6, y: 321 },
  { id: 'light', x: 600.4, y: 320.2 },
  { id: 'microwave', x: 643.5, y: 337.7 },
];

// Measured camera projections from the failed 320×568 kitchen dashboard check.
const compactKitchen: ScreenAnchor[] = [
  { id: 'kitchen-fridge', x: 161.586, y: 61.797 },
  { id: 'kitchen-stove', x: 201.461, y: 97.492 },
  { id: 'kitchen-coffee', x: 203.173, y: 51.812 },
  { id: 'kitchen-microwave', x: 213.113, y: 59.792 },
  { id: 'kitchen-dishwasher', x: 205.135, y: 86.260 },
  { id: 'kitchen-light', x: 192.600, y: 51.440 },
  { id: 'dining-light', x: 96.726, y: 77.114 },
  { id: 'kitchen-window', x: 208.714, y: 101.900 },
  { id: 'kitchen-smoke', x: 198.146, y: 35.346 },
];

describe('dense room touch targets', () => {
  it('separates the measured tablet kitchen collisions by a full touch-target diameter', () => {
    const positions = Object.values(arrangeHotspots(kitchen, 780, 560));
    for (let i = 0; i < positions.length; i++)
      for (let j = i + 1; j < positions.length; j++) {
        expect(
          Math.hypot(
            positions[i][0] - positions[j][0],
            positions[i][1] - positions[j][1],
          ),
        ).toBeGreaterThanOrEqual(56);
      }
  });
  it('fits twelve coincident markers on a phone without reducing target size', () => {
    const input = Array.from({ length: 12 }, (_, index) => ({
      id: String(index),
      x: 310,
      y: 210,
    }));
    const values = Object.values(arrangeHotspots(input, 358, 430));
    for (const [x, y] of values) {
      expect(x).toBeGreaterThanOrEqual(32);
      expect(x).toBeLessThanOrEqual(326);
      expect(y).toBeGreaterThanOrEqual(74);
      expect(y).toBeLessThanOrEqual(348);
    }
    for (let i = 0; i < values.length; i++)
      for (let j = i + 1; j < values.length; j++)
        expect(
          Math.hypot(values[i][0] - values[j][0], values[i][1] - values[j][1]),
        ).toBeGreaterThanOrEqual(56);
  });
  it('keeps nine dense room controls separate in the shortest phone dashboard', () => {
    const input = Array.from({ length: 9 }, (_, id) => ({ id: String(id), x: 148, y: 90 }));
    const values = Object.values(arrangeHotspots(input, 294, 177));
    for (const [x, y] of values) {
      expect(x).toBeGreaterThanOrEqual(32);
      expect(x).toBeLessThanOrEqual(262);
      expect(y).toBeGreaterThanOrEqual(32);
      expect(y).toBeLessThanOrEqual(145);
    }
    for (let i = 0; i < values.length; i++)
      for (let j = i + 1; j < values.length; j++)
        expect(Math.hypot(values[i][0] - values[j][0], values[i][1] - values[j][1])).toBeGreaterThanOrEqual(56);
  });
  it('rearranges the measured phone kitchen when local placements exhaust free space', () => {
    const original = compactKitchen.map((anchor) => ({ ...anchor }));
    const positions = arrangeHotspots(compactKitchen, 294, 175);
    const values = Object.values(positions);
    expect(Object.keys(positions)).toEqual(compactKitchen.map((anchor) => anchor.id));
    for (const [x, y] of values) {
      expect(x).toBeGreaterThanOrEqual(32);
      expect(x).toBeLessThanOrEqual(262);
      expect(y).toBeGreaterThanOrEqual(32);
      expect(y).toBeLessThanOrEqual(143);
    }
    for (let i = 0; i < values.length; i++)
      for (let j = i + 1; j < values.length; j++)
        expect(Math.hypot(values[i][0] - values[j][0], values[i][1] - values[j][1])).toBeGreaterThanOrEqual(56);
    expect(arrangeHotspots(compactKitchen, 294, 175)).toEqual(positions);
    expect(compactKitchen).toEqual(original);
  });
  it('preserves the natural positions of controls that already fit', () => {
    const anchors = [
      { id: 'first', x: 40, y: 40 },
      { id: 'second', x: 120, y: 40 },
      { id: 'third', x: 200, y: 100 },
    ];
    expect(arrangeHotspots(anchors, 294, 175)).toEqual({ first: [40, 40], second: [120, 40], third: [200, 100] });
  });
  it('is deterministic and does not mutate physical projections across control updates', () => {
    const input = Object.freeze(
      kitchen.map((anchor) => Object.freeze({ ...anchor })),
    );
    const first = arrangeHotspots([...input], 780, 560);
    expect(arrangeHotspots([...input], 780, 560)).toEqual(first);
    expect(input[0]).toEqual({ id: 'stove', x: 619, y: 417 });
  });
});
