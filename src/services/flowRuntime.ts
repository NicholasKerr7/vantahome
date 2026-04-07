import { deviceClient } from "./deviceClient";
import { sendLocalNotification } from "./notifications";
import { matchesSunRelation } from "./sunCycle";
import {
  useHomeStore,
  type AutomationFlow,
  type AutomationRule,
  type Device,
  type FlowAction,
  type FlowCondition,
  type FlowLeafAction,
  type FlowTrigger,
  type HouseholdMember,
  type Weekday,
} from "../store/useHomeStore";

type FlowRuntimeOptions = {
  flowCooldownMs?: number;
  timeTickMs?: number;
};

type FlowEvaluationContext = {
  openSinceByDeviceId: Map<string, number>;
};

const WEEKDAYS: Weekday[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const OPENABLE_KINDS = new Set<Device["kind"]>([
  "door",
  "window",
  "garage",
  "gate",
]);
const MAX_BRANCH_DEPTH = 5;

export function startFlowRuntime(options: FlowRuntimeOptions = {}) {
  const flowCooldownMs = options.flowCooldownMs ?? 10_000;
  const timeTickMs = options.timeTickMs ?? 15_000;

  const lastFlowRun = new Map<string, number>();
  const lastTimeTrigger = new Map<string, string>();
  const lastRuleRun = new Map<string, string>();
  const lastStatefulMatch = new Map<string, boolean>();
  const running = new Set<string>();
  const context: FlowEvaluationContext = {
    openSinceByDeviceId: snapshotOpenState(useHomeStore.getState().devices),
  };

  const syncStatefulFlows = (now = new Date(), allowFire = true) => {
    const state = useHomeStore.getState();
    state.flows.forEach((flow) => {
      if (!flow.enabled) {
        lastStatefulMatch.set(flow.id, false);
        return;
      }
      if (!flow.triggers.some(isStatefulTrigger)) return;

      const nextMatch =
        flow.triggers.some((trigger) => triggerMatchesState(trigger, state)) &&
        conditionsPass(flow.conditions, now, state, context);
      const prevMatch = lastStatefulMatch.get(flow.id) ?? false;

      if (allowFire && nextMatch && !prevMatch) {
        runFlow(flow, flowCooldownMs, running, lastFlowRun, context);
      }
      lastStatefulMatch.set(flow.id, nextMatch);
    });
  };

  syncStatefulFlows(new Date(), false);

  const stateUnsub = useHomeStore.subscribe((state, prev) => {
    if (state.devices !== prev.devices) {
      syncOpenStateMap(prev.devices, state.devices, context.openSinceByDeviceId);
      syncStatefulFlows(new Date(), true);
    }

    if (state.household !== prev.household) {
      syncStatefulFlows(new Date(), true);
    }

    if (state.flows !== prev.flows) {
      syncStatefulFlows(new Date(), false);
    }

    if (state.lastSceneRun && state.lastSceneRun !== prev.lastSceneRun) {
      const flows = useHomeStore.getState().flows;
      flows.forEach((flow) => {
        if (!flow.enabled) return;
        flow.triggers.forEach((trigger, idx) => {
          if (trigger.type !== "scene") return;
          if (trigger.sceneId !== state.lastSceneRun?.sceneId) return;
          runFlow(
            flow,
            flowCooldownMs,
            running,
            lastFlowRun,
            context,
            `scene-${idx}`,
          );
        });
      });
    }
  });

  const tick = () => {
    const now = new Date();
    const minuteKey = timeKey(now);
    const state = useHomeStore.getState();

    state.flows.forEach((flow) => {
      if (!flow.enabled) return;
      flow.triggers.forEach((trigger, idx) => {
        if (trigger.type !== "time") return;
        if (
          trigger.hour !== now.getHours() ||
          trigger.minute !== now.getMinutes()
        ) {
          return;
        }
        const triggerKey = `${flow.id}:${idx}`;
        if (lastTimeTrigger.get(triggerKey) === minuteKey) return;
        lastTimeTrigger.set(triggerKey, minuteKey);
        runFlow(
          flow,
          flowCooldownMs,
          running,
          lastFlowRun,
          context,
          `time-${idx}`,
        );
      });
    });

    syncStatefulFlows(now, true);

    state.rules.forEach((rule) => {
      if (!rule.enabled) return;
      if (
        rule.trigger.hour !== now.getHours() ||
        rule.trigger.minute !== now.getMinutes()
      ) {
        return;
      }
      if (lastRuleRun.get(rule.id) === minuteKey) return;
      lastRuleRun.set(rule.id, minuteKey);
      runRule(rule);
    });
  };

  const timer = setInterval(tick, timeTickMs);
  tick();

  return () => {
    clearInterval(timer);
    stateUnsub();
  };
}

function isStatefulTrigger(trigger: FlowTrigger) {
  return trigger.type === "device" || trigger.type === "presence";
}

function runFlow(
  flow: AutomationFlow,
  cooldownMs: number,
  running: Set<string>,
  lastFlowRun: Map<string, number>,
  context: FlowEvaluationContext,
  _reason = "stateful",
) {
  if (running.has(flow.id)) return;
  const now = Date.now();
  const last = lastFlowRun.get(flow.id) ?? 0;
  if (now - last < cooldownMs) return;

  const state = useHomeStore.getState();
  if (!conditionsPass(flow.conditions, new Date(now), state, context)) return;

  running.add(flow.id);
  lastFlowRun.set(flow.id, now);

  void executeActions(flow.actions, context, flow.name).finally(() => {
    running.delete(flow.id);
  });
}

function conditionsPass(
  conditions: FlowCondition[],
  now: Date,
  state: ReturnType<typeof useHomeStore.getState>,
  context: FlowEvaluationContext,
) {
  if (!conditions.length) return true;
  const deviceMap = new Map(state.devices.map((device) => [device.id, device]));
  const day = WEEKDAYS[now.getDay()];
  const minutes = now.getHours() * 60 + now.getMinutes();
  const household = state.household;

  return conditions.every((condition) => {
    switch (condition.type) {
      case "time-range": {
        const start = condition.startHour * 60 + condition.startMinute;
        const end = condition.endHour * 60 + condition.endMinute;
        if (start <= end) return minutes >= start && minutes <= end;
        return minutes >= start || minutes <= end;
      }
      case "device": {
        const device = deviceMap.get(condition.deviceId);
        if (!device) return false;
        return matchesDeviceState(device, condition.state);
      }
      case "day":
        return condition.days.includes(day);
      case "household":
        return matchesHouseholdCondition(household, condition.match);
      case "sun":
        return matchesSunRelation(
          now,
          {
            latitude: state.profile.presenceGeofenceLatitude,
            longitude: state.profile.presenceGeofenceLongitude,
          },
          condition.relation,
        );
      case "open-for": {
        const device = deviceMap.get(condition.deviceId);
        if (!device || !isDeviceOpen(device)) return false;
        const openSince = context.openSinceByDeviceId.get(condition.deviceId);
        if (!openSince) return false;
        return now.getTime() - openSince >= condition.minutes * 60 * 1000;
      }
      default:
        return true;
    }
  });
}

async function executeActions(
  actions: FlowAction[],
  context: FlowEvaluationContext,
  flowName: string,
  depth = 0,
) {
  if (depth > MAX_BRANCH_DEPTH) return;

  for (const action of actions) {
    if (action.type === "branch") {
      const state = useHomeStore.getState();
      const nextActions = conditionsPass(
        [action.condition],
        new Date(),
        state,
        context,
      )
        ? action.ifActions
        : (action.elseActions ?? []);
      await executeActions(nextActions, context, flowName, depth + 1);
      continue;
    }

    await executeLeafAction(action, flowName);
  }
}

async function executeLeafAction(action: FlowLeafAction, flowName: string) {
  if (action.type === "delay") {
    const seconds = Number.isFinite(action.seconds)
      ? Math.max(1, action.seconds)
      : 1;
    await sleep(seconds * 1000);
    return;
  }

  if (action.type === "toggle") {
    await deviceClient.sendCommand({
      op: "toggle",
      deviceId: action.deviceId,
      on: action.on,
    });
    return;
  }

  if (action.type === "patch") {
    await deviceClient.sendCommand({
      op: "patch",
      deviceId: action.deviceId,
      patch: action.patch,
    });
    return;
  }

  if (action.type === "set-ac") {
    await deviceClient.sendCommand({
      op: "set-temp",
      deviceId: action.deviceId,
      value: action.tempC,
      mode: action.mode,
    });
    return;
  }

  if (action.type === "set-brightness") {
    await deviceClient.sendCommand({
      op: "set-brightness",
      deviceId: action.deviceId,
      value: action.brightness,
    });
    return;
  }

  if (action.type === "run-scene") {
    useHomeStore.getState().runScene(action.sceneId);
    return;
  }

  if (action.type === "notify") {
    await sendLocalNotification(
      flowName,
      action.message,
      { kind: "automation-flow" },
      { category: "automation" },
    );
  }
}

function triggerMatchesState(
  trigger: FlowTrigger,
  state: ReturnType<typeof useHomeStore.getState>,
) {
  if (trigger.type === "presence") {
    return state.household.some(
      (member) =>
        member.id === trigger.memberId && member.status === trigger.status,
    );
  }

  if (trigger.type === "device") {
    const device = state.devices.find((item) => item.id === trigger.deviceId);
    if (!device) return false;
    return matchesDeviceState(device, trigger.state);
  }

  return false;
}

function matchesDeviceState(
  device: Pick<Device, "kind" | "isOn" | "openPercent">,
  state: "on" | "off" | "open" | "closed",
) {
  if (state === "on") return device.isOn;
  if (state === "off") return !device.isOn;
  const open = isDeviceOpen(device);
  return state === "open" ? open : !open;
}

function isDeviceOpen(device: Pick<Device, "kind" | "isOn" | "openPercent">) {
  if (OPENABLE_KINDS.has(device.kind)) {
    return (device.openPercent ?? 0) > 0;
  }
  return device.isOn;
}

function matchesHouseholdCondition(
  members: HouseholdMember[],
  match: "everyone-away" | "everyone-home" | "someone-home",
) {
  if (!members.length) return false;
  if (match === "everyone-away") {
    return members.every((member) => member.status === "away");
  }
  if (match === "everyone-home") {
    return members.every((member) => member.status === "home");
  }
  return members.some((member) => member.status === "home");
}

function snapshotOpenState(devices: Device[]) {
  const now = Date.now();
  const map = new Map<string, number>();
  devices.forEach((device) => {
    if (isDeviceOpen(device)) {
      map.set(device.id, now);
    }
  });
  return map;
}

function syncOpenStateMap(
  prevDevices: Device[],
  nextDevices: Device[],
  openSinceByDeviceId: Map<string, number>,
) {
  const prevMap = new Map(prevDevices.map((device) => [device.id, device]));
  const nextMap = new Map(nextDevices.map((device) => [device.id, device]));
  const now = Date.now();

  nextDevices.forEach((device) => {
    const prev = prevMap.get(device.id);
    const wasOpen = prev ? isDeviceOpen(prev) : false;
    const isOpen = isDeviceOpen(device);

    if (isOpen && !wasOpen) {
      openSinceByDeviceId.set(device.id, now);
      return;
    }
    if (!isOpen) {
      openSinceByDeviceId.delete(device.id);
    }
  });

  prevDevices.forEach((device) => {
    if (!nextMap.has(device.id)) {
      openSinceByDeviceId.delete(device.id);
    }
  });
}

function runRule(rule: AutomationRule) {
  if (rule.action.type === "set-ac") {
    Promise.resolve(
      deviceClient.sendCommand({
        op: "set-temp",
        deviceId: rule.action.deviceId,
        value: rule.action.tempC,
        mode: rule.action.mode,
      }),
    ).catch(() => {});
    return;
  }
  Promise.resolve(
    deviceClient.sendCommand({
      op: "toggle",
      deviceId: rule.action.deviceId,
      on: rule.action.on,
    }),
  ).catch(() => {});
}

function timeKey(now: Date) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}-${hour}:${minute}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
