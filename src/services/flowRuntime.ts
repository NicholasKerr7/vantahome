import { deviceClient } from "./deviceClient";
import { sendLocalNotification } from "./notifications";
import { useHomeStore, type FlowCondition, type HomeState, type Weekday } from "../store/useHomeStore";
import { runtimePolicy } from "../config/runtimeMode";
import { roleHasPermission } from "../security/permissions";
import { selectVisibleRoutines, type Routine } from "../store/routines";

type FlowRuntimeOptions = {
  flowCooldownMs?: number;
  timeTickMs?: number;
};

type RuntimeScope = Pick<HomeState, "authenticatedUserId" | "activeHomeId" | "sessionEpoch" | "activeMemberId">;
const WEEKDAYS: Weekday[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Start the foreground preview executor; a hub remains necessary for always-on operation. */
export function startFlowRuntime(options: FlowRuntimeOptions = {}) {
  const cooldownMs = options.flowCooldownMs ?? 10_000;
  const lastRun = new Map<string, number>();
  const lastTimeTrigger = new Map<string, string>();
  const running = new Map<string, AbortController>();
  const lifetime = new AbortController();
  const initial = useHomeStore.getState();
  const scope: RuntimeScope = {
    authenticatedUserId: initial.authenticatedUserId,
    activeHomeId: initial.activeHomeId,
    sessionEpoch: initial.sessionEpoch,
    activeMemberId: initial.activeMemberId,
  };
  let deviceState = new Map(initial.devices.map((device) => [device.id, device.isOn]));
  let presenceState = new Map(initial.household.map((member) => [member.id, member.status]));

  /** All triggers share the same canonical identity, cooldown and action dispatcher. */
  const run = (routine: Routine) => {
    if (!scopeIsCurrent(scope, lifetime.signal) || running.has(routine.id)) return;
    const now = Date.now();
    const previousRun = lastRun.get(routine.id);
    if (previousRun !== undefined && now - previousRun < cooldownMs) return;
    if (!conditionsPass(routine.conditions, new Date(), useHomeStore.getState())) return;
    const execution = new AbortController();
    const cancel = () => execution.abort();
    lifetime.signal.addEventListener("abort", cancel, { once: true });
    running.set(routine.id, execution);
    lastRun.set(routine.id, now);
    // A disabled run stays cancelled even if the routine is enabled again quickly.
    const finish = () => {
      lifetime.signal.removeEventListener("abort", cancel);
      if (running.get(routine.id) === execution) running.delete(routine.id);
    };
    void executeActions(routine, scope, execution.signal).then(finish, finish);
  };

  const stateUnsub = useHomeStore.subscribe((state, previous) => {
    if (!scopeIsCurrent(scope, lifetime.signal)) {
      running.forEach((execution) => execution.abort());
      return;
    }
    const routines = selectVisibleRoutines(state);
    for (const [id, execution] of running) {
      if (!routines.some((routine) => routine.id === id && routine.enabled)) {
        execution.abort();
        running.delete(id);
      }
    }
    const changedDevices = state.devices === previous.devices ? [] : state.devices.filter((device) =>
      deviceState.has(device.id) && deviceState.get(device.id) !== device.isOn,
    );
    const changedMembers = state.household === previous.household ? [] : state.household.filter((member) =>
      presenceState.has(member.id) && presenceState.get(member.id) !== member.status,
    );
    // Snapshot first: a device command may synchronously cause another store update.
    if (state.devices !== previous.devices) deviceState = new Map(state.devices.map((device) => [device.id, device.isOn]));
    if (state.household !== previous.household) presenceState = new Map(state.household.map((member) => [member.id, member.status]));
    const sceneId = state.lastSceneRun !== previous.lastSceneRun ? state.lastSceneRun?.sceneId : undefined;
    if (!changedDevices.length && !changedMembers.length && !sceneId) return;
    for (const routine of routines) {
      if (!routine.enabled) continue;
      const matches = routine.triggers.some((trigger) => {
        if (trigger.type === "device") return changedDevices.some((device) =>
          device.id === trigger.deviceId && device.isOn === (trigger.state === "on"),
        );
        if (trigger.type === "presence") return changedMembers.some((member) =>
          member.id === trigger.memberId && member.status === trigger.status,
        );
        return trigger.type === "scene" && trigger.sceneId === sceneId;
      });
      if (matches) run(routine);
    }
  });

  /** One minute marker covers all matching triggers, including promoted schedules. */
  const tick = () => {
    if (!scopeIsCurrent(scope, lifetime.signal)) return;
    const now = new Date();
    const minuteKey = timeKey(now);
    const state = useHomeStore.getState();
    for (const routine of selectVisibleRoutines(state)) {
      if (!routine.enabled || lastTimeTrigger.get(routine.id) === minuteKey) continue;
      const matches = routine.triggers.some((trigger) => trigger.type === "time" &&
        trigger.hour === now.getHours() && trigger.minute === now.getMinutes(),
      );
      if (!matches || !conditionsPass(routine.conditions, now, state)) continue;
      lastTimeTrigger.set(routine.id, minuteKey);
      run(routine);
    }
  };
  const timer = setInterval(tick, options.timeTickMs ?? 15_000);
  tick();
  return () => {
    lifetime.abort();
    clearInterval(timer);
    stateUnsub();
  };
}

/** Fence delayed work to the account, home and actor that started this runtime. */
function scopeIsCurrent(scope: RuntimeScope, signal: AbortSignal): boolean {
  const state = useHomeStore.getState();
  if (signal.aborted || scope.authenticatedUserId !== state.authenticatedUserId ||
    scope.activeHomeId !== state.activeHomeId || scope.sessionEpoch !== state.sessionEpoch ||
    scope.activeMemberId !== state.activeMemberId) return false;
  const localDemo = runtimePolicy.allowUnauthenticatedDemo && !state.accountUserId &&
    !state.authenticatedUserId && !state.activeHomeId;
  const verifiedMembership = state.membershipReady && Boolean(state.authenticatedUserId && state.activeHomeId) &&
    (!state.accountUserId || state.accountUserId === state.authenticatedUserId);
  if (!localDemo && !verifiedMembership) return false;
  const member = state.household.find((candidate) => candidate.id === state.activeMemberId);
  if (!member) return false;
  const overrides = state.memberPermissionOverrides.filter((item) => item.memberId === member.id);
  // Execution may serve read-only members, but cannot observe a revoked household view.
  return roleHasPermission(member.role, "device.view", overrides);
}

/** Conditions are ANDed; overnight ranges intentionally wrap across midnight. */
function conditionsPass(conditions: FlowCondition[], now: Date, state: HomeState): boolean {
  const devices = new Map(state.devices.map((device) => [device.id, device]));
  const day = WEEKDAYS[now.getDay()];
  const minutes = now.getHours() * 60 + now.getMinutes();
  return conditions.every((condition) => {
    switch (condition.type) {
      case "time-range": {
        const start = condition.startHour * 60 + condition.startMinute;
        const end = condition.endHour * 60 + condition.endMinute;
        return start <= end ? minutes >= start && minutes <= end : minutes >= start || minutes <= end;
      }
      case "device": {
        const device = devices.get(condition.deviceId);
        return Boolean(device && device.isOn === (condition.state === "on"));
      }
      case "day": return condition.days.includes(day);
    }
  });
}

/** Sequential actions retain the normal command authorization and scene boundaries. */
async function executeActions(routine: Routine, scope: RuntimeScope, signal: AbortSignal) {
  for (const action of routine.actions) {
    if (!scopeIsCurrent(scope, signal)) return;
    const current = selectVisibleRoutines(useHomeStore.getState()).find((item) => item.id === routine.id);
    if (!current?.enabled) return;
    switch (action.type) {
      case "delay":
        await sleep((Number.isFinite(action.seconds) ? Math.max(1, action.seconds) : 1) * 1000, signal);
        break;
      case "toggle":
        await deviceClient.sendCommand({ op: "toggle", deviceId: action.deviceId, on: action.on });
        break;
      case "set-ac":
        await deviceClient.sendCommand({ op: "set-temp", deviceId: action.deviceId, value: action.tempC, mode: action.mode });
        break;
      case "set-brightness":
        await deviceClient.sendCommand({ op: "set-brightness", deviceId: action.deviceId, value: action.brightness });
        break;
      case "run-scene":
        await useHomeStore.getState().runScene(action.sceneId, { signal });
        break;
      case "notify":
        await sendLocalNotification("VantaHome routine", action.message, { kind: "automation" }, {
          shouldSend: () => scopeIsCurrent(scope, signal) && Boolean(
            selectVisibleRoutines(useHomeStore.getState()).find((item) => item.id === routine.id)?.enabled,
          ),
        });
        break;
    }
  }
}

/** Local date keys preserve existing wall-clock schedule semantics. */
function timeKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}:${now.getMinutes()}`;
}

/** Abortable delays stop immediately when the foreground session ends. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    if (signal.aborted) done();
  });
}
