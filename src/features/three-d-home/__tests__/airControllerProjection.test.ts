import { getDevice } from '../../../../packages/home-scene/src/data';
import { applyDeviceSetting, toggleDeviceState } from '../../../../packages/home-scene/src/deviceControlActions';
import { readAirQualityControllerState } from '../../../../packages/home-scene/src/airQualityController';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { validCachedDevicePatch } from '../../../store/cachedDeviceValidation';
import type { Device } from '../../../store/useHomeStore';
import { projectModelSnapshot } from '../modelHomeCatalog';

/** Exercise the exact canonical-to-host path used by both authored and added model devices. */
test.each([false, true])('air preferences and readings survive host projection and reopening with alerts=%s', (alerts) => {
  const id = 'living-air'; const definition = getDevice(id)!;
  const snapshot = createDefaultSimulationSnapshot();
  let state = snapshot.deviceStates[id];
  for (const [field, value] of Object.entries({ airAlertsEnabled: alerts, airAlertAqi: 75, airPurifierMode: 'sleep', airPurifierSpeed: 65, airIonizerEnabled: true, airAutoVentilation: false })) {
    state = applyDeviceSetting(id, state, field, value);
  }
  snapshot.deviceStates[id] = toggleDeviceState(id, state);
  const device: Device = { id, name: definition.name, roomId: definition.roomId, kind: 'air', isOn: false,
    airAlertsEnabled: !alerts, airPurifierMode: 'boost', airPurifierSpeed: 10, airIonizerEnabled: false, airAutoVentilation: true };
  const projected = projectModelSnapshot([device], snapshot)[0];
  expect(projected).toMatchObject({ airAlertsEnabled: alerts, airAlertAqi: 75, airPurifierMode: 'sleep', airPurifierSpeed: 65,
    airIonizerEnabled: true, airAutoVentilation: false, airQualityIndex: 32, airCo2: 620 });
  expect(validCachedDevicePatch(projected)).toBe(true);
  expect(projected).not.toHaveProperty('sampleChecked');
  const restored = parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot });
  expect(restored?.state.deviceStates[id]).toEqual(snapshot.deviceStates[id]);
  expect(readAirQualityControllerState(definition, restored!.state.deviceStates[id])).toMatchObject({ alertsEnabled: alerts, aqiThreshold: 75, aqi: 32, sampleChecked: true });
  expect(projectModelSnapshot([device], restored!.state)[0]).toEqual(projected);
});
