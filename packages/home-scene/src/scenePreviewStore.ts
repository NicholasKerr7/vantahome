import { create } from 'zustand';
import type { ScenePreviewPayload } from './scenePreviewProtocol';
import type { DeviceStates } from './simulationTypes';

export interface ActiveScenePreview {
  id: number;
  payload: ScenePreviewPayload;
  proposed: DeviceStates;
  accessSignature: string;
  scope: string;
  affectedSignatures: Record<string, string>;
}
interface ScenePreviewStore {
  active: ActiveScenePreview | null;
  comparison: 'current' | 'proposed';
}

/** Ephemeral display state has no persistence, command transport or canonical store dependency. */
export const useScenePreviewStore = create<ScenePreviewStore>(() => ({ active: null, comparison: 'proposed' }));

/** Guard ordinary scene controls while a proposal is displayed, without calling their setters. */
export function guardScenePreviewControl<Args extends unknown[]>(action: (...args: Args) => void): (...args: Args) => void {
  return (...args) => { if (!useScenePreviewStore.getState().active) action(...args); };
}
