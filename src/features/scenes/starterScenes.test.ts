import { availableStarterScenes } from './starterScenes';
import { virtualSceneHome } from './sceneTestFixtures';
import { canManageScenes, removeSceneState } from './sceneManagement';
import { modelSceneCatalog } from '../three-d-home/modelSceneCatalog';
import { useHomeStore, type Scene } from '../../store/useHomeStore';

test('offers four deliberate virtual comfort presets without changing the home or adding records', () => {
  const state = virtualSceneHome();
  const presets = availableStarterScenes(state);
  expect(presets.map((preset) => preset.name)).toEqual(['Good morning', 'Movie time', 'Good night', 'Away']);
  expect(presets.every((preset) => preset.available)).toBe(true);
  expect(presets[0].draft.actions).toHaveLength(4);
  expect(presets[1].draft.actions).toHaveLength(3);
  for (const preset of presets) for (const action of preset.draft.actions) {
    const device = state.devices.find((device) => device.id === action.deviceId)!;
    expect(['light', 'tv', 'ac', 'blinds']).toContain(device.kind);
    expect(device.roomId).not.toContain('grounds');
    expect(device.roomId).not.toContain('utility');
  }
  expect(state.scenes).toEqual([]);
});

test('never substitutes a physical device or silently turns a partially bound preset into a complete one', () => {
  const state = virtualSceneHome();
  state.devices = state.devices.map((device) => device.modelDeviceId === 'master-blinds' ? { ...device, simulationOnly: false } : device);
  const presets = availableStarterScenes(state);
  expect(presets[0].available).toBe(false);
  expect(presets[2].available).toBe(false);
  expect(presets[1].available).toBe(true);
  expect(presets[0].draft.actions.some((action) => action.deviceId.includes('master-blinds'))).toBe(false);
});

test('current permission and Guest scope determine availability and catalog visibility', () => {
  const state = virtualSceneHome();
  const scene: Scene = { ...availableStarterScenes(state)[1].draft, id: 'movie-saved' };
  state.scenes = [scene];
  expect(modelSceneCatalog(state, 'alpha').scenes.map((item) => item.id)).toEqual([scene.id]);
  const guest = { ...state, household: [{ ...state.household[0], role: 'Guest' as const }], roomMembers: [{ memberId: 'scene-owner', roomIds: ['registry-room:living'] }] };
  expect(canManageScenes(guest)).toBe(false);
  expect(availableStarterScenes(guest).every((preset) => !preset.available)).toBe(true);
  expect(modelSceneCatalog(guest, 'alpha').scenes).toEqual([]);
  expect(canManageScenes({ ...state, membershipReady: false })).toBe(false);
  expect(canManageScenes({ ...state, accountHomeId: 'previous-home' })).toBe(false);
});

test('deletion removes only the saved scene, clears usage and pauses dependent routines without changing devices', () => {
  const state = virtualSceneHome();
  const scene: Scene = { ...availableStarterScenes(state)[1].draft, id: 'movie-saved' };
  state.scenes = [scene, { ...scene, id: 'keep' }];
  state.activeSceneId = scene.id;
  state.lastSceneRun = { sceneId: scene.id, ts: 100 };
  state.flows = [{ id: 'flow', name: 'Evening', enabled: true, triggers: [{ type: 'time', hour: 19, minute: 0 }], conditions: [], actions: [{ type: 'run-scene', sceneId: scene.id }] }];
  const result = removeSceneState(state, scene.id);
  expect(result.scenes?.map((item) => item.id)).toEqual(['keep']);
  expect(result.activeSceneId).toBeNull(); expect(result.lastSceneRun).toBeNull();
  expect(result.flows?.[0].enabled).toBe(false); expect(result).not.toHaveProperty('devices');
  expect(availableStarterScenes({ ...state, ...result })).toHaveLength(4);
  expect(result.scenes).toHaveLength(1);
  expect(removeSceneState({ ...state, devices: [] }, scene.id).scenes).toHaveLength(1);
});

test('store blocks expired or switched-scope edits and makes unique IDs for rapid saves', () => {
  const state = virtualSceneHome();
  const draft = availableStarterScenes(state)[1].draft;
  useHomeStore.setState(state);
  jest.spyOn(Date, 'now').mockReturnValue(1234);
  try {
    useHomeStore.getState().addScene(draft);
    useHomeStore.getState().addScene(draft);
    expect(new Set(useHomeStore.getState().scenes.map((scene) => scene.id)).size).toBe(2);
    const id = useHomeStore.getState().scenes[0].id;
    useHomeStore.setState({ membershipReady: false });
    expect(() => useHomeStore.getState().updateScene(id, { name: 'No access' })).toThrow('access');
    expect(() => useHomeStore.getState().removeScene(id)).toThrow('access');
  } finally { jest.restoreAllMocks(); }
});
