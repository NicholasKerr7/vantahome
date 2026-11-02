import { expect, it } from 'vitest';
import { getDevice } from './data';
import { canRunSmokeScenarios, readSmokeControllerState } from './smokeController';
import { createSmokeArtwork } from './smokeArtwork';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import type { DeviceState } from './simulationTypes';

const device = getDevice('family-smoke')!;
const initial: DeviceState = { on: true, level: 0 };

it('uses missing defaults without inventing a hardware test or protection claim', () => {
  expect(readSmokeControllerState(device, initial)).toMatchObject({ smokeDetected: false, coDetected: false, incidentActive: false, batteryPercent: 96, sampleChecked: false, tone: 'standby', status: 'No alarm in this sample' });
  expect(readSmokeControllerState(getDevice('kitchen-stove')!, initial)).toBeNull();
});

it.each(['false', 0, null])('keeps malformed source %s unknown', (value) => {
  const state = { ...initial, settings: { smokeDetected: value, fireIncidentActive: false } } as unknown as DeviceState;
  expect(readSmokeControllerState(device, state)).toMatchObject({ smokeDetected: null, tone: 'unknown', status: 'Alarm sample unavailable' });
});

it('keeps a known source prominent through silence, acknowledgement, sample checks and sensor errors', () => {
  const state = { ...initial, settings: { smokeDetected: true, coDetected: 'unknown', smokeSilenced: true, fireIncidentAcknowledged: true, sampleChecked: true, smokeSensorStatus: 'error' } };
  expect(readSmokeControllerState(device, state)).toMatchObject({ tone: 'alarm', status: 'Smoke simulation active', coDetected: null, silenced: true, acknowledged: true });
});

it('retains the latch after sources clear and shows warnings or invalid sample values truthfully', () => {
  expect(readSmokeControllerState(device, { ...initial, settings: { fireIncidentActive: true } })).toMatchObject({ tone: 'alarm', status: 'Sources clear · reset pending' });
  expect(readSmokeControllerState(device, { ...initial, settings: { fireIncidentActive: true, coDetected: 'unknown' } })?.status).toBe('Incident latched · source unavailable');
  expect(readSmokeControllerState(device, { ...initial, settings: { smokeSensorStatus: 'warning' } })?.tone).toBe('warning');
  expect(readSmokeControllerState(device, { ...initial, settings: { smokeSensorStatus: 'healthy', smokeBattery: 101, sampleChecked: 'yes' } })).toMatchObject({ tone: 'unknown', sensorStatus: null, batteryPercent: null, sampleChecked: null });
});

it('requires every affected preview light and gate grant for the new scenario controls', () => {
  expect(canRunSmokeScenarios(FULL_SCENE_ACCESS, device.id)).toBe(true);
  expect(canRunSmokeScenarios(undefined, device.id)).toBe(false);
  for (const missing of ['entry-gate', 'living-light', device.id]) {
    expect(canRunSmokeScenarios({ ...FULL_SCENE_ACCESS, controllableDeviceIds: FULL_SCENE_ACCESS.controllableDeviceIds.filter((id) => id !== missing) }, device.id)).toBe(false);
  }
});

it('uses a steady alarm signal with isolated lightweight SVG paints', () => {
  const drawing = createSmokeArtwork('smoke', 'alarm');
  expect(drawing.shapes.find((shape) => shape.kind === 'rect' && shape.testId === 'smoke-preview-signal')?.fill).toBe('#FF967F');
  expect(drawing.shapes.length).toBeLessThan(45);
  const ids = new Set(drawing.gradients.map(({ id }) => id));
  for (const shape of drawing.shapes) for (const paint of [shape.fill, shape.stroke]) if (paint?.startsWith('url')) expect(ids.has(paint.slice(5, -1))).toBe(true);
});
