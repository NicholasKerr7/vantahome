import { describe, expect, it } from 'vitest';
import { getDevice } from './data';
import { applyDeviceSetting } from './deviceControlActions';
import { acAirflowPosition, fanPreviewVelocity, readAcAirflowPreview } from './devicePreviewBehavior';
import { createDefaultSimulationSnapshot, parseSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';

const fan = getDevice('living-fan')!;
const ac = getDevice('master-ac')!;

describe('device controls drive bounded visual previews', () => {
  it('reverses the actual requested fan velocity and caps sleep speed without overwriting the manual speed', () => {
    const forward = { on: true, level: 80 };
    const reverse = applyDeviceSetting(fan.id, forward, 'fanDirection', 'reverse');
    expect(fanPreviewVelocity(fan, reverse)).toBe(-fanPreviewVelocity(fan, forward));
    const sleep = applyDeviceSetting(fan.id, reverse, 'fanSleepMode', true);
    expect(fanPreviewVelocity(fan, sleep)).toBeCloseTo(-35 * 0.13);
    expect(sleep.level).toBe(80);
    expect(fanPreviewVelocity(fan, { ...sleep, on: false })).toBe(0);
    expect(fanPreviewVelocity(fan, { ...forward, level: NaN })).toBe(0);
  });

  it('makes airflow presets mutually exclusive, visible, and portable across the native/browser bridge', () => {
    const snapshot = createDefaultSimulationSnapshot();
    let state = applyDeviceSetting(ac.id, { ...snapshot.deviceStates[ac.id], on: true }, 'acFanSpeed', 70);
    expect(readAcAirflowPreview(ac, state).strength).toBe(0.7);
    state = applyDeviceSetting(ac.id, state, 'acEcoMode', true);
    expect(readAcAirflowPreview(ac, state).strength).toBe(0.5);
    state = applyDeviceSetting(ac.id, state, 'acTurboMode', true);
    expect(readAcAirflowPreview(ac, state).strength).toBe(1);
    expect(state.settings?.acEcoMode).toBe(false);
    state = applyDeviceSetting(ac.id, state, 'acQuietMode', true);
    expect(readAcAirflowPreview(ac, state).strength).toBe(0.3);
    expect(state.settings).toMatchObject({ acFanSpeed: 70, acEcoMode: false, acTurboMode: false, acQuietMode: true });
    snapshot.deviceStates[ac.id] = state;
    const restored = parseSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot });
    expect(restored?.state.deviceStates[ac.id]).toEqual(state);
    state = applyDeviceSetting(ac.id, state, 'acQuietMode', false);
    expect(readAcAirflowPreview(ac, state).strength).toBe(0.7);
    state = applyDeviceSetting(ac.id, state, 'acTurboMode', true);
    state = applyDeviceSetting(ac.id, state, 'acFanSpeed', 0);
    expect(readAcAirflowPreview(ac, state).strength).toBe(0);
    expect(state.settings?.acTurboMode).toBe(false);
  });

  it('changes airflow direction and mode coloring without fabricating environmental measurements', () => {
    const state = { on: true, level: 60, settings: { acFanSpeed: 60, acSwingMode: 'off', mode: 'cold', acTargetHumidity: 45 } };
    const still = readAcAirflowPreview(ac, state);
    const swinging = readAcAirflowPreview(ac, applyDeviceSetting(ac.id, state, 'acSwingMode', 'both'));
    const straightPosition = acAirflowPosition(still, 1.5, 1, 0.2);
    const swingPosition = acAirflowPosition(swinging, 1.5, 1, 0.2);
    expect(swingPosition[0]).not.toBe(straightPosition[0]);
    expect(swingPosition[1]).not.toBe(straightPosition[1]);
    expect(swingPosition[2]).toBe(straightPosition[2]);
    expect(readAcAirflowPreview(ac, applyDeviceSetting(ac.id, state, 'mode', 'dry')).color).not.toBe(still.color);
    expect(readAcAirflowPreview(ac, { ...state, on: false }).strength).toBe(0);
    expect(readAcAirflowPreview(ac, applyDeviceSetting(ac.id, state, 'acFanSpeed', 0)).strength).toBe(0);
    expect(state.settings).toEqual({ acFanSpeed: 60, acSwingMode: 'off', mode: 'cold', acTargetHumidity: 45 });
  });
});
