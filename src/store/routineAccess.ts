import { runtimePolicy } from "../config/runtimeMode";
import { sceneIsVisible } from "../features/scenes/sceneScope";
import { roleHasPermission } from "../security/permissions";
import type { Device, HomeState, HouseholdMember, Room, Scene } from "./useHomeStore";
import type { RoutineDraft } from "./routineModel";

type RoutineDirectory = {
  devices: readonly Device[];
  rooms: readonly Room[];
  scenes: readonly Scene[];
  household: readonly HouseholdMember[];
};

/** Read-only capability shared by controls and synchronous store mutation guards. */
export function canManageRoutines(state: HomeState): boolean {
  if (state.accountUserId && (!state.membershipReady ||
    state.authenticatedUserId !== state.accountUserId || !state.activeHomeId)) return false;
  if (runtimePolicy.requireRealTransport && (!state.membershipReady ||
    !state.authenticatedUserId || !state.activeHomeId)) return false;
  const member = state.household.find((candidate) => candidate.id === state.activeMemberId);
  if (!member) return false;
  const overrides = state.memberPermissionOverrides.filter((item) => item.memberId === member.id);
  return roleHasPermission(member.role, "automation.manage", overrides);
}

/** Reject stale or delegated writes before a persisted routine can be changed. */
export function assertCanManageRoutines(state: HomeState): void {
  if (!canManageRoutines(state)) throw new Error("Your household access does not allow managing routines.");
}

/** Validate every reference against the caller's current visible household directory. */
export function assertRoutineReferences(routine: RoutineDraft, directory: RoutineDirectory): void {
  const devices = new Set(directory.devices.map(({ id }) => id));
  const scenes = new Set(directory.scenes.filter((scene) =>
    sceneIsVisible(scene, directory.rooms, directory.devices),
  ).map(({ id }) => id));
  const members = new Set(directory.household.map(({ id }) => id));
  for (const part of [...routine.triggers, ...routine.conditions, ...routine.actions]) {
    if ("deviceId" in part && !devices.has(part.deviceId)) {
      throw new Error("A routine device is unavailable or outside your household access.");
    }
    if ("sceneId" in part && !scenes.has(part.sceneId)) {
      throw new Error("A routine scene is unavailable or outside your household access.");
    }
    if ("memberId" in part && !members.has(part.memberId)) {
      throw new Error("A person in this routine is no longer part of the household.");
    }
  }
}
