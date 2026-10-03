import { afterEach, describe, expect, it } from 'vitest';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import { DEVICES, getRoom } from './data';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS, canControlSceneDevice, canViewSceneDevice, parseSceneAccess, type SceneAccess } from './sceneAccess';
import { useHomeStore, createDefaultState } from './state';
import { disposeRoomGeometry, isolateRoomGeometry } from './scene/roomPrivacy';

const bedroom: SceneAccess = {
  fullHome: false, roomIds: ['master'], deviceIds: DEVICES.filter((device) => device.roomId === 'master').map(({ id }) => id),
  controllableDeviceIds: ['master-light'],
};

afterEach(() => useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS }));

describe('host-issued scene access', () => {
  it('keeps only assigned-room triangles from a material-batched mesh and hides the house for outdoor access', () => {
    const room = getRoom('master');
    const [x, z] = room.center;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([
      x, 0.5, z, x + 0.2, 0.5, z, x, 0.7, z + 0.2,
      -20, 0, -20, -19, 0, -20, -20, 1, -20,
    ], 3));
    const source = new Group();
    const mesh = new Mesh(geometry, new MeshBasicMaterial()); mesh.name = 'batched-furniture'; source.add(mesh);
    const isolated = isolateRoomGeometry(source, room);
    const extracted = isolated.getObjectByName('batched-furniture') as Mesh;
    expect(extracted.visible).toBe(true);
    expect(extracted.geometry.getAttribute('position').count).toBe(3);
    expect(extracted.geometry.index?.count).toBe(3);
    expect(geometry.getAttribute('position').count).toBe(6);
    expect(isolateRoomGeometry(source, getRoom('grounds')).getObjectByName('batched-furniture')?.visible).toBe(false);
    disposeRoomGeometry(isolated); geometry.dispose();
  });

  it('rejects unknown rooms, cross-room grants and control without visibility', () => {
    expect(parseSceneAccess(bedroom)).toEqual(bedroom);
    expect(parseSceneAccess({ ...bedroom, fullHome: true })).toBeNull();
    expect(parseSceneAccess({ ...bedroom, extraPermission: true })).toBeNull();
    expect(parseSceneAccess({ ...bedroom, roomIds: ['unknown'] })).toBeNull();
    expect(parseSceneAccess({ ...bedroom, deviceIds: ['living-light'] })).toBeNull();
    expect(parseSceneAccess({ ...bedroom, controllableDeviceIds: ['entry-gate'] })).toBeNull();
    expect(canViewSceneDevice(bedroom, 'master-light')).toBe(true);
    expect(canViewSceneDevice(bedroom, 'living-light')).toBe(false);
    expect(canControlSceneDevice(bedroom, 'master-blinds')).toBe(false);
  });

  it('enters the assigned room atomically and rejects navigation to private interiors or property', () => {
    useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
    useHomeStore.getState().applyAccessSnapshot({}, bedroom);
    expect(useHomeStore.getState()).toMatchObject({ roomId: 'master', floor: 'upper', view: 'upper' });
    useHomeStore.getState().setRoom('living');
    useHomeStore.getState().setFloor('ground');
    useHomeStore.getState().setView('exterior');
    useHomeStore.getState().selectHotspotDevice('entry-gate');
    expect(useHomeStore.getState()).toMatchObject({ roomId: 'master', view: 'upper' });
    useHomeStore.getState().applyAccessSnapshot({}, EMPTY_SCENE_ACCESS);
    expect(useHomeStore.getState()).toMatchObject({ roomId: '', selectedDevice: null });
  });

  it('preserves the full-owner interior bookmark through host echoes at the gate', () => {
    useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
    useHomeStore.getState().setRoom('master');
    useHomeStore.getState().setView('exterior');
    useHomeStore.getState().applyAccessSnapshot({}, FULL_SCENE_ACCESS);
    useHomeStore.getState().setView('upper');
    expect(useHomeStore.getState()).toMatchObject({ roomId: 'master', floor: 'upper', view: 'upper' });
  });

  it('blocks stale and view-only actions, including presets and automatic lighting outside scope', () => {
    useHomeStore.setState({ ...createDefaultState(), access: bedroom });
    const before = useHomeStore.getState().deviceStates;
    useHomeStore.getState().toggleDevice('living-light');
    useHomeStore.getState().setDeviceLevel('master-blinds', 100);
    useHomeStore.getState().runDeviceAction('entry-gate', 'open');
    useHomeStore.getState().activatePreset('away');
    useHomeStore.getState().reset();
    useHomeStore.getState().setNight(true);
    expect(useHomeStore.getState().deviceStates).toEqual(before);
    useHomeStore.getState().toggleDevice('master-light');
    expect(useHomeStore.getState().deviceStates['master-light'].on).toBe(!before['master-light'].on);
    expect(useHomeStore.getState().deviceStates['living-light']).toEqual(before['living-light']);
  });

  it('omits neighboring furniture and cross-room geometry instead of exposing the full floor', () => {
    const room = getRoom('master');
    const bounds = room.bounds!;
    const center = [(bounds[0] + bounds[1]) / 2, (bounds[2] + bounds[3]) / 2];
    const source = new Group();
    const inside = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshBasicMaterial());
    inside.name = 'assigned-bed'; inside.position.set(center[0], 0.5, center[1]);
    const neighboring = inside.clone(); neighboring.name = 'private-bed'; neighboring.position.x = bounds[1] + 3;
    const shared = new Mesh(new BoxGeometry(60, 0.1, 60), new MeshBasicMaterial()); shared.name = 'full-floor';
    source.add(inside, neighboring, shared);
    const isolated = isolateRoomGeometry(source, room);
    expect(isolated.getObjectByName('assigned-bed')?.visible).toBe(true);
    expect(isolated.getObjectByName('private-bed')?.visible).toBe(false);
    expect(isolated.getObjectByName('full-floor')?.visible).toBe(false);
    expect(source.getObjectByName('private-bed')?.visible).toBe(true);
    disposeRoomGeometry(isolated); inside.geometry.dispose(); shared.geometry.dispose();
  });
});
