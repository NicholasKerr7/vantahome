import { describe, expect, it } from 'vitest';
import { AUTHORED_DEVICES, getDevice } from './data';
import { describeEnergyFlow, sourceFlowDirection, type EnergySourceId } from './energyFlowInsights';
import type { EnergyFlow, EnergyRuntime } from './energySimulation';

/** Build a complete balanced sample so each case changes only the behavior under inspection. */
function flow(overrides: Partial<EnergyFlow> = {}): EnergyFlow {
  return {
    solarKw: 2, homeKw: 2, requestedKw: 2, batteryKw: 0, gridKw: 0, generatorKw: 0,
    curtailedKw: 0, unservedKw: 0, batteryPercent: 75, runtimeHours: null,
    deferredDeviceIds: [], sourceLabel: 'Solar', storageMode: 'self-use', gridPhase: 'connected',
    ...overrides,
  };
}

/** Supply generator and recovery context without starting or advancing the energy simulator. */
function runtime(overrides: Partial<EnergyRuntime> = {}): EnergyRuntime {
  return {
    enabled: true, elapsedSeconds: 0, batteryKwh: 18, generatorPhase: 'off', phaseSeconds: 0,
    fuelPercent: 80, solarKwh: 0, gridKwh: 0, generatorKwh: 0, loadKwh: 0,
    ...overrides,
  };
}

describe('sourceFlowDirection', () => {
  it.each<EnergySourceId>(['solar', 'battery', 'grid', 'generator'])('keeps absent, zero and invalid %s readings idle', (source) => {
    const field = `${source}Kw` as 'solarKw' | 'batteryKw' | 'gridKw' | 'generatorKw';
    expect(sourceFlowDirection(null, source)).toBe('idle');
    for (const reading of [0, -0, NaN, Infinity, -Infinity]) {
      expect(sourceFlowDirection(flow({ [field]: reading }), source)).toBe('idle');
    }
    expect(sourceFlowDirection(flow({ [field]: 0.0001 }), source)).toBe('in');
  });

  it('reverses only a charging battery path', () => {
    expect(sourceFlowDirection(flow({ batteryKw: -2 }), 'battery')).toBe('out');
    expect(sourceFlowDirection(flow({ solarKw: -2 }), 'solar')).toBe('idle');
    expect(sourceFlowDirection(flow({ gridKw: -2 }), 'grid')).toBe('idle');
    expect(sourceFlowDirection(flow({ generatorKw: -2 }), 'generator')).toBe('idle');
  });

  it('does not animate a connected grid or running generator with no output', () => {
    expect(sourceFlowDirection(flow({ gridPhase: 'connected', gridKw: 0 }), 'grid')).toBe('idle');
    expect(sourceFlowDirection(flow({ generatorKw: 0 }), 'generator')).toBe('idle');
  });
});

describe('describeEnergyFlow', () => {
  it('does not reveal runtime, source or device context across the unavailable-flow boundary', () => {
    const privateRuntime = runtime({ fuelPercent: 13, generatorPhase: 'failed', gridRestorePendingIds: ['master-ac'] });
    const unavailable = describeEnergyFlow(null);
    for (const selected of [null, 'solar', 'battery', 'grid', 'generator'] as const) {
      expect(describeEnergyFlow(null, privateRuntime, selected)).toEqual(unavailable);
    }
    expect(unavailable.waitingNames).toEqual([]);
    expect(unavailable.body).toContain('paused or unavailable');
  });

  it('shows pause rather than stale source state when the runtime is disabled', () => {
    const result = describeEnergyFlow(flow({ generatorKw: 6, deferredDeviceIds: ['master-ac'] }), runtime({ enabled: false }), 'generator');
    expect(result.title).toContain('paused');
    expect(result.body).toContain('settings are retained');
    expect(result.waitingNames).toEqual([]);
    expect(result.body).not.toContain('6.00');
  });

  it('summarizes actual active inputs rather than an untrusted display label', () => {
    const result = describeEnergyFlow(flow({ solarKw: 1, batteryKw: 1, sourceLabel: 'Private hidden name' }));
    expect(result.body).toBe('Simulation supplies 2.00 kW from solar + battery.');
    expect(result.tone).toBe('calm');
  });

  it('keeps standby, missing supply, unmet demand and unknown readings distinct', () => {
    expect(describeEnergyFlow(flow({ requestedKw: 0, homeKw: 0 })).title).toContain('standby');
    expect(describeEnergyFlow(flow({ solarKw: 0 })).title).toBe('No source supply available');
    const shortage = describeEnergyFlow(flow({ homeKw: 1, unservedKw: 1 }));
    expect(shortage.body).toContain('1.00 kW of 2.00 kW');
    expect(shortage.tone).toBe('attention');
    expect(describeEnergyFlow(flow({ requestedKw: NaN })).title).toContain('unavailable');
  });

  it('names only the first two deferred devices and retains demand and additional-count context', () => {
    const result = describeEnergyFlow(flow({ homeKw: 0.5, requestedKw: 4, deferredDeviceIds: ['living-light', 'family-tv', 'master-ac'] }));
    expect(result.waitingNames).toEqual([getDevice('living-light')?.name, getDevice('family-tv')?.name]);
    expect(result.body).toContain('Pendant light, Television +1');
    expect(result.body).toContain('Limited supply');
    expect(result.body).toContain('0.50 of 4.00 kW served');
    expect(result.body).toContain('settings retained');
    expect(result.tone).toBe('attention');
  });

  it('uses a safe label for an unknown device and does not expose its raw identifier', () => {
    const result = describeEnergyFlow(flow({ deferredDeviceIds: ['private-device-identifier', 'private-device-identifier'] }));
    expect(result.waitingNames).toEqual(['Unnamed device']);
    expect(result.title).toBe('1 device is waiting');
    expect(JSON.stringify(result)).not.toContain('private-device-identifier');
  });

  it('bounds long visible names while retaining their full accessible names', () => {
    const devices = AUTHORED_DEVICES.filter((device) => device.name.length > 16).slice(0, 2);
    expect(devices).toHaveLength(2);
    const result = describeEnergyFlow(flow({ gridPhase: 'restoring', deferredDeviceIds: devices.map((device) => device.id) }));
    expect(result.waitingNames).toEqual(devices.map((device) => device.name));
    expect(result.body).toContain('…');
    expect(result.body.length).toBeLessThanOrEqual(125);
  });

  it('distinguishes deliberately staged loads from a shortage during grid recovery', () => {
    const recovering = flow({ gridPhase: 'restoring', deferredDeviceIds: ['master-ac'] });
    const staged = describeEnergyFlow(recovering, runtime({ gridRestorePendingIds: ['master-ac'] }));
    expect(staged.body).toContain('Staged recovery');
    expect(staged.tone).toBe('calm');
    expect(describeEnergyFlow(recovering, runtime({ gridRestorePendingIds: ['family-tv'] })).body).toContain('Limited supply');
    expect(describeEnergyFlow(recovering).body).toContain('Recovery or supply limits');
    const mixed = flow({ gridPhase: 'restoring', deferredDeviceIds: ['master-ac', 'family-tv'] });
    expect(describeEnergyFlow(mixed, runtime({ gridRestorePendingIds: ['master-ac'] })).body).toContain('Recovery or supply limits');
  });

  it.each<EnergyFlow['storageMode']>(['backup', 'self-use', 'charge'])('explains charging, supplying and idle storage in %s mode', (storageMode) => {
    const charging = describeEnergyFlow(flow({ storageMode, batteryKw: -1.5 }), undefined, 'battery');
    const supplying = describeEnergyFlow(flow({ storageMode, batteryKw: 1.5 }), undefined, 'battery');
    const idle = describeEnergyFlow(flow({ storageMode }), undefined, 'battery');
    expect(charging.title).toContain('charging');
    expect(charging.body).toContain('1.50 kW');
    expect(supplying.body).toContain('reserve limits');
    expect(idle.title).toContain('holding');
    expect(idle.body).toContain(`${storageMode === 'self-use' ? 'Self-use' : storageMode === 'backup' ? 'Backup' : 'Charge'} mode`);
    expect(idle.body).not.toContain('disabled');
  });

  it('explains solar output, curtailment and rest without claiming measured conditions', () => {
    expect(describeEnergyFlow(flow(), undefined, 'solar').body).toContain('2.00 kW');
    const curtailed = describeEnergyFlow(flow({ curtailedKw: 3 }), undefined, 'solar');
    expect(curtailed.body).toContain('3.00 kW is unused');
    expect(curtailed.body).toContain('inverter limits');
    const idle = describeEnergyFlow(flow({ solarKw: 0 }), undefined, 'solar');
    expect(idle.title).toContain('resting');
    expect(idle.body).toContain('can leave solar idle');
  });

  it.each([
    ['isolated', 'No JPS import'], ['stabilizing', 'stable return'],
    ['restoring', 'rejoin in stages'], ['connected', 'does not require an import'],
  ] as const)('explains the %s grid phase', (gridPhase, expected) => {
    expect(describeEnergyFlow(flow({ gridPhase }), undefined, 'grid').body).toContain(expected);
  });

  it('separates connected import from grid availability', () => {
    expect(describeEnergyFlow(flow({ gridKw: 3 }), undefined, 'grid').body).toContain('imports 3.00 kW');
    expect(describeEnergyFlow(flow(), undefined, 'grid').title).toContain('no import');
  });

  it.each([
    ['off', 'standby'], ['starting', 'starting'], ['warming', 'warming'],
    ['running', 'running, no output'], ['cooling', 'cooling'], ['failed', 'could not start'],
  ] as const)('explains the %s generator phase independently of output', (generatorPhase, expected) => {
    const result = describeEnergyFlow(flow({ gridPhase: 'isolated' }), runtime({ generatorPhase }), 'generator');
    expect(result.title).toContain(expected);
  });

  it('separates running generator supply, isolated output and missing fuel', () => {
    const running = runtime({ generatorPhase: 'running' });
    expect(describeEnergyFlow(flow({ generatorKw: 4 }), running, 'generator').body).toContain('4.00 kW');
    for (const gridPhase of ['connected', 'restoring'] as const) {
      const isolated = describeEnergyFlow(flow({ gridPhase }), running, 'generator');
      expect(isolated.title).toContain('isolated');
      expect(isolated.body).toContain('does not run in parallel');
    }
    for (const generatorPhase of ['running', 'off', 'failed'] as const) {
      const empty = describeEnergyFlow(flow(), runtime({ generatorPhase, fuelPercent: 0 }), 'generator');
      expect(empty.body).toContain('fuel supply is empty');
      expect(empty.tone).toBe('attention');
    }
    expect(describeEnergyFlow(flow(), undefined, 'generator').title).toContain('unavailable');
  });

  it('does not present non-finite source readings as valid power', () => {
    for (const source of ['solar', 'battery', 'grid', 'generator'] as const) {
      const result = describeEnergyFlow(flow({ [`${source}Kw`]: NaN }), runtime({ generatorPhase: 'running' }), source);
      expect(result.title).toContain('unavailable');
      expect(result.body).not.toContain('NaN');
    }
  });

  it('keeps ordinary copy within the fixed insight area', () => {
    const samples = [
      flow(), flow({ solarKw: 0, requestedKw: 0, homeKw: 0 }), flow({ unservedKw: 2 }),
      flow({ batteryKw: -2, curtailedKw: 3, gridKw: 2, generatorKw: 4 }),
      flow({ deferredDeviceIds: ['living-light', 'family-tv', 'master-ac'] }),
      flow({ gridPhase: 'restoring', deferredDeviceIds: ['living-light', 'family-tv', 'master-ac'] }),
    ];
    for (const sample of samples) {
      for (const generatorPhase of ['off', 'starting', 'warming', 'running', 'cooling', 'failed'] as const) {
        for (const selected of [null, 'solar', 'battery', 'grid', 'generator'] as const) {
          const result = describeEnergyFlow(sample, runtime({ generatorPhase }), selected);
          expect(result.title.length, result.title).toBeLessThanOrEqual(35);
          expect(result.body.length, result.body).toBeLessThanOrEqual(125);
        }
      }
    }
  });

  it('never modifies the source snapshot, recovery list or device requests', () => {
    const sample = flow({ gridPhase: 'restoring', deferredDeviceIds: ['master-ac', 'family-tv'] });
    const context = runtime({ gridRestorePendingIds: ['master-ac'] });
    const before = JSON.stringify({ sample, context });
    Object.freeze(sample.deferredDeviceIds);
    Object.freeze(context.gridRestorePendingIds);
    Object.freeze(sample);
    Object.freeze(context);
    for (const selected of [null, 'solar', 'battery', 'grid', 'generator'] as const) describeEnergyFlow(sample, context, selected);
    expect(JSON.stringify({ sample, context })).toBe(before);
    const result = describeEnergyFlow(sample, context);
    result.waitingNames.push('Changed by consumer');
    expect(describeEnergyFlow(sample, context).waitingNames).not.toContain('Changed by consumer');
  });
});
