import { createStore } from 'zustand/vanilla';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';
import { SimulationPersistence } from '../three-d-home/simulationPersistence';
import { SimulationSession } from '../three-d-home/simulationSession';
import { SimulationControlClient } from '../three-d-home/simulationControlClient';
import { executeVoiceCommand } from './executeVoiceCommand';

/** Flush bridge hydration and acknowledgements for deterministic native control assertions. */
async function settle(): Promise<void> { for (let index = 0; index < 24; index += 1) await Promise.resolve(); }

test('voice uses shared simulation reducers and the active scene receives the same saved result', async () => {
  const store = createStore<HomeState>(() => ({ ...useHomeStore.getState(), devices: [] }));
  const persistence = new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined });
  const factory = (deliver: ConstructorParameters<typeof SimulationSession>[0], status: ConstructorParameters<typeof SimulationSession>[1]) => new SimulationSession(deliver, status, { store, persistence, mode: 'production' });
  const voice = new SimulationControlClient(factory); const scene = new SimulationControlClient(factory);
  expect(executeVoiceCommand(voice, { type: 'power', deviceIds: ['master-light'], on: false })).toBe(false);
  voice.connect(); scene.connect(); await settle();
  executeVoiceCommand(voice, { type: 'brightness', deviceIds: ['bedroom-4-light', 'bedroom-4-bedside-left'], value: 42 });
  executeVoiceCommand(voice, { type: 'temperature', deviceIds: ['bedroom-4-ac'], value: 22 });
  executeVoiceCommand(voice, { type: 'position', deviceIds: ['entry-gate'], value: 100 });
  await settle();
  const states = scene.getSnapshot().state.deviceStates;
  expect(states['bedroom-4-light'].level).toBe(42);
  expect(states['bedroom-4-bedside-left'].level).toBe(42);
  expect(states['bedroom-4-ac'].settings?.tempC).toBe(22);
  expect(states['entry-gate']).toMatchObject({ on: true, level: 100 });
  expect(store.getState().devices).toEqual([]);
  voice.dispose(); scene.dispose();
});
