import { afterEach, describe, expect, it } from 'vitest';
import { DEVICES, getDevice, installRuntimeDeviceDefinitions } from './data';
import {
  advanceEnergySimulation, createEnergyRuntime, DEMO_ENERGY_CONFIG as CONFIG,
  parseEnergyRuntime, projectEnergyDeviceStates, readEnergyFlow, type EnergyFlow, type EnergyRuntime,
} from './energySimulation';
import type { DeviceStates } from './simulationTypes';
import { FIRE_PREVIEW_LIGHT_IDS, synchronizeSafetySimulation } from './safetySimulation';

/** Start with an idle property and explicitly available authored plant components. */
function property(): DeviceStates {
  return {
    ...Object.fromEntries(DEVICES.map((device) => [device.id, { on: false, level: device.defaultLevel }])),
    'utility-energy': { on: true, level: 55, settings: { gridAvailable: true } },
    'utility-battery': { on: true, level: 78, settings: { storageMode: 'backup', reservePercent: 25 } },
    'utility-solar': { on: true, level: 70 },
    'utility-generator': { on: false, level: 65, settings: { generatorMode: 'auto' } },
  };
}

/** Simulate ordinary foreground calls, never using a large background catch-up interval. */
function tick(runtime: EnergyRuntime, states: DeviceStates, night: boolean, seconds: number): EnergyRuntime {
  let next = runtime;
  for (let elapsed = 0; elapsed < seconds; elapsed += 1) next = advanceEnergySimulation(next, states, night, 1);
  return next;
}

/** Assert the complete instantaneous lossless balance, including deferred demand and charging. */
function expectBalanced(flow: EnergyFlow): void {
  expect(flow.solarKw + flow.gridKw + flow.generatorKw + flow.batteryKw).toBeCloseTo(flow.homeKw, 10);
  expect(flow.homeKw + flow.unservedKw).toBeCloseTo(flow.requestedKw, 10);
  expect(flow.gridKw).toBeGreaterThanOrEqual(0);
  expect(flow.solarKw + Math.max(0, flow.batteryKw)).toBeLessThanOrEqual(CONFIG.inverterKw + 1e-8);
  expect(Math.abs(flow.batteryKw)).toBeLessThanOrEqual(CONFIG.batteryKw + 1e-8);
  expect(flow.generatorKw).toBeLessThanOrEqual(CONFIG.generatorKw);
  expect(flow.gridKw * flow.generatorKw).toBe(0);
}

afterEach(() => installRuntimeDeviceDefinitions([]));

describe('saved coordinated energy runtime', () => {
  it('seeds storage once from the battery sample without treating an enabled generator as instant output', () => {
    const states = property();
    states['utility-generator'].on = true;
    const runtime = createEnergyRuntime(states);
    expect(runtime).toMatchObject({ enabled: true, elapsedSeconds: 0, batteryKwh: 18.72, generatorPhase: 'off', fuelPercent: 82 });
    expect(parseEnergyRuntime(JSON.parse(JSON.stringify(runtime)))).toEqual(runtime);
    states['utility-battery'].level = 1;
    expect(readEnergyFlow(runtime, states, true).batteryPercent).toBeCloseTo(78);
  });

  it('strictly rejects missing, extra, nonfinite, negative and out-of-range saved fields', () => {
    const runtime = createEnergyRuntime(property());
    for (const field of ['elapsedSeconds', 'batteryKwh', 'phaseSeconds', 'fuelPercent', 'solarKwh', 'gridKwh', 'generatorKwh', 'loadKwh']) {
      for (const invalid of [NaN, Infinity, -1, '1']) expect(parseEnergyRuntime({ ...runtime, [field]: invalid })).toBeNull();
    }
    expect(parseEnergyRuntime({ ...runtime, batteryKwh: 25 })).toBeNull();
    expect(parseEnergyRuntime({ ...runtime, fuelPercent: 101 })).toBeNull();
    expect(parseEnergyRuntime({ ...runtime, elapsedSeconds: 1e12 })).toBeNull();
    expect(parseEnergyRuntime({ ...runtime, generatorPhase: 'online' })).toBeNull();
    expect(parseEnergyRuntime({ ...runtime, enabled: 'yes' })).toBeNull();
    expect(parseEnergyRuntime({ ...runtime, deviceStates: {} })).toBeNull();
    const { fuelPercent: _fuel, ...incomplete } = runtime;
    expect(parseEnergyRuntime(incomplete)).toBeNull();
    expect(parseEnergyRuntime(null)).toBeNull();
    expect(parseEnergyRuntime([])).toBeNull();
  });

  it('pauses without mutating saved data and bounds foreground advancement to five seconds', () => {
    const states = property();
    const runtime = createEnergyRuntime(states);
    const paused = { ...runtime, enabled: false };
    expect(advanceEnergySimulation(paused, states, false, 5)).toBe(paused);
    for (const seconds of [0, -1, NaN, Infinity]) expect(advanceEnergySimulation(runtime, states, false, seconds)).toBe(runtime);
    expect(advanceEnergySimulation(runtime, states, false, 3600)).toEqual(advanceEnergySimulation(runtime, states, false, 5));
    expect(advanceEnergySimulation(runtime, states, false, 0.5).elapsedSeconds).toBe(0.5);
  });
});

describe('conserved property power flow', () => {
  it('uses daylight solar for the home then storage and curtails surplus without exporting', () => {
    const states = property();
    states['utility-water-heater'].on = true;
    const runtime = createEnergyRuntime(states);
    const flow = readEnergyFlow(runtime, states, false);
    expect(flow).toMatchObject({ homeKw: 3, solarKw: 8, batteryKw: -5, gridKw: 0, generatorKw: 0, sourceLabel: 'Solar' });
    expect(flow.curtailedKw).toBeCloseTo(0.4);
    expectBalanced(flow);
    const full = readEnergyFlow({ ...runtime, batteryKwh: 24 }, states, false);
    expect(full.solarKw).toBe(3);
    expect(full.batteryKw).toBe(0);
    expect(full.curtailedKw).toBeCloseTo(5.4);
    expectBalanced(full);
  });

  it('changes from daytime solar to grid or self-use storage at night, respecting the connected reserve', () => {
    const states = property();
    states['kitchen-fridge'].on = true;
    const runtime = createEnergyRuntime(states);
    expect(readEnergyFlow(runtime, states, false).gridKw).toBe(0);
    expect(readEnergyFlow(runtime, states, true)).toMatchObject({ solarKw: 0, gridKw: 0.18, batteryKw: 0 });
    states['utility-battery'].settings!.storageMode = 'self-use';
    expect(readEnergyFlow(runtime, states, true)).toMatchObject({ solarKw: 0, gridKw: 0, batteryKw: 0.18 });
    const reserve = { ...runtime, batteryKwh: 6 };
    expect(readEnergyFlow(reserve, states, true)).toMatchObject({ gridKw: 0.18, batteryKw: 0 });
    expect(tick(reserve, states, true, 20).batteryKwh).toBe(6);
  });

  it('permits outage discharge below the normal reserve but never below the emergency floor', () => {
    const states = property();
    states['utility-energy'].settings!.gridAvailable = false;
    states['utility-generator'].settings!.generatorMode = 'manual';
    states['kitchen-fridge'].on = true;
    const runtime = { ...createEnergyRuntime(states), batteryKwh: 5 };
    const flow = readEnergyFlow(runtime, states, true);
    expect(flow).toMatchObject({ gridKw: 0, batteryKw: 0.18, homeKw: 0.18 });
    expect(flow.runtimeHours).toBeCloseTo((5 - 2.4) / 0.18);
    const nearlyEmpty = { ...runtime, batteryKwh: 2.4001 };
    const after = tick(nearlyEmpty, states, true, 10);
    expect(after.batteryKwh).toBeGreaterThanOrEqual(2.4 - 1e-10);
    expect(readEnergyFlow(after, states, true)).toMatchObject({ homeKw: 0, batteryKw: 0, unservedKw: 0.18 });
    states['utility-energy'].settings!.gridAvailable = true;
    expect(readEnergyFlow(after, states, true)).toMatchObject({ homeKw: 0, gridKw: 0, gridPhase: 'stabilizing' });
    const restored = tick(after, states, true, CONFIG.gridStableSeconds);
    expect(readEnergyFlow(restored, states, true)).toMatchObject({ homeKw: 0.18, batteryKw: 0, gridKw: 0.18 });
  });

  it('defers whole flexible loads before comfort and essential loads, without changing requested settings', () => {
    const states = property();
    states['utility-energy'].settings!.gridAvailable = false;
    states['kitchen-fridge'].on = true;
    states['master-ac'].on = true;
    states['utility-water-heater'].on = true;
    states['laundry-dryer'].on = true;
    states['laundry-dryer'].settings = { program: 'cotton' };
    const before = JSON.stringify(states);
    const flow = readEnergyFlow(createEnergyRuntime(states), states, true);
    expect(flow.homeKw).toBeCloseTo(4.12);
    expect(flow.deferredDeviceIds).toEqual(['utility-water-heater']);
    expect(flow.unservedKw).toBe(3);
    expectBalanced(flow);
    const projected = projectEnergyDeviceStates(states, flow);
    expect(projected['utility-water-heater'].on).toBe(false);
    expect(projected['laundry-dryer']).toBe(states['laundry-dryer']);
    expect(JSON.stringify(states)).toBe(before);
    states['utility-energy'].settings!.gridAvailable = true;
    expect(projectEnergyDeviceStates(states, readEnergyFlow(createEnergyRuntime(states), states, true))).toBe(states);
  });

  it('keeps independent solar poles, opening positions and safety alarm inputs out of shedding mutations', () => {
    const states = property();
    const protectedIds = ['grounds-solar-nw', 'entry-gate', 'master-blinds', 'entry-door', 'kitchen-window', 'master-smoke', 'kitchen-gas-leak'];
    for (const id of protectedIds) states[id] = { on: true, level: 100, settings: id === 'master-smoke' ? { smokeDetected: true } : undefined };
    const runtime = createEnergyRuntime(states);
    const flow = readEnergyFlow(runtime, states, true);
    expect(flow.requestedKw).toBeCloseTo(0.004);
    expect(projectEnergyDeviceStates(states, { ...flow, deferredDeviceIds: protectedIds })).toBe(states);
  });

  it('keeps latched emergency preview lights and alarm indicators visible even with no modeled supply', () => {
    const states = property();
    states['utility-energy'].settings!.gridAvailable = false;
    states['utility-generator'].settings!.generatorMode = 'manual';
    states['utility-battery'].on = false;
    states['master-smoke'] = { on: true, level: 100, settings: { smokeDetected: true } };
    const emergency = synchronizeSafetySimulation(states);
    const before = JSON.stringify(emergency);
    const flow = readEnergyFlow(createEnergyRuntime(emergency), emergency, true);
    expect(flow.unservedKw).toBeGreaterThan(0);
    for (const id of [...FIRE_PREVIEW_LIGHT_IDS, 'master-smoke']) expect(flow.deferredDeviceIds).not.toContain(id);
    const display = projectEnergyDeviceStates(emergency, flow);
    for (const id of FIRE_PREVIEW_LIGHT_IDS) expect(display[id]).toEqual(emergency[id]);
    expect(display['master-smoke']).toEqual(emergency['master-smoke']);
    expect(display['entry-gate']).toEqual(emergency['entry-gate']);
    expect(JSON.stringify(emergency)).toBe(before);
  });

  it('waits for stable JPS then restores essentials, comfort and flexible loads in separate stages', () => {
    const states = property();
    states['utility-energy'].settings!.gridAvailable = false;
    states['utility-generator'].settings!.generatorMode = 'manual';
    states['utility-battery'].on = false;
    states['kitchen-fridge'].on = true;
    states['family-tv'].on = true;
    states['utility-water-heater'].on = true;
    let runtime = createEnergyRuntime(states);
    states['utility-energy'].settings!.gridAvailable = true;
    runtime = tick(runtime, states, true, 14);
    expect(readEnergyFlow(runtime, states, true)).toMatchObject({ gridPhase: 'stabilizing', homeKw: 0 });
    runtime = tick(runtime, states, true, 1);
    expect(readEnergyFlow(runtime, states, true)).toMatchObject({ gridPhase: 'restoring', homeKw: 0.18, deferredDeviceIds: ['family-tv', 'utility-water-heater'] });
    runtime = tick(runtime, states, true, 10);
    expect(readEnergyFlow(runtime, states, true)).toMatchObject({ gridPhase: 'restoring', homeKw: 0.3, deferredDeviceIds: ['utility-water-heater'] });
    runtime = tick(runtime, states, true, 10);
    expect(readEnergyFlow(runtime, states, true)).toMatchObject({ gridPhase: 'connected', homeKw: 3.3, deferredDeviceIds: [] });
    expectBalanced(readEnergyFlow(runtime, states, true));
  });

  it('never interrupts comfort loads already supplied by battery while reconnecting JPS', () => {
    const states = property();
    states['utility-energy'].settings!.gridAvailable = false;
    states['utility-generator'].settings!.generatorMode = 'manual';
    states['family-tv'].on = true;
    let runtime = tick(createEnergyRuntime(states), states, true, 1);
    expect(readEnergyFlow(runtime, states, true).homeKw).toBe(0.12);
    states['utility-energy'].settings!.gridAvailable = true;
    for (let second = 0; second < CONFIG.gridFlexibleSeconds; second += 1) {
      runtime = tick(runtime, states, true, 1);
      expect(readEnergyFlow(runtime, states, true).homeKw).toBe(0.12);
      expect(readEnergyFlow(runtime, states, true).deferredDeviceIds).toEqual([]);
    }
    expect(runtime.gridRestorePendingIds).toBeUndefined();
  });

  it('restarts the grid stability wait after a second observed outage and accepts legacy saved runtimes', () => {
    const states = property();
    const { gridRecoverySeconds: _recovery, ...legacy } = createEnergyRuntime(states);
    expect(parseEnergyRuntime(legacy)).toEqual(legacy);
    expect(readEnergyFlow(legacy, states, true).gridPhase).toBe('connected');
    expect(parseEnergyRuntime({ ...legacy, gridRecoverySeconds: -1 })).toBeNull();
    expect(parseEnergyRuntime({ ...legacy, gridRestorePendingIds: ['family-tv'] })).toMatchObject({ gridRestorePendingIds: ['family-tv'] });
    for (const ids of [['family-tv', 'family-tv'], [3], ['https://example.com'], Array.from({ length: 129 }, (_, i) => `d-${i}`)]) {
      expect(parseEnergyRuntime({ ...legacy, gridRestorePendingIds: ids })).toBeNull();
    }
    expect(parseEnergyRuntime({ ...legacy, gridRecoverySeconds: CONFIG.gridFlexibleSeconds + 1 })).toBeNull();
    let runtime: EnergyRuntime = legacy;
    states['utility-energy'].settings!.gridAvailable = false;
    runtime = tick(runtime, states, true, 1);
    states['utility-energy'].settings!.gridAvailable = true;
    runtime = tick(runtime, states, true, 10);
    expect(readEnergyFlow(runtime, states, true).gridPhase).toBe('stabilizing');
    states['utility-energy'].settings!.gridAvailable = false;
    runtime = tick(runtime, states, true, 1);
    states['utility-energy'].settings!.gridAvailable = true;
    expect(readEnergyFlow(runtime, states, true).gridPhase).toBe('stabilizing');
    expect(runtime.gridRecoverySeconds).toBe(0);
  });

  it('includes added fixture loads without changing the authored plant capacity', () => {
    const original = getDevice('kitchen-fridge')!;
    installRuntimeDeviceDefinitions([{ ...original, id: 'placed-fridge-1', templateDeviceId: original.id }]);
    const states = property();
    states['kitchen-fridge'].on = true;
    states['placed-fridge-1'].on = true;
    expect(readEnergyFlow(createEnergyRuntime(states), states, true).requestedKw).toBeCloseTo(0.36);
  });

  it('limits grid charging, battery charging and inverter output while accounting for all stored energy', () => {
    const states = property();
    states['utility-battery'].settings!.storageMode = 'charge';
    states['utility-water-heater'].on = true;
    const runtime = { ...createEnergyRuntime(states), batteryKwh: 23.9999 };
    const flow = readEnergyFlow(runtime, states, true);
    expect(flow.gridKw).toBeCloseTo(3.36);
    expectBalanced(flow);
    const next = advanceEnergySimulation(runtime, states, true, 5);
    expect(next.batteryKwh).toBe(24);
    expect(next.solarKwh + next.gridKwh + next.generatorKwh + runtime.batteryKwh - next.batteryKwh).toBeCloseTo(next.loadKwh, 10);
  });

  it('conserves accumulated energy across day, night, an outage and grid recovery', () => {
    const states = property();
    states['utility-water-heater'].on = true;
    states['kitchen-fridge'].on = true;
    states['master-ac'].on = true;
    states['utility-battery'].settings!.storageMode = 'self-use';
    const initial = createEnergyRuntime(states);
    let runtime = initial;
    for (let second = 0; second < 200; second += 1) {
      states['utility-energy'].settings!.gridAvailable = second < 80 || second >= 160;
      const night = second >= 40;
      expectBalanced(readEnergyFlow(runtime, states, night));
      runtime = advanceEnergySimulation(runtime, states, night, 1);
    }
    expect(runtime.solarKwh + runtime.gridKwh + runtime.generatorKwh + initial.batteryKwh - runtime.batteryKwh).toBeCloseTo(runtime.loadKwh, 9);
    expect(parseEnergyRuntime(runtime)).toEqual(runtime);
  });

  it('maintains balance and source limits across empty/full storage, grid states, storage modes and overloads', () => {
    const states = property();
    for (const device of DEVICES) if (!['generator', 'solar', 'energy', 'battery'].includes(device.kind)) states[device.id].on = true;
    for (const night of [false, true]) for (const grid of [false, true]) for (const mode of ['backup', 'self-use', 'charge']) {
      states['utility-energy'].settings!.gridAvailable = grid;
      states['utility-battery'].settings!.storageMode = mode;
      for (const batteryKwh of [0, 2.4, 6, 23.9999, 24]) for (const generatorPhase of ['off', 'running'] as const) {
        const runtime = { ...createEnergyRuntime(states), batteryKwh, generatorPhase };
        expectBalanced(readEnergyFlow(runtime, states, night));
        const next = advanceEnergySimulation(runtime, states, night, 5);
        expect(next.solarKwh + next.gridKwh + next.generatorKwh + batteryKwh - next.batteryKwh).toBeCloseTo(next.loadKwh, 9);
        expect(next.batteryKwh).toBeGreaterThanOrEqual(0);
        expect(next.batteryKwh).toBeLessThanOrEqual(24);
      }
    }
  });
});

describe('backup generator lifecycle', () => {
  it('automatically starts low-storage outages, warms before taking load, then unloads and cools on grid return', () => {
    const states = property();
    states['utility-energy'].settings!.gridAvailable = false;
    states['kitchen-fridge'].on = true;
    let runtime = { ...createEnergyRuntime(states), batteryKwh: 5 };
    runtime = tick(runtime, states, true, 1);
    expect(runtime.generatorPhase).toBe('starting');
    expect(readEnergyFlow(runtime, states, true).generatorKw).toBe(0);
    runtime = tick(runtime, states, true, 4);
    expect(runtime.generatorPhase).toBe('warming');
    runtime = tick(runtime, states, true, 8);
    expect(runtime.generatorPhase).toBe('running');
    const running = readEnergyFlow(runtime, states, true);
    expect(running.generatorKw).toBeCloseTo(5.18);
    expect(running.batteryKw).toBe(-5);
    expectBalanced(running);
    runtime = tick(runtime, states, true, 5);
    expect(runtime.generatorKwh).toBeGreaterThan(0);
    states['utility-energy'].settings!.gridAvailable = true;
    expect(readEnergyFlow(runtime, states, true)).toMatchObject({ gridKw: 0, gridPhase: 'stabilizing' });
    expect(readEnergyFlow(runtime, states, true).generatorKw).toBeGreaterThan(0);
    runtime = tick(runtime, states, true, CONFIG.gridStableSeconds);
    expect(readEnergyFlow(runtime, states, true).generatorKw).toBe(0);
    runtime = tick(runtime, states, true, 1);
    expect(runtime.generatorPhase).toBe('cooling');
    expect(readEnergyFlow(runtime, states, true).gridKw).toBe(0.18);
    runtime = tick(runtime, states, true, 9);
    expect(runtime.generatorPhase).toBe('off');
  });

  it('requires a manual start in manual mode and responds to stop without changing the mode', () => {
    const states = property();
    states['utility-energy'].settings!.gridAvailable = false;
    states['utility-generator'].settings!.generatorMode = 'manual';
    states['kitchen-fridge'].on = true;
    let runtime = { ...createEnergyRuntime(states), batteryKwh: 2.4 };
    expect(tick(runtime, states, true, 15).generatorPhase).toBe('off');
    states['utility-generator'].on = true;
    runtime = tick(runtime, states, true, 13);
    expect(runtime.generatorPhase).toBe('running');
    states['utility-generator'].on = false;
    runtime = tick(runtime, states, true, 1);
    expect(runtime.generatorPhase).toBe('cooling');
    expect(states['utility-generator'].settings!.generatorMode).toBe('manual');
  });

  it('allows a manual generator exercise while grid-connected but keeps its electrical output isolated', () => {
    const states = property();
    states['utility-generator'].on = true;
    states['kitchen-fridge'].on = true;
    const runtime = tick(createEnergyRuntime(states), states, true, 20);
    expect(runtime.generatorPhase).toBe('running');
    expect(runtime.fuelPercent).toBeLessThan(82);
    expect(runtime.generatorKwh).toBe(0);
    expect(readEnergyFlow(runtime, states, true)).toMatchObject({ generatorKw: 0, gridKw: 0.18 });
  });

  it('honors auto recovery hysteresis and a minimum running interval before cooling', () => {
    const states = property();
    states['utility-energy'].settings!.gridAvailable = false;
    states['kitchen-fridge'].on = true;
    const runtime: EnergyRuntime = { ...createEnergyRuntime(states), generatorPhase: 'running', batteryKwh: 15, phaseSeconds: 5 };
    expect(tick(runtime, states, true, 1).generatorPhase).toBe('running');
    expect(tick({ ...runtime, phaseSeconds: 30 }, states, true, 1).generatorPhase).toBe('cooling');
  });

  it('fails on fuel exhaustion without inventing generation or changing load settings', () => {
    const states = property();
    states['utility-energy'].settings!.gridAvailable = false;
    states['utility-generator'].on = true;
    states['utility-battery'].on = false;
    states['kitchen-fridge'].on = true;
    const before = JSON.stringify(states);
    const runtime: EnergyRuntime = { ...createEnergyRuntime(states), generatorPhase: 'running', fuelPercent: 0.0001 };
    const flow = readEnergyFlow(runtime, states, true);
    expect(flow.generatorKw).toBe(0);
    expect(flow.unservedKw).toBe(0.18);
    const next = advanceEnergySimulation(runtime, states, true, 1);
    expect(next).toMatchObject({ generatorPhase: 'failed', fuelPercent: 0, generatorKwh: 0 });
    expect(tick(next, states, true, 15).generatorPhase).toBe('failed');
    expect(JSON.stringify(states)).toBe(before);
  });
});


it('starts a new unconfigured plant in self-use while respecting an explicit backup preference', () => {
  const states = property();
  states['kitchen-fridge'].on = true;
  delete states['utility-battery'].settings!.storageMode;
  const initial = createEnergyRuntime(states);
  expect(readEnergyFlow(initial, states, true)).toMatchObject({ storageMode: 'self-use', gridKw: 0, batteryKw: 0.18 });
  states['utility-battery'].settings!.storageMode = 'backup';
  expect(readEnergyFlow(initial, states, true)).toMatchObject({ storageMode: 'backup', gridKw: 0.18, batteryKw: 0 });
});
