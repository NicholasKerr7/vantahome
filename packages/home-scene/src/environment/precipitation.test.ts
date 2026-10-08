import { describe, expect, it } from 'vitest';
import { precipitationRatePerHour } from './precipitation';

describe('precipitation intensity', () => {
  it('normalizes accumulation windows without amplifying an already hourly amount', () => {
    expect(precipitationRatePerHour(0.5, 900)).toBe(2);
    expect(precipitationRatePerHour(1, 1800)).toBe(2);
    expect(precipitationRatePerHour(2, 3600)).toBe(2);
    expect(precipitationRatePerHour(0.02, 900)).toBe(0.08);
  });

  it('preserves snowfall centimeters instead of treating them as rainfall millimeters', () => {
    expect(precipitationRatePerHour(0.3, 900)).toBe(1.2);
    expect(precipitationRatePerHour(1.2, 3600)).toBe(1.2);
  });

  it('fails closed for dry amounts and malformed or overflowing inputs', () => {
    for (const amount of [0, -1, Number.NaN, Infinity, -Infinity]) {
      expect(precipitationRatePerHour(amount, 900)).toBe(0);
    }
    for (const interval of [0, -900, Number.NaN, Infinity, -Infinity]) {
      expect(precipitationRatePerHour(1, interval)).toBe(0);
    }
    expect(precipitationRatePerHour(Number.MAX_VALUE, 1)).toBe(0);
  });
});
