import { describe, expect, it, beforeEach } from 'vitest';
import { Box3, Group, Mesh, Vector3 } from 'three';
import { AUTHORED_DEVICES, getDevice, getRoom } from './data';
import { getRoomDoor, isInteriorRoomDoor, ROOM_DOORS, roomDoorAngle } from './roomDoors';
import { FULL_SCENE_ACCESS, type SceneAccess } from './sceneAccess';
import { createRoomDoorParts, DOOR_SURFACES, roomDoorPartMatrix } from './scene/roomDoorGeometry';
import { hideBakedRoomDoors, visibleRoomDoors } from './scene/roomDoorPresentation';
import { createDefaultState, useHomeStore, parseStoredState, STORAGE_VERSION } from './state';
import { openingControllerLabels } from './openingController';

beforeEach(() => useHomeStore.setState(createDefaultState()));

describe('architectural room doors', () => {
  it('binds each measured opening once to a known room and simulation device', () => {
    expect(ROOM_DOORS).toHaveLength(27);
    expect(new Set(ROOM_DOORS.map((door) => door.id)).size).toBe(27);
    for (const door of ROOM_DOORS) {
      expect(getDevice(door.id)).toMatchObject({ kind: 'door', roomId: door.roomId, model: 'architectural-room-door', defaultOn: false, defaultLevel: 0 });
      expect(getRoom(door.roomId).floor).toBe(door.floor);
      expect(door.width).toBeGreaterThan(0.6);
      expect(door.width).toBeLessThan(1.8);
    }
    expect(AUTHORED_DEVICES).toHaveLength(119);
  });

  it('never treats exterior entries, placed copies or unknown identities as ordinary interior doors', () => {
    expect(isInteriorRoomDoor('bedroom-1-door')).toBe(true);
    for (const id of ['entry-door', 'entry-gate', 'laundry-exterior-door', 'placed-bedroom-1-door', undefined]) expect(isInteriorRoomDoor(id)).toBe(false);
    expect(ROOM_DOORS.filter((door) => door.security === 'exterior')).toHaveLength(6);
  });

  it('labels room, folding and paired controls without implying a lock state', () => {
    expect(openingControllerLabels('door', 'bedroom-1-door')).toEqual({ title: 'ROOM', mechanism: 'Side-hinged door' });
    expect(openingControllerLabels('door', 'bedroom-2-closet-door').mechanism).toBe('Folding closet doors');
    expect(openingControllerLabels('door', 'family-terrace-door')).toEqual({ title: 'ENTRY', mechanism: 'Paired hinged doors' });
  });

  it('keeps closed panels inside the exact source openings and adds upper elevation only in complete-house views', () => {
    for (const part of createRoomDoorParts(ROOM_DOORS).filter((part) => part.surface === 'edge')) {
      const box = new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5)).applyMatrix4(roomDoorPartMatrix(part, 0, true));
      const [low, high] = part.door.sourceBounds;
      for (let axis = 0; axis < 3; axis++) {
        expect(box.min.getComponent(axis)).toBeGreaterThanOrEqual(low[axis] - 0.0001);
        expect(box.max.getComponent(axis)).toBeLessThanOrEqual(high[axis] + 0.0001);
      }
      const cutaway = new Vector3().setFromMatrixPosition(roomDoorPartMatrix(part, 40, false));
      const whole = new Vector3().setFromMatrixPosition(roomDoorPartMatrix(part, 40, true));
      expect(whole.y - cutaway.y).toBeCloseTo(part.door.floor === 'upper' ? 2.9464 : 0, 8);
    }
  });

  it('uses bounded continuous hinge poses and symmetric paired leaves', () => {
    for (const door of ROOM_DOORS) {
      expect(roomDoorAngle(door, NaN)).toBe(0);
      expect(roomDoorAngle(door, -10)).toBe(0);
      expect(roomDoorAngle(door, 150)).toBe(roomDoorAngle(door, 100));
      expect(Math.abs(roomDoorAngle(door, 100))).toBeLessThanOrEqual(Math.PI / 2);
      expect(roomDoorAngle(door, 75)).toBeCloseTo(roomDoorAngle(door, 100) * 0.75, 10);
      if (door.layout !== 'hinged') expect(roomDoorAngle(door, 100, -1)).toBe(-roomDoorAngle(door, 100, 1));
    }
    expect(Object.keys(DOOR_SURFACES)).toHaveLength(4);
  });

  it('cuts floor-plan leaves at the wall height without changing their hinges or footprints', () => {
    for (const part of createRoomDoorParts(ROOM_DOORS, true)) {
      const box = new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5)).applyMatrix4(roomDoorPartMatrix(part, 60, false));
      expect(box.max.y).toBeLessThanOrEqual(0.78);
    }
  });

  it('replaces only architectural leaf batches and never hides furnishings or cached originals', () => {
    const source = new Group();
    for (const name of ['ground--teak', 'upper--teak', 'ground--furniture-teak', 'ground--ivory']) { const mesh = new Mesh(); mesh.name = name; source.add(mesh); }
    const clone = source.clone(true); hideBakedRoomDoors(clone);
    expect(clone.children.map((node) => node.visible)).toEqual([false, false, true, true]);
    expect(source.children.every((node) => node.visible)).toBe(true);
  });

  it('respects isolated room layouts and optional shared interiors without granting live readings', () => {
    const access: SceneAccess = { fullHome: false, propertyOverview: true, roomIds: ['bedroom-1'], deviceIds: ['bedroom-1-door'], controllableDeviceIds: [] };
    expect(visibleRoomDoors(access, 'ground', 'ground', 'bedroom-1').every((door) => door.roomId === 'bedroom-1')).toBe(true);
    expect(visibleRoomDoors(access, 'exterior', 'ground', 'bedroom-1').every((door) => door.security === 'exterior')).toBe(true);
    expect(visibleRoomDoors({ ...access, interiorLayout: true }, 'exterior', 'ground', 'bedroom-1')).toHaveLength(27);
    expect(visibleRoomDoors(FULL_SCENE_ACCESS, 'upper', 'upper', 'master').every((door) => door.floor === 'upper')).toBe(true);
    expect(access.deviceIds).toEqual(['bedroom-1-door']);
  });

  it('preserves independent door positions and settings on reload while migrating old saves as closed', () => {
    const store = useHomeStore.getState();
    store.runDeviceAction('bedroom-1-door', 'door-command-open');
    store.setDeviceLevel('bath-2-door', 35);
    store.setDeviceSetting('bedroom-1-door', 'scheduleHour', 8);
    const restored = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: useHomeStore.getState() }));
    expect(restored.deviceStates['bedroom-1-door']).toMatchObject({ on: true, level: 100, settings: { scheduleHour: 8 } });
    expect(restored.deviceStates['bath-2-door']).toMatchObject({ on: true, level: 35 });
    expect(restored.deviceStates['entry-door']).toMatchObject({ on: false, level: 0 });
    const old = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: { ...createDefaultState(), deviceStates: { 'entry-door': { on: true, level: 65 } } } }));
    for (const door of ROOM_DOORS) expect(old.deviceStates[door.id]).toMatchObject({ on: false, level: 0 });
    expect(old.deviceStates['entry-door']).toMatchObject({ on: true, level: 65 });
    expect(getRoomDoor('unknown')).toBeUndefined();
  });
});
