import { describe, expect, it } from 'vitest';
import { advanceGateSafety, applyGateCommand, applyGateSetting } from '../gateSafetySimulation';
import type { DeviceState } from '../simulationTypes';
import { advanceGateMotion } from './gateMotion';

const openGate: DeviceState = { on: true, level: 100 };

describe('confirmed gate presentation', () => {
  it.each([30, 60, 120])('closes steadily across one-second safety samples at %s fps, including the final idle sample', (fps) => {
    let gate = applyGateCommand(openGate, 'close');
    let position = 100;
    expect(advanceGateMotion(position, gate.level, gate, 1 / fps)).toBe(100);
    for (let tick = 0; tick < 4; tick++) {
      gate = advanceGateSafety(gate, 1);
      for (let frame = 0; frame < fps; frame++) {
        const next = advanceGateMotion(position, gate.level, gate, 1 / fps);
        expect((position - next) * fps).toBeCloseTo(25, 7);
        expect(next).toBeGreaterThanOrEqual(gate.level);
        position = next;
      }
      expect(position).toBeCloseTo(gate.level, 7);
    }
    expect(position).toBeCloseTo(0);
    expect(gate.settings?.gatePhase).toBe('idle');
  });

  it('stops at the last confirmed sample if subsequent updates do not arrive', () => {
    const gate = advanceGateSafety(applyGateCommand(openGate, 'close'), 1);
    let position = 100;
    for (let frame = 0; frame < 240; frame++) position = advanceGateMotion(position, gate.level, gate, 1 / 60);
    expect(position).toBe(75);
  });

  it('does not continue opening after a rapid close request or overshoot a partial target', () => {
    let gate = applyGateCommand(openGate, 'close');
    expect(advanceGateMotion(20, gate.level, gate, 1 / 60)).toBe(20);
    const reopened = applyGateCommand(gate, 'open');
    const reopeningPose = advanceGateMotion(20, reopened.level, reopened, 1 / 60);
    expect(reopeningPose).toBeGreaterThan(20);
    expect(reopeningPose).toBeLessThan(25);
    gate = advanceGateSafety(gate, 3.5);
    expect(advanceGateMotion(20, gate.level, gate, 1 / 60)).toBeLessThan(20);
    const partial = advanceGateSafety(applyGateSetting(openGate, 'openPercent', 60), 2);
    let position = 100;
    for (let frame = 0; frame < 180; frame++) position = advanceGateMotion(position, partial.level, partial, 1 / 60);
    expect(position).toBe(60);
  });

  it('freezes residual travel on a pause or fault, while an authorized obstruction reversal opens', () => {
    const closing = advanceGateSafety(applyGateCommand(openGate, 'close'), 1);
    const fault = applyGateSetting(closing, 'gateSensorFault', true);
    const paused = { ...closing, settings: { ...closing.settings, gatePhase: 'paused' } };
    for (const gate of [fault, paused]) expect(advanceGateMotion(85, gate.level, gate, 0.08)).toBe(85);
    const resumed = applyGateCommand(paused, 'resume');
    expect(advanceGateMotion(85, resumed.level, resumed, 0.08)).toBe(83);
    const obstructed = applyGateSetting(closing, 'gateBeamBlocked', true);
    expect(obstructed.level).toBe(100);
    expect(advanceGateMotion(85, obstructed.level, obstructed, 1 / 60)).toBeGreaterThan(85);
  });

  it.each(['gateHoldOpen', 'gateVehiclePresent', 'gateBeamBlocked', 'gateEmergencyHold', 'gateEmergencyActive'])('never animates closing through %s', (field) => {
    const gate = { on: true, level: 75, settings: { [field]: true } };
    expect(advanceGateMotion(85, gate.level, gate, 0.08)).toBe(85);
  });

  it('bounds stalled frames and invalid timing instead of jumping to a target', () => {
    const gate = advanceGateSafety(applyGateCommand(openGate, 'close'), 1);
    expect(advanceGateMotion(100, gate.level, gate, 10)).toBe(98);
    for (const delta of [-1, NaN, Infinity]) expect(advanceGateMotion(100, gate.level, gate, delta)).toBe(100);
    expect(advanceGateMotion(80, NaN, gate, 0.08)).toBe(80);
  });
});
