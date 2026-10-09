import { DEVICES, getDevice, type PresetId } from '../../../packages/home-scene/src/data';
import type { Device, HomeState, Scene } from '../../store/useHomeStore';
import { resolveModelSceneAccess } from '../three-d-home/modelSceneAccess';
import { isModelHome } from '../three-d-home/modelHomeScope';
import { canManageScenes } from './sceneManagement';

export type StarterScene = { id: PresetId; name: string; description: string; draft: Omit<Scene, 'id'>; available: boolean };
type StarterTarget = { id: string; patch: Partial<Device> };
const interiorLights = DEVICES.filter((device) => device.kind === 'light' && !['grounds', 'utility'].includes(device.roomId));

/** Starter scenes change only explicit comfort controls, preserving security, safety and exterior lighting. */
function starterTargets(id: PresetId): StarterTarget[] {
  if (id === 'morning') return [
    { id: 'master-blinds', patch: { openPercent: 100 } },
    ...['living-light', 'kitchen-light', 'dining-light'].map((id) => ({ id, patch: { isOn: true, brightness: 65, colorTempK: 3500 } })),
  ];
  if (id === 'movie') return [
    { id: 'family-tv', patch: { isOn: true, volume: 25 } },
    { id: 'family-light', patch: { isOn: true, brightness: 15, colorTempK: 2700 } },
    { id: 'living-light', patch: { isOn: true, brightness: 20, colorTempK: 2700 } },
  ];
  if (id === 'night') return [
    ...['living-light', 'family-light', 'kitchen-light', 'dining-light', 'master-light'].map((id) => ({ id, patch: { isOn: false } })),
    ...['master-bedside-left', 'master-bedside-right'].map((id) => ({ id, patch: { isOn: true, brightness: 15, colorTempK: 2700 } })),
    { id: 'family-tv', patch: { isOn: false } },
    { id: 'master-blinds', patch: { openPercent: 0 } },
    { id: 'master-ac', patch: { isOn: true, tempC: 23 } },
  ];
  return [
    ...interiorLights.map(({ id }) => ({ id, patch: { isOn: false } })),
    { id: 'family-tv', patch: { isOn: false } },
    ...DEVICES.filter((device) => device.kind === 'ac').map(({ id }) => ({ id, patch: { isOn: false } })),
  ];
}

const starters = [
  { id: 'morning', name: 'Good morning', description: 'Open bedroom blinds and brighten the shared spaces.' },
  { id: 'movie', name: 'Movie time', description: 'Family TV on, with warm and softly dimmed lights.' },
  { id: 'night', name: 'Good night', description: 'Quiet shared spaces, low bedside lights and bedroom comfort.' },
  { id: 'away', name: 'Away', description: 'Interior lights, TV and cooling off. Security stays as you set it.' },
] as const;

/** Build fresh drafts only for explicitly bound virtual devices the member can control now. */
export function availableStarterScenes(state: HomeState): StarterScene[] {
  const demo = isModelHome(state);
  const allowed = new Set(resolveModelSceneAccess(state).controllableDeviceIds);
  const bindings = new Map(state.devices.flatMap((device) => {
    const id = demo ? device.id : device.simulationOnly ? device.modelDeviceId : undefined;
    return id && getDevice(id)?.kind === device.kind && allowed.has(id) ? [[id, device.id] as const] : [];
  }));
  const authorized = canManageScenes(state);
  return starters.map((starter) => {
    const targets = starterTargets(starter.id);
    const actions = targets.flatMap((target) => {
      const deviceId = bindings.get(target.id);
      return deviceId ? [{ type: 'patch' as const, deviceId, patch: { ...target.patch } }] : [];
    });
    // Never silently advertise a partial starter as its full promised atmosphere.
    const available = authorized && actions.length === targets.length;
    return { ...starter, available, draft: { name: starter.name, roomId: '', scope: 'home', actions } };
  });
}
