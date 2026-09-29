import type { Device, Room, Scene } from '../../store/useHomeStore';
import { isWholeHomeScene, sceneIsVisible, sceneScopeLabel, sceneSelectableDevices, sceneSelectionInScope } from './sceneScope';

const rooms: Room[] = [{ id: 'living', name: 'Living room' }, { id: 'bedroom', name: 'Bedroom' }];
const devices: Device[] = [
  { id: 'lamp', roomId: 'living', name: 'Lamp', kind: 'light', isOn: true },
  { id: 'bedside', roomId: 'bedroom', name: 'Bedside', kind: 'light', isOn: false },
];
const legacy: Scene = { id: 'evening', roomId: 'living', name: 'Evening', actions: [{ type: 'toggle', deviceId: 'lamp', on: true }] };
const whole: Scene = { id: 'night', roomId: '', scope: 'home', name: 'Good night', actions: [...legacy.actions, { type: 'toggle', deviceId: 'bedside', on: false }] };

test('keeps saved legacy room scenes room-scoped and names explicit whole-home scenes', () => {
  expect(isWholeHomeScene(legacy)).toBe(false);
  expect(sceneScopeLabel(legacy, rooms)).toBe('Living room');
  expect(isWholeHomeScene(whole)).toBe(true);
  expect(sceneScopeLabel(whole, rooms)).toBe('Whole home');
});

test('room filters preserve whole-home selections while One room excludes other rooms', () => {
  expect(sceneSelectableDevices(devices, 'home', '')).toEqual(devices);
  expect(sceneSelectableDevices(devices, 'home', 'bedroom')).toEqual([devices[1]]);
  expect(sceneSelectionInScope(['lamp', 'bedside', 'private-device'], devices, 'home', 'bedroom')).toEqual(['lamp', 'bedside']);
  expect(sceneSelectionInScope(['lamp', 'bedside'], devices, 'room', 'bedroom')).toEqual(['bedside']);
});

test('does not reveal scenes containing hidden, removed, or inaccessible device actions', () => {
  expect(sceneIsVisible(whole, rooms, devices)).toBe(true);
  expect(sceneIsVisible(whole, [rooms[0]], [devices[0]])).toBe(false);
  expect(sceneIsVisible(legacy, [rooms[1]], devices)).toBe(false);
  expect(sceneIsVisible({ ...legacy, actions: [{ type: 'toggle', deviceId: 'removed' }] }, rooms, devices)).toBe(false);
  expect(sceneIsVisible(whole, [], [])).toBe(false);
});
