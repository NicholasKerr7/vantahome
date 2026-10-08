import { describe, expect, it } from 'vitest';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from '../sceneAccess';
import { canPresentCinematic, presentationGateLevel } from './cinematicPresentation';

describe('cinematic rendering authority', () => {
  it('requires property authority even when a caller requests the tour', () => {
    const assignedRoom = { ...EMPTY_SCENE_ACCESS, roomIds: ['living'], deviceIds: ['living-light'] };
    expect(canPresentCinematic(true, assignedRoom, false, false)).toBe(false);
    expect(canPresentCinematic(true, { ...assignedRoom, interiorLayout: true }, false, false)).toBe(false);
    expect(canPresentCinematic(true, { ...assignedRoom, propertyOverview: true }, false, false)).toBe(true);
    expect(canPresentCinematic(true, FULL_SCENE_ACCESS, false, false)).toBe(true);
    expect(canPresentCinematic(true, EMPTY_SCENE_ACCESS, false, false)).toBe(false);
  });

  it('rejects reduced motion, covered scenes and withdrawn playback immediately', () => {
    expect(canPresentCinematic(true, FULL_SCENE_ACCESS, true, false)).toBe(false);
    expect(canPresentCinematic(true, FULL_SCENE_ACCESS, false, true)).toBe(false);
    expect(canPresentCinematic(false, FULL_SCENE_ACCESS, false, false)).toBe(false);
  });

  it('keeps cinematic gate motion separate and returns to the authoritative position on interruption', () => {
    const device = Object.freeze({ on: false, level: 0 });
    expect(presentationGateLevel(true, true, 100, device.level)).toBe(100);
    expect(device).toEqual({ on: false, level: 0 });
    expect(presentationGateLevel(false, true, 100, device.level)).toBe(0);
    expect(presentationGateLevel(true, false, 100, 42)).toBe(42);
    expect(presentationGateLevel(true, true, Infinity, 42)).toBe(0);
    expect(presentationGateLevel(true, true, 150, 42)).toBe(100);
  });
});
