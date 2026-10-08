import { describe, expect, it } from 'vitest';
import { canPlayCinematic } from './cinematicMotion';

describe('cinematic motion eligibility', () => {
  it('allows active motion and blocks reduced motion, hidden, or suspended scenes', () => {
    expect(canPlayCinematic(false, false, false)).toBe(true);
    expect(canPlayCinematic(true, false, false)).toBe(false);
    expect(canPlayCinematic(false, true, false)).toBe(false);
    expect(canPlayCinematic(false, false, true)).toBe(false);
  });
});
