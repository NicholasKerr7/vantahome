import { describe, expect, it } from 'vitest';
import { INITIAL_STATE, parseLabState } from './contracts';

describe('renderer comparison host boundary', () => {
  it('accepts complete simulation settings and strips unrelated command fields', () => {
    const value = { ...INITIAL_STATE, view: 'property', gate: 100, blinds: 35, command: 'unlock' };
    expect(parseLabState(value)).toEqual({ ...INITIAL_STATE, view: 'property', gate: 100, blinds: 35 });
  });

  it('rejects non-finite transforms and malformed settings without partially applying them', () => {
    for (const value of [null, [], {}, { ...INITIAL_STATE, gate: NaN }, { ...INITIAL_STATE, blinds: Infinity },
      { ...INITIAL_STATE, gate: -1 }, { ...INITIAL_STATE, blinds: 101 }, { ...INITIAL_STATE, lights: 'true' },
      { ...INITIAL_STATE, view: 'garage' }, { ...INITIAL_STATE, resetKey: 0.5 }]) {
      expect(parseLabState(value)).toBeNull();
    }
  });
});
