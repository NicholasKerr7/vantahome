import { Color, MathUtils } from 'three';
import type { DeviceState } from '../state';

/** Start a restored TV at its saved power state, including a paused first frame. */
export function createTelevisionUniforms(on: boolean) {
  return {
    time: { value: 0 },
    power: { value: on ? 1 : 0 },
    warm: { value: new Color('#e2b889') },
    cool: { value: new Color('#446d61') },
  };
}

/** Fade power independently of volume/legacy level; reduced motion also freezes the picture. */
export function advanceTelevisionDisplay(
  uniforms: ReturnType<typeof createTelevisionUniforms>,
  state: DeviceState,
  delta: number,
  reducedMotion: boolean,
  canAnimate: boolean,
) {
  const dt = Math.min(Math.max(delta, 0), 0.08);
  if (canAnimate && !reducedMotion && state.on) uniforms.time.value += dt * 0.23;
  const target = state.on ? 1 : 0;
  uniforms.power.value = reducedMotion ? target : MathUtils.damp(uniforms.power.value, target, 6, dt);
}
