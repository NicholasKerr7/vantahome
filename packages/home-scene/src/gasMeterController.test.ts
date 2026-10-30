import { expect, it } from 'vitest';
import { canSampleGas, formatGasSample, gasMeterStatus, getGasMeterSnapshot } from './gasMeterController';
import type { DeviceState } from './simulationTypes';
import { createGasMeterArtwork } from './gasMeterArtwork';

const initial: DeviceState = { on: true, level: 0 };
it('uses reproducible defaults and derives supply, budget and closed flow from source quantities', () => {
  expect(getGasMeterSnapshot(initial)).toMatchObject({ remainingKg: 8.75, remainingPercent: 70, valveOpen: true, interlocked: false });
  const meter = getGasMeterSnapshot({ ...initial, settings: { gasRemainingKg: 2.5, gasMonthKg: 25, gasFlowKgH: 1, gasValveOpen: false, gasRemainingPercent: 99 } });
  expect(meter).toMatchObject({ remainingPercent: 20, refillDue: true, budgetExceeded: true, flowKgH: 0 });
  expect(canSampleGas(meter)).toBe(false); expect(formatGasSample(null)).toBe('—');
});
it('never coerces malformed explicit values into plausible sample readings or valve states', () => {
  for (const value of ['8.75', true, -1, 13, NaN, Infinity, 1.234]) {
    const meter = getGasMeterSnapshot({ ...initial, settings: { gasRemainingKg: value } });
    expect(meter.remainingKg).toBeNull(); expect(meter.remainingPercent).toBeNull(); expect(meter.refillDue).toBeNull(); expect(canSampleGas(meter)).toBe(false);
  }
  const meter = getGasMeterSnapshot({ ...initial, settings: { gasValveOpen: 'false', gasLeakInterlock: 'false', gasTodayKg: '1' } });
  expect(meter).toMatchObject({ valveOpen: null, interlocked: null, todayKg: null, flowKgH: null });
  expect(gasMeterStatus(meter)).toBe('Preview valve status unavailable');
});
it('prioritizes interlocks over refill/budget and disabled alert preferences', () => {
  const meter = getGasMeterSnapshot({ ...initial, settings: { gasLeakInterlock: true, gasUsageAlerts: false, gasRefillAlerts: false, gasRemainingKg: 0, gasMonthKg: 30 } });
  expect(gasMeterStatus(meter)).toBe('Leak preview active · valve still open'); expect(canSampleGas(meter)).toBe(false);
  expect(gasMeterStatus({ ...meter, valveOpen: false })).toBe('Leak preview active · valve closed');
});
it('uses a visible nonzero-area lever for each accepted valve state and none for unknown state', () => {
  const meter = getGasMeterSnapshot(initial);
  for (const valveOpen of [true, false, null]) {
    const drawing = createGasMeterArtwork('test', { ...meter, valveOpen });
    const lever = drawing.shapes.find((shape) => shape.kind === 'rect' && shape.testId === 'gas-meter-valve-lever');
    expect(lever).toMatchObject({ kind: 'rect', width: valveOpen ? 8 : 50, height: valveOpen ? 50 : 8, opacity: valveOpen === null ? 0 : 1 });
    for (const shape of drawing.shapes) if (shape.kind === 'path' && shape.stroke) expect(shape.fill).toBeDefined();
  }
});
