import type { HomeState, Scene } from '../../store/useHomeStore';
import { isModelHome } from '../three-d-home/modelHomeScope';
import { modelSimulationScope } from '../three-d-home/modelSceneAccess';
import type { SceneRestorationDescriptor } from './sceneRestorationModel';

let runSequence = 0;
const processNonce = Math.random().toString(36).slice(2, 12);

/** Persist restoration ownership across session refreshes without sharing it across members or households. */
export function sceneRestorationIdentity(state: HomeState): string {
  return JSON.stringify([state.accountUserId, state.authenticatedUserId, state.accountHomeId, state.activeHomeId, state.activeMemberId]);
}

/** Use the existing canonical simulation record; no parallel device cache is created for scene history. */
export function sceneRestorationScope(state: HomeState): string {
  return isModelHome(state) ? 'demo' : modelSimulationScope(state, false);
}

/** Give each explicit run a unique receipt, including repeated runs of the same saved scene. */
export function createSceneReceiptDescriptor(state: HomeState, scene: Pick<Scene, 'id' | 'name'>): SceneRestorationDescriptor {
  const createdAt = Date.now();
  return { identityKey: sceneRestorationIdentity(state), runId: `scene-run:${createdAt}:${processNonce}:${++runSequence}`,
    sceneId: scene.id, sceneName: scene.name.replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, 160) || 'Scene', createdAt };
}
