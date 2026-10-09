import { runtimePolicy, type RuntimeMode } from '../../config/runtimeMode';
import { hasCurrentMembershipAccess } from '../../security/guestAccess';
import { roleHasPermission } from '../../security/permissions';
import { selectVisibleDevices, selectVisibleRooms, type HomeState, type Scene } from '../../store/useHomeStore';
import { sceneIsVisible } from './sceneScope';

/** Scene editing and one-touch execution use the same current household authority. */
export function canManageScenes(state: HomeState, mode: RuntimeMode = runtimePolicy.mode): boolean {
  const member = state.household.find((entry) => entry.id === state.activeMemberId);
  if (!member || !hasCurrentMembershipAccess(member)) return false;
  const account = Boolean(state.accountUserId || state.authenticatedUserId || state.accountHomeId || state.activeHomeId);
  if (account ? !state.membershipReady || !state.accountUserId || !state.activeHomeId
    || state.accountUserId !== state.authenticatedUserId || state.accountHomeId !== state.activeHomeId
    || (member.userId ?? member.id) !== state.authenticatedUserId : mode !== 'demo') return false;
  const overrides = state.memberPermissionOverrides.filter((entry) => entry.memberId === member.id);
  return roleHasPermission(member.role, 'automation.manage', overrides)
    && roleHasPermission(member.role, 'device.view', overrides);
}

/** Recheck scope at the mutation boundary rather than trusting a previously opened editor. */
export function assertSceneWriteAccess(state: HomeState, scene: Scene | Omit<Scene, 'id'>): void {
  if (!canManageScenes(state)) throw new Error('Your current access does not allow managing scenes.');
  if (!scene.name.trim() || !scene.actions.length || !sceneIsVisible({ ...scene, id: 'draft' }, selectVisibleRooms(state), selectVisibleDevices(state))) {
    throw new Error('A scene device or room is unavailable. Review the scene before saving.');
  }
}

/** Deleting a scene pauses dependent routines instead of leaving an enabled broken action. */
export function removeSceneState(state: HomeState, sceneId: string): Partial<HomeState> {
  const scene = state.scenes.find((entry) => entry.id === sceneId);
  if (!scene) return {};
  if (!canManageScenes(state)) throw new Error('Your current access does not allow managing scenes.');
  return {
    scenes: state.scenes.filter((entry) => entry.id !== sceneId),
    activeSceneId: state.activeSceneId === sceneId ? null : state.activeSceneId,
    lastSceneRun: state.lastSceneRun?.sceneId === sceneId ? null : state.lastSceneRun,
    flows: state.flows.map((flow) => flow.triggers.some((trigger) => trigger.type === 'scene' && trigger.sceneId === sceneId)
      || flow.actions.some((action) => action.type === 'run-scene' && action.sceneId === sceneId)
      ? { ...flow, enabled: false } : flow),
  };
}
