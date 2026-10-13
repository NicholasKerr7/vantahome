import { describe, expect, it } from 'vitest';
import { advanceTelevisionDisplay, createTelevisionUniforms } from './televisionDisplay';
import { runDeviceActionState, toggleDeviceState } from '../deviceControlActions';

describe('television screen power', () => {
  it.each([0, 35, 100])('shows a fully powered picture even with saved legacy level %s and muted audio', (level) => {
    const uniforms = createTelevisionUniforms(false);
    advanceTelevisionDisplay(uniforms, { on: true, level, settings: { volume: 0, muted: true } }, 1 / 60, true, false);
    expect(uniforms.power.value).toBe(1);
  });

  it('restores power immediately before the first frame and turns off independently of volume', () => {
    const uniforms = createTelevisionUniforms(true);
    expect(uniforms.power.value).toBe(1);
    advanceTelevisionDisplay(uniforms, { on: false, level: 100, settings: { volume: 100 } }, 1 / 60, true, false);
    expect(uniforms.power.value).toBe(0);
    expect(uniforms.time.value).toBe(0);
  });

  it('animates a smooth power transition, bounds resumed frames and freezes artwork with reduced motion', () => {
    const uniforms = createTelevisionUniforms(false);
    const state = { on: true, level: 35, settings: { playbackState: 'playing' } };
    advanceTelevisionDisplay(uniforms, state, 20, false, true);
    expect(uniforms.power.value).toBeGreaterThan(0);
    expect(uniforms.power.value).toBeLessThan(1);
    expect(uniforms.time.value).toBeCloseTo(0.08 * 0.23);
    for (let frame = 0; frame < 120; frame++) advanceTelevisionDisplay(uniforms, state, 1 / 60, false, true);
    expect(uniforms.power.value).toBeCloseTo(1, 4);
    const time = uniforms.time.value;
    advanceTelevisionDisplay(uniforms, state, 1 / 60, true, true);
    advanceTelevisionDisplay(uniforms, state, 1 / 60, false, false);
    expect(uniforms.time.value).toBe(time);
  });

  it('freezes a paused or stopped picture, resumes from that frame, and preserves the powered screen', () => {
    const uniforms = createTelevisionUniforms(true);
    let state = runDeviceActionState('family-tv', { on: true, level: 35 }, 'tv-play-pause');
    advanceTelevisionDisplay(uniforms, state, 1 / 60, false, true);
    const playingTime = uniforms.time.value;
    expect(playingTime).toBeGreaterThan(0);
    state = runDeviceActionState('family-tv', state, 'tv-play-pause');
    for (let frame = 0; frame < 60; frame++) advanceTelevisionDisplay(uniforms, state, 1 / 60, false, true);
    expect(uniforms.time.value).toBe(playingTime);
    expect(uniforms.power.value).toBe(1);
    state = runDeviceActionState('family-tv', state, 'tv-play-pause');
    advanceTelevisionDisplay(uniforms, state, 1 / 60, false, true);
    expect(uniforms.time.value).toBeGreaterThan(playingTime);
    const resumedTime = uniforms.time.value;
    advanceTelevisionDisplay(uniforms, toggleDeviceState('family-tv', state), 1 / 60, false, true);
    advanceTelevisionDisplay(uniforms, { on: true, level: 35, settings: { playbackState: 'stopped' } }, 1 / 60, false, true);
    expect(uniforms.time.value).toBe(resumedTime);
  });
});
