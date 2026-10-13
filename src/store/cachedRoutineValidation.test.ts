import AsyncStorage from '@react-native-async-storage/async-storage';
import { hydrateHomeAccount, useHomeStore } from './useHomeStore';
import { selectRoutines } from './routineModel';
import { validCachedRoutineCollections } from './cachedRoutineValidation';

const flow = { id: 'routine', name: 'Routine', enabled: true, triggers: [{ type: 'time', hour: 0, minute: 2 }],
  conditions: [{ type: 'day', days: ['Mon'] }], actions: [{ type: 'notify', message: 'Ready' }] };
const scene = { id: 'scene', name: 'Scene', roomId: 'room', actions: [{ type: 'patch', deviceId: 'light', patch: { isOn: true, brightness: 20 } }] };
const seed = useHomeStore.getState();

test.each([
  { flows: [{ ...flow, triggers: null }] },
  { flows: [{ ...flow, conditions: {} }] },
  { flows: [{ ...flow, actions: [null] }] },
  { flows: [{ ...flow, triggers: [{ type: 'time', hour: 24, minute: 0 }] }] },
  { flows: [{ ...flow, triggers: [{ type: 'device', deviceId: 'light', state: ['on'] }] }] },
  { flows: [{ ...flow, conditions: [{ type: 'day', days: null }] }] },
  { flows: [{ ...flow, conditions: [{ type: 'day', days: ['Monday'] }] }] },
  { flows: [{ ...flow, actions: [{ type: 'delay', seconds: '1' }] }] },
  { flows: [{ ...flow, actions: [{ type: 'run-scene', sceneId: {} }] }] },
  { flows: [{ ...flow, actions: [{ type: 'set-ac', deviceId: 'ac', tempC: 20, mode: ['cold'] }] }] },
  { rules: [{ id: 'rule', name: 'Rule', enabled: true, trigger: null, action: { type: 'toggle', deviceId: 'light', on: true } }] },
  { scenes: [{ ...scene, actions: null }] },
  { scenes: [{ ...scene, actions: [{ type: 'patch', deviceId: 'light', patch: null }] }] },
  { scenes: [{ ...scene, actions: [{ type: 'patch', deviceId: 'light', patch: { brightness: {} } }] }] },
  { scenes: [{ ...scene, actions: [{ type: 'patch', deviceId: 'light', patch: { airHistory: [null] } }] }] },
  { scenes: [{ ...scene, actions: [{ type: 'patch', deviceId: 'light', patch: { schedule: [{ id: 'one', hour: 0, minute: 0, enabled: true, days: null }] } }] }] },
])('preserves invalid nested cache bytes and routes hydration through recovery: %j', async (collections) => {
  await AsyncStorage.clear();
  await hydrateHomeAccount(null);
  const key = 'vantahome-store:user:nested';
  const raw = JSON.stringify({ version: 6, state: { accountUserId: 'nested', ...collections } });
  await AsyncStorage.setItem(key, raw);
  await expect(hydrateHomeAccount('nested')).rejects.toMatchObject({ reason: 'corrupt' });
  expect(useHomeStore.getState().membershipReady).toBe(false);
  await useHomeStore.setState({ userName: 'Unsaved default' });
  expect(await AsyncStorage.getItem(key)).toBe(raw);
  await AsyncStorage.setItem(key, JSON.stringify({ version: 6, state: { accountUserId: 'nested', flows: [flow], scenes: [scene] } }));
  await expect(hydrateHomeAccount('nested')).resolves.toBe(true);
  expect(useHomeStore.getState().flows).toEqual([flow]);
  await hydrateHomeAccount(null);
});

test('accepts existing seed structures, legacy missing collections, empty drafts and all routine variants', () => {
  expect(validCachedRoutineCollections(seed)).toBe(true);
  expect(validCachedRoutineCollections({})).toBe(true);
  expect(validCachedRoutineCollections({ flows: [{ ...flow, triggers: [], conditions: [], actions: [] }] })).toBe(true);
  expect(validCachedRoutineCollections({ flows: [{ ...flow,
    triggers: [{ type: 'time', hour: 23, minute: 59 }, { type: 'device', deviceId: 'light', state: 'off' },
      { type: 'presence', memberId: 'member', status: 'away' }, { type: 'scene', sceneId: 'scene' }],
    conditions: [{ type: 'time-range', startHour: 23, startMinute: 0, endHour: 1, endMinute: 0 }, { type: 'device', deviceId: 'light', state: 'on' }],
    actions: [{ type: 'toggle', deviceId: 'light', on: true }, { type: 'set-ac', deviceId: 'ac', tempC: 20, mode: 'cold' },
      { type: 'set-brightness', deviceId: 'light', brightness: 0 }, { type: 'run-scene', sceneId: 'scene' }, { type: 'delay', seconds: 0 }] }],
    scenes: [{ ...scene, actions: [{ type: 'toggle', deviceId: 'light' }] }] })).toBe(true);
});


test.each([
  { field: 'flow id', collections: { flows: [{ ...flow, id: '\ud800' }] } },
  { field: 'flow legacy alias', collections: { flows: [{ ...flow, legacyRuleId: '\udfff' }] } },
  { field: 'rule id', collections: { rules: [{ id: '\ud800', name: 'Rule', enabled: false,
    trigger: { type: 'time', hour: 0, minute: 0 }, action: { type: 'toggle', deviceId: 'light', on: true } }] } },
  { field: 'scene device reference', collections: { scenes: [{ ...scene, actions: [{ type: 'toggle', deviceId: '\udfff' }] }] } },
  { field: 'scene device patch id', collections: { scenes: [{ ...scene, actions: [{ type: 'patch', deviceId: 'light', patch: { id: '\ud800' } }] }] } },
])('routes a malformed UTF-16 $field through recovery before selectors run', async ({ collections }) => {
  await AsyncStorage.clear();
  await hydrateHomeAccount(null);
  const key = 'vantahome-store:user:unicode';
  const raw = JSON.stringify({ version: 6, state: { accountUserId: 'unicode', ...collections } });
  await AsyncStorage.setItem(key, raw);
  await expect(hydrateHomeAccount('unicode')).rejects.toMatchObject({ reason: 'corrupt' });
  expect(useHomeStore.getState().membershipReady).toBe(false);
  expect(() => selectRoutines(useHomeStore.getState())).not.toThrow();
  useHomeStore.setState({ userName: 'Unsaved after recovery failure' });
  expect(await AsyncStorage.getItem(key)).toBe(raw);

  // The same recovery path accepts a valid surrogate pair without rewriting identifiers.
  const id = 'routine-\ud83d\ude00';
  const alias = 'legacy-\ud83d\ude00';
  const recovered = { version: 6, state: { accountUserId: 'unicode', rules: [],
    flows: [{ ...flow, id }, { ...flow, id: 'promoted', legacyRuleId: alias }],
    scenes: [{ ...scene, id, actions: [{ type: 'patch', deviceId: id, patch: { id, isOn: true } }] }],
  } };
  await AsyncStorage.setItem(key, JSON.stringify(recovered));
  await expect(hydrateHomeAccount('unicode')).resolves.toBe(true);
  expect(() => selectRoutines(useHomeStore.getState())).not.toThrow();
  expect(selectRoutines(useHomeStore.getState()).map((routine) => routine.id)).toEqual([
    `flow:${encodeURIComponent(id)}`, `rule:${encodeURIComponent(alias)}`,
  ]);
  expect(useHomeStore.getState().flows[0].id).toBe(id);
  expect(useHomeStore.getState().scenes[0].actions[0]).toMatchObject({ deviceId: id, patch: { id } });
  await hydrateHomeAccount(null);
});
