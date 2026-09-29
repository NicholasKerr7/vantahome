import { selectVisibleDevices, selectVisibleRooms, type HomeState } from "./useHomeStore";
import { sceneIsVisible } from "../features/scenes/sceneScope";
import { selectRoutines, type Routine } from "./routineModel";

export { canManageRoutines } from "./routineAccess";
export { routineId, selectRoutines } from "./routineModel";
export type { Routine, RoutineDraft } from "./routineModel";

const visibleCache = new WeakMap<HomeState, Routine[]>();

/** Hide routines whose device or scene references cross the current access scope. */
export function selectVisibleRoutines(state: HomeState): Routine[] {
  const cached = visibleCache.get(state);
  if (cached) return cached;
  if ((state.accountUserId && !state.membershipReady) || !state.household.some((member) => member.id === state.activeMemberId)) {
    const hidden: Routine[] = [];
    visibleCache.set(state, hidden);
    return hidden;
  }
  const devices = selectVisibleDevices(state);
  const rooms = selectVisibleRooms(state);
  const deviceIds = new Set(devices.map(({ id }) => id));
  const accessibleScenes = new Set(state.scenes.filter((scene) =>
    sceneIsVisible(scene, rooms, devices),
  ).map(({ id }) => id));
  const routines = selectRoutines(state).filter((routine) =>
    [...routine.triggers, ...routine.conditions, ...routine.actions].every((part) => {
      if ("deviceId" in part) return deviceIds.has(part.deviceId);
      if ("sceneId" in part) return accessibleScenes.has(part.sceneId);
      return true;
    }),
  );
  visibleCache.set(state, routines);
  return routines;
}
