import { expect, it } from 'vitest';
import { gasLeakStatus, gasLeakTestStatus, gasLeakTone, getGasLeakSnapshot } from './gasLeakController';
import { createGasLeakArtwork } from './gasLeakArtwork';
import type { DeviceState } from './simulationTypes';

const initial: DeviceState = { on: true, level: 0 };
it('uses reproducible defaults without calling the sample physical protection', () => {
  const detector = getGasLeakSnapshot(initial);
  expect(detector).toMatchObject({ leakDetected: false, concentration: 0, batteryPercent: 96, testCount: 0 });
  expect(gasLeakStatus(detector)).toBe('No leak in this sample'); expect(gasLeakTestStatus(detector)).toBe('Preview test not run');
});
it('never coerces malformed quantities or booleans into a clear state', () => {
  for (const value of ['0', true, -1, 101, NaN, Infinity, 1.5]) {
    const detector = getGasLeakSnapshot({ ...initial, settings: { gasConcentrationPercentLel: value } });
    expect(detector.concentration).toBeNull(); expect(gasLeakTone(detector)).toBe('unknown');
  }
  const detector = getGasLeakSnapshot({ ...initial, settings: { gasLeakDetected: 'false', gasTestCount: '0', gasTestResult: 'certified' } });
  expect(detector.leakDetected).toBeNull(); expect(gasLeakStatus(detector)).toBe('Leak sample unavailable'); expect(gasLeakTestStatus(detector)).toBe('Preview test unavailable');
});
it('keeps known alarms visible when silenced, tested, alerts disabled or concentration unavailable', () => {
  const detector = getGasLeakSnapshot({ ...initial, settings: { gasLeakDetected: true, gasAlarmSilenced: true, gasLeakAlerts: false, gasTestCount: 2, gasTestResult: 'passed', gasConcentrationPercentLel: 'unknown' } });
  expect(gasLeakTone(detector)).toBe('alarm'); expect(gasLeakStatus(detector)).toBe('Leak preview active · alarm silenced');
  expect(gasLeakTestStatus(detector)).toBe('Preview test passed');
  const light = createGasLeakArtwork('test', detector).shapes.find((shape) => shape.kind === 'rect' && shape.testId === 'gas-leak-status-light');
  expect(light?.fill).toBe('#FFB478');
});
it('does not label inconsistent samples clear or inconsistent test records passed', () => {
  const detector = getGasLeakSnapshot({ ...initial, settings: { gasConcentrationPercentLel: 35, gasTestResult: 'passed', gasTestCount: 0 } });
  expect(gasLeakStatus(detector)).toBe('Sample mismatch · review scenario'); expect(gasLeakTone(detector)).toBe('unknown');
  expect(gasLeakTestStatus(detector)).toBe('Preview test unavailable');
});
