import { DEVICES } from '../../../packages/home-scene/src/data';
import type { Device, Scene, SceneAction } from '../../store/useHomeStore';
import { createModelScenes } from '../three-d-home/modelSceneCatalog';
import { sceneOutcome } from './sceneOutcome';

const devices: Device[] = [
  { id: 'lamp', name: 'Bedside lamp', kind: 'light', roomId: 'bedroom', isOn: true, simulationOnly: true },
  { id: 'pendant', name: 'Pendant', kind: 'light', roomId: 'living', isOn: true, simulationOnly: true },
  { id: 'tv', name: 'Family TV', kind: 'tv', roomId: 'family', isOn: false, simulationOnly: true },
  { id: 'ac', name: 'Bedroom AC', kind: 'ac', roomId: 'bedroom', isOn: true, simulationOnly: true },
  { id: 'door', name: 'Front door', kind: 'door', roomId: 'entry', isOn: false, simulationOnly: true },
  { id: 'camera', name: 'Driveway camera', kind: 'camera', roomId: 'grounds', isOn: true, simulationOnly: true },
];

/** Build action-only scene input so tests cannot accidentally rely on a scene's display name. */
function outcome(actions: SceneAction[], directory = devices) {
  return sceneOutcome({ actions }, directory);
}

describe('scene outcome previews', () => {
  it('describes different authored moods from actual targets rather than the first device names', () => {
    const directory = DEVICES.map((device) => ({ ...device, isOn: true }));
    const summaries = createModelScenes().map((scene) => sceneOutcome(scene, directory, true).summary);
    expect(new Set(summaries).size).toBe(4);
    expect(summaries.every((summary) => summary.includes('lights') || summary.includes('Lights'))).toBe(true);
    expect(summaries.every((summary) => !summary.includes('+ 88 more'))).toBe(true);
  });

  it('prioritizes power-off intent over saved brightness and cooling setpoints', () => {
    const result = outcome([
      { type: 'patch', deviceId: 'lamp', patch: { isOn: false, brightness: 90 } },
      { type: 'patch', deviceId: 'pendant', patch: { isOn: false, brightness: 75 } },
      { type: 'patch', deviceId: 'tv', patch: { isOn: false, volume: 50 } },
      { type: 'patch', deviceId: 'ac', patch: { isOn: false, tempC: 22 } },
    ]);
    expect(result.summary).toBe('2 lights off · Family TV: off · Bedroom AC: off');
    expect(result.simulationOnly).toBe(true);
  });

  it('merges sequential actions and counts each device once without reading current power', () => {
    const actions: SceneAction[] = [
      { type: 'patch', deviceId: 'lamp', patch: { isOn: true, brightness: 10 } },
      { type: 'patch', deviceId: 'lamp', patch: { brightness: 25 } },
      { type: 'toggle', deviceId: 'lamp', on: false },
      { type: 'toggle', deviceId: 'tv' },
    ];
    expect(outcome(actions).summary).toBe('Bedside lamp: off · Family TV: toggles');
    expect(outcome(actions).deviceCount).toBe(2);
    expect(outcome(actions, devices.map((device) => ({ ...device, isOn: !device.isOn }))).summary).toBe(outcome(actions).summary);
  });

  it('does not claim a fully on/off lighting group when some actions only edit a setting', () => {
    expect(outcome([
      { type: 'patch', deviceId: 'lamp', patch: { brightness: 25 } },
      { type: 'toggle', deviceId: 'pendant', on: false },
    ]).summary).toBe('Lights: 1 off / 1 setting');
    expect(outcome([
      { type: 'patch', deviceId: 'lamp', patch: { isOn: true, brightness: 15 } },
      { type: 'patch', deviceId: 'pendant', patch: { isOn: true, brightness: 20 } },
    ]).summary).toBe('2 lights on at 15–20%');
  });

  it('exposes entry and camera settings without claiming locking or successful delivery', () => {
    const result = outcome([
      { type: 'patch', deviceId: 'door', patch: { openPercent: 0 } },
      { type: 'patch', deviceId: 'camera', patch: { isOn: true, armed: false, recording: false } },
    ]);
    expect(result.impact).toBe('Entry, camera settings');
    expect(result.importantEffects).toEqual(['Front door: closed', 'Driveway camera: disarmed, recording off']);
    expect(result.summary).not.toMatch(/locked|confirmed|delivered/i);
  });

  it('keeps removed or restricted names and IDs out of every summary', () => {
    const result = outcome([{ type: 'toggle', deviceId: 'private-bedroom-camera', on: false }]);
    expect(result.summary).toBe('Unavailable device actions');
    expect(result.importantEffects).toEqual([]);
    expect(result.simulationOnly).toBe(false);
    expect(JSON.stringify(result)).not.toContain('private-bedroom');
    expect(outcome([]).summary).toBe('No device actions yet');
  });

  it('never labels mixed physical/virtual targets as simulation-only', () => {
    const actions: SceneAction[] = [{ type: 'toggle', deviceId: 'lamp', on: true }, { type: 'toggle', deviceId: 'tv', on: true }];
    expect(outcome(actions, devices.map((device) => ({ ...device, simulationOnly: device.id !== 'tv' }))).simulationOnly).toBe(false);
    expect(sceneOutcome({ actions }, devices.map((device) => ({ ...device, simulationOnly: false })), true).simulationOnly).toBe(true);
  });

  it('keeps child-lock changes visible when the stove is turned off', () => {
    const stove: Device = { id: 'stove', name: 'Kitchen stove', kind: 'stove', roomId: 'kitchen', isOn: true };
    const result = outcome([{ type: 'patch', deviceId: stove.id, patch: { isOn: false, stoveLock: false } }], [stove]);
    expect(result.importantEffects).toEqual(['Kitchen stove: off, child lock off']);
    expect(result.summary).toBe('Kitchen stove: off, child lock off');
  });

  it('surfaces changes to water and gas protection preferences', () => {
    const water: Device = { id: 'water', name: 'Water supply', kind: 'water', roomId: 'grounds', isOn: true };
    const gas: Device = { id: 'gas', name: 'Gas detector', kind: 'gas-leak', roomId: 'kitchen', isOn: true };
    const result = outcome([
      { type: 'patch', deviceId: water.id, patch: { waterAutoShutoff: false, waterLeakAlerts: false } },
      { type: 'patch', deviceId: gas.id, patch: { gasAutoShutoff: false, gasLeakAlerts: false } },
    ], [water, gas]);
    expect(result.importantEffects).toEqual([
      'Water supply: automatic water shutoff off, water leak alerts off',
      'Gas detector: automatic gas shutoff off, gas leak alerts off',
    ]);
    expect(result.impact).toBe('Safety settings');
  });

  it.each([false, undefined])('does not retain armed after a virtual camera power change to %s', (on) => {
    const result = outcome([
      { type: 'patch', deviceId: 'camera', patch: { isOn: true, armed: true } },
      { type: 'toggle', deviceId: 'camera', on },
    ]);
    expect(result.importantEffects).toEqual(['Driveway camera: disarmed']);
  });

  it('keeps physical camera power visible alongside independent arming intent', () => {
    const camera = { ...devices.find((device) => device.id === 'camera')!, simulationOnly: false };
    const result = outcome([{ type: 'patch', deviceId: 'camera', patch: { isOn: false, armed: true } }], [camera]);
    expect(result.importantEffects).toEqual(['Driveway camera: off, armed']);
  });

  it('tracks edits rather than trusting a familiar scene title', () => {
    const scene: Scene = { id: 'custom', name: 'Good night', roomId: '', scope: 'home', actions: [{ type: 'toggle', deviceId: 'tv', on: true }] };
    expect(sceneOutcome(scene, devices).summary).toBe('Family TV: on');
  });
});
