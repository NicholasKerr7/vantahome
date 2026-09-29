import { canManageRoutines, routineId, type RoutineDraft } from "./routines";
import { useHomeStore, type HouseholdMember } from "./useHomeStore";

const seed = useHomeStore.getState();
const draft: RoutineDraft = {
  name: "Evening lights", enabled: true,
  triggers: [{ type: "time", hour: 18, minute: 30 }], conditions: [],
  actions: [{ type: "toggle", deviceId: "d2", on: true }],
};

beforeEach(() => useHomeStore.setState({ ...seed, rules: [], flows: [] }));

/** Change only the active actor so the ordinary demo device registry remains intact. */
function setRole(role: HouseholdMember["role"]): void {
  useHomeStore.setState({
    household: [{ id: "actor", name: "Actor", role, status: "home" }],
    activeMemberId: "actor", memberPermissionOverrides: [],
    roomMembers: [{ memberId: "actor", roomIds: seed.rooms.map(({ id }) => id) }],
  });
}

it.each(["Owner", "Admin", "Member"] as const)("allows the normal %s role to manage routines", (role) => {
  setRole(role);
  expect(canManageRoutines(useHomeStore.getState())).toBe(true);
  const id = useHomeStore.getState().addRoutine(draft);
  useHomeStore.getState().updateRoutine(id, { name: "Updated" });
  useHomeStore.getState().toggleRoutine(id);
  expect(useHomeStore.getState().flows[0]).toMatchObject({ name: "Updated", enabled: false });
  useHomeStore.getState().removeRoutine(id);
  expect(useHomeStore.getState().flows).toEqual([]);
});

it.each(["Guest", "Tenant"] as const)("rejects every new mutation path for the normal %s role", (role) => {
  const id = useHomeStore.getState().addRoutine(draft);
  setRole(role);
  const state = useHomeStore.getState();
  expect(canManageRoutines(state)).toBe(false);
  expect(() => state.addRoutine(draft)).toThrow("does not allow managing routines");
  expect(() => state.updateRoutine(id, { enabled: false })).toThrow("does not allow managing routines");
  expect(() => state.toggleRoutine(id)).toThrow("does not allow managing routines");
  expect(() => state.removeRoutine(id)).toThrow("does not allow managing routines");
  expect(() => state.quickScheduleDevice("d2", { hour: 7, minute: 0 })).toThrow("does not allow managing routines");
  expect(useHomeStore.getState().flows).toBe(state.flows);
  expect(useHomeStore.getState().rules).toBe(state.rules);
});

it("rechecks a revoked permission immediately without mutating a legacy record", () => {
  setRole("Member");
  useHomeStore.setState({ rules: [{ id: "legacy", name: "Existing", enabled: true,
    trigger: { type: "time", hour: 7, minute: 0 }, action: { type: "toggle", deviceId: "d2", on: true } }] });
  const legacy = useHomeStore.getState().rules;
  expect(canManageRoutines(useHomeStore.getState())).toBe(true);
  useHomeStore.setState({ memberPermissionOverrides: [{ memberId: "actor", permission: "automation.manage", allowed: false }] });
  expect(canManageRoutines(useHomeStore.getState())).toBe(false);
  expect(() => useHomeStore.getState().toggleRoutine(routineId("rule", "legacy"))).toThrow("does not allow managing routines");
  expect(() => useHomeStore.getState().updateRoutine(routineId("rule", "legacy"), { name: "Changed" })).toThrow("does not allow managing routines");
  expect(useHomeStore.getState().rules).toBe(legacy);
  expect(useHomeStore.getState().flows).toEqual([]);
});

it("rejects writes against stale membership or a different authenticated account", () => {
  useHomeStore.setState({ accountUserId: "account", authenticatedUserId: "account", activeHomeId: "home", membershipReady: false });
  expect(() => useHomeStore.getState().addRoutine(draft)).toThrow("does not allow managing routines");
  useHomeStore.setState({ membershipReady: true, authenticatedUserId: "other-account" });
  expect(() => useHomeStore.getState().addRoutine(draft)).toThrow("does not allow managing routines");
  useHomeStore.setState({ authenticatedUserId: "account" });
  expect(canManageRoutines(useHomeStore.getState())).toBe(true);
});

it("rejects missing device, scene, and household references before persistence", () => {
  const state = useHomeStore.getState();
  expect(() => state.addRoutine({ ...draft, actions: [{ type: "toggle", deviceId: "removed", on: true }] })).toThrow("routine device");
  expect(() => state.addRoutine({ ...draft, actions: [{ type: "run-scene", sceneId: "removed" }] })).toThrow("routine scene");
  expect(() => state.addRoutine({ ...draft, triggers: [{ type: "presence", memberId: "removed", status: "home" }] })).toThrow("no longer part of the household");
  expect(useHomeStore.getState().flows).toEqual([]);
});

it("rechecks visible device access when permission changes after the editor opened", () => {
  setRole("Member");
  const id = useHomeStore.getState().addRoutine(draft);
  const before = useHomeStore.getState().flows;
  useHomeStore.setState({ memberPermissionOverrides: [{ memberId: "actor", permission: "device.view", allowed: false }] });
  expect(canManageRoutines(useHomeStore.getState())).toBe(true);
  expect(() => useHomeStore.getState().updateRoutine(id, { name: "Stale editor" })).toThrow("routine device");
  expect(useHomeStore.getState().flows).toBe(before);
});

it("validates room scope even for an empty referenced scene", () => {
  const visible = seed.devices.find((device) => device.id === "d2")!;
  const hiddenRoom = seed.rooms.find((room) => room.id !== visible.roomId)!;
  setRole("Guest");
  useHomeStore.setState({
    memberPermissionOverrides: [{ memberId: "actor", permission: "automation.manage", allowed: true }],
    roomMembers: [{ memberId: "actor", roomIds: [visible.roomId] }],
    scenes: [{ id: "private", roomId: hiddenRoom.id, name: "Private scene", actions: [] }],
  });
  expect(canManageRoutines(useHomeStore.getState())).toBe(true);
  expect(() => useHomeStore.getState().addRoutine({ ...draft, actions: [{ type: "run-scene", sceneId: "private" }] })).toThrow("routine scene");
});
