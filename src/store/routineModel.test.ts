import { routineId, selectRoutines, selectVisibleRoutines, type RoutineDraft } from "./routines";
import { useHomeStore, type AutomationRule, type AutomationFlow } from "./useHomeStore";

const seed = useHomeStore.getState();
const rule: AutomationRule = {
  id: "same:id/with % characters",
  name: "Evening light",
  enabled: true,
  trigger: { type: "time", hour: 18, minute: 30 },
  action: { type: "toggle", deviceId: "d2", on: true },
};
const draft: RoutineDraft = {
  name: "Evening",
  enabled: true,
  triggers: [{ type: "time", hour: 18, minute: 30 }],
  conditions: [{ type: "day", days: ["Mon", "Tue"] }],
  actions: [{ type: "toggle", deviceId: "d2", on: true }],
};
const flow: AutomationFlow = { ...draft, id: rule.id };

beforeEach(() => useHomeStore.setState({ ...seed, rules: [rule], flows: [flow] }));
afterEach(() => jest.restoreAllMocks());

describe("canonical routines", () => {
  it("adapts legacy rules losslessly and keeps identical raw flow IDs distinct", () => {
    const state = useHomeStore.getState();
    const routines = selectRoutines(state);
    expect(routines).toHaveLength(2);
    expect(routines[0]).toMatchObject({
      id: routineId("rule", rule.id), name: rule.name, enabled: true,
      triggers: [rule.trigger], conditions: [], actions: [rule.action],
    });
    expect(routines[1].id).not.toBe(routines[0].id);
    expect(selectRoutines(state)).toBe(routines);
    expect(state.rules).toEqual([rule]);
    expect(state.flows).toEqual([flow]);
  });

  it("promotes an edited schedule atomically with stable identity and no duplicate", () => {
    const id = routineId("rule", rule.id);
    useHomeStore.getState().updateRoutine(id, {
      conditions: draft.conditions,
      actions: [...draft.actions, { type: "delay", seconds: 12 }, { type: "notify", message: "Evening ready" }],
    });
    let state = useHomeStore.getState();
    expect(state.rules).toEqual([]);
    expect(state.flows).toHaveLength(2);
    let routine = selectRoutines(state).find((item) => item.id === id)!;
    expect(routine.name).toBe(rule.name);
    expect(routine.triggers).toEqual([rule.trigger]);
    expect(routine.conditions).toEqual(draft.conditions);
    expect(routine.actions).toHaveLength(3);
    // Editing again updates the same record rather than adding another promotion.
    state.updateRoutine(id, { name: "Whole house evening" });
    state.toggleRoutine(id);
    state = useHomeStore.getState();
    routine = selectRoutines(state).find((item) => item.id === id)!;
    expect(routine.name).toBe("Whole house evening");
    expect(routine.enabled).toBe(false);
    expect(state.flows).toHaveLength(2);
    state.removeRoutine(id);
    expect(selectRoutines(useHomeStore.getState())).toHaveLength(1);
    expect(useHomeStore.getState().flows[0]).toEqual(flow);
  });

  it("retains paused legacy settings through repeated toggles and a partial edit", () => {
    const legacy: AutomationRule = {
      ...rule,
      enabled: false,
      action: { type: "set-ac", deviceId: "d1", tempC: 23, mode: "fan" },
    };
    useHomeStore.setState({ rules: [legacy], flows: [] });
    const id = routineId("rule", legacy.id);
    useHomeStore.getState().toggleRoutine(id);
    expect(selectRoutines(useHomeStore.getState())[0].enabled).toBe(true);
    useHomeStore.getState().toggleRoutine(id);
    useHomeStore.getState().updateRoutine(id, { name: "Renamed schedule" });
    const saved = selectRoutines(useHomeStore.getState())[0];
    expect(saved).toMatchObject({ id, enabled: false, triggers: [legacy.trigger], actions: [legacy.action] });
    expect(useHomeStore.getState().rules).toHaveLength(0);
    expect(useHomeStore.getState().flows).toHaveLength(1);
  });

  it("preserves promoted identity through persisted JSON round trips", () => {
    const id = routineId("rule", rule.id);
    useHomeStore.getState().updateRoutine(id, { conditions: draft.conditions });
    const state = useHomeStore.getState();
    const restored = JSON.parse(JSON.stringify({ rules: state.rules, flows: state.flows })) as Pick<typeof state, "rules" | "flows">;
    expect(selectRoutines(restored)).toEqual(selectRoutines(state));
  });

  it("does not execute a legacy backup alias in addition to its promoted record", () => {
    const promoted = { ...flow, id: "promoted", legacyRuleId: rule.id };
    useHomeStore.setState({ rules: [rule], flows: [promoted] });
    expect(selectRoutines(useHomeStore.getState())).toHaveLength(1);
    useHomeStore.getState().removeRoutine(routineId("rule", rule.id));
    expect(useHomeStore.getState().rules).toEqual([]);
    expect(useHomeStore.getState().flows).toEqual([]);
  });

  it("allocates collision-free IDs for simultaneous saves and protects stored drafts", () => {
    jest.spyOn(Date, "now").mockReturnValue(123);
    const first = useHomeStore.getState().addRoutine(draft);
    const second = useHomeStore.getState().addRoutine(draft);
    expect(first).not.toBe(second);
    const saved = selectRoutines(useHomeStore.getState()).find((item) => item.id === first)!;
    expect(saved.conditions[0]).not.toBe(draft.conditions[0]);
    useHomeStore.getState().removeRoutine(first);
    expect(selectRoutines(useHomeStore.getState()).some((item) => item.id === second)).toBe(true);
  });

  it("keeps source IDs immutable and treats missing IDs as harmless stale editor saves", () => {
    const before = useHomeStore.getState();
    before.updateRoutine("missing", { name: "changed" });
    before.removeRoutine("missing");
    before.toggleRoutine("missing");
    expect(useHomeStore.getState().rules).toBe(before.rules);
    expect(useHomeStore.getState().flows).toBe(before.flows);
  });

  it("filters routines with inaccessible devices or whole-house scene actions", () => {
    const device = seed.devices.find((item) => item.id === "d2")!;
    const hidden = seed.devices.find((item) => item.roomId !== device.roomId)!;
    useHomeStore.setState({
      household: [{ id: "guest", name: "Guest", role: "Guest", status: "home" }],
      activeMemberId: "guest",
      roomMembers: [{ memberId: "guest", roomIds: [device.roomId] }],
      memberPermissionOverrides: [],
      scenes: [{ id: "whole-home", scope: "home", roomId: "", name: "Evening", actions: [
        { type: "toggle", deviceId: device.id, on: true },
        { type: "toggle", deviceId: hidden.id, on: true },
      ] }, { id: "empty-private", roomId: hidden.roomId, name: "Private room", actions: [] }],
      flows: [
        flow,
        { ...flow, id: "private-trigger", triggers: [{ type: "device", deviceId: hidden.id, state: "on" }] },
        { ...flow, id: "private-scene", actions: [{ type: "run-scene", sceneId: "whole-home" }] },
        { ...flow, id: "empty-private-scene", actions: [{ type: "run-scene", sceneId: "empty-private" }] },
      ],
    });
    const state = useHomeStore.getState();
    expect(selectVisibleRoutines(state).map((item) => item.id)).toEqual([
      routineId("rule", rule.id), routineId("flow", flow.id),
    ]);
    expect(selectVisibleRoutines(state)).toBe(selectVisibleRoutines(state));
    useHomeStore.setState({ accountUserId: "account", membershipReady: false });
    expect(selectVisibleRoutines(useHomeStore.getState())).toEqual([]);
  });

  it("keeps whole-house scenes when a room is removed and devices are reassigned", () => {
    const homeScene = { id: "whole-home", scope: "home" as const, roomId: seed.rooms[1].id, name: "Evening", actions: [{ type: "toggle" as const, deviceId: "d2", on: true }] };
    useHomeStore.setState({ scenes: [homeScene] });
    useHomeStore.getState().removeRoom(seed.rooms[1].id);
    expect(useHomeStore.getState().scenes).toEqual([homeScene]);
  });
});
