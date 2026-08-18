import { deviceClient } from "./deviceClient";
import { sendLocalNotification } from "./notifications";
import {
  useHomeStore,
  type AutomationFlow,
  type AutomationRule,
  type FlowAction,
  type FlowCondition,
  type Weekday,
} from "../store/useHomeStore";

type FlowRuntimeOptions = {
  flowCooldownMs?: number;
  timeTickMs?: number;
};

const WEEKDAYS: Weekday[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function startFlowRuntime(options: FlowRuntimeOptions = {}) {
  const flowCooldownMs = options.flowCooldownMs ?? 10_000;
  const timeTickMs = options.timeTickMs ?? 15_000;

  const lastFlowRun = new Map<string, number>();
  const lastTimeTrigger = new Map<string, string>();
  const lastRuleRun = new Map<string, string>();
  const running = new Set<string>();

  let deviceState = snapshotDeviceState(useHomeStore.getState().devices);
  let presenceState = snapshotPresence(useHomeStore.getState().household);

  const stateUnsub = useHomeStore.subscribe((state, prev) => {
    if (state.devices !== prev.devices) {
      const flows = useHomeStore.getState().flows;
      state.devices.forEach((device) => {
        const prevOn = deviceState.get(device.id);
        if (prevOn === device.isOn) return;
        deviceState.set(device.id, device.isOn);
        flows.forEach((flow) => {
          if (!flow.enabled) return;
          flow.triggers.forEach((trigger, idx) => {
            if (trigger.type !== "device") return;
            if (trigger.deviceId !== device.id) return;
            if (device.isOn !== (trigger.state === "on")) return;
            runFlow(
              flow,
              flowCooldownMs,
              running,
              lastFlowRun,
              `device-${idx}`,
            );
          });
        });
      });
    }

    if (state.household !== prev.household) {
      const flows = useHomeStore.getState().flows;
      state.household.forEach((member) => {
        const prevStatus = presenceState.get(member.id);
        if (prevStatus === member.status) return;
        presenceState.set(member.id, member.status);
        flows.forEach((flow) => {
          if (!flow.enabled) return;
          flow.triggers.forEach((trigger, idx) => {
            if (trigger.type !== "presence") return;
            if (trigger.memberId !== member.id) return;
            if (trigger.status !== member.status) return;
            runFlow(
              flow,
              flowCooldownMs,
              running,
              lastFlowRun,
              `presence-${idx}`,
            );
          });
        });
      });
    }

    if (state.lastSceneRun && state.lastSceneRun !== prev.lastSceneRun) {
      const flows = useHomeStore.getState().flows;
      flows.forEach((flow) => {
        if (!flow.enabled) return;
        flow.triggers.forEach((trigger, idx) => {
          if (trigger.type !== "scene") return;
          if (trigger.sceneId !== state.lastSceneRun?.sceneId) return;
          runFlow(flow, flowCooldownMs, running, lastFlowRun, `scene-${idx}`);
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
        )
          return;
        const triggerKey = `${flow.id}:${idx}`;
        if (lastTimeTrigger.get(triggerKey) === minuteKey) return;
        if (!conditionsPass(flow.conditions, now, state)) return;
        lastTimeTrigger.set(triggerKey, minuteKey);
        runFlow(flow, flowCooldownMs, running, lastFlowRun, `time-${idx}`);
      });
    });

    state.rules.forEach((rule) => {
      if (!rule.enabled) return;
      if (
        rule.trigger.hour !== now.getHours() ||
        rule.trigger.minute !== now.getMinutes()
      )
        return;
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

function snapshotDeviceState(devices: Array<{ id: string; isOn: boolean }>) {
  const map = new Map<string, boolean>();
  devices.forEach((d) => map.set(d.id, d.isOn));
  return map;
}

function snapshotPresence(
  members: Array<{ id: string; status: "home" | "away" }>,
) {
  const map = new Map<string, "home" | "away">();
  members.forEach((m) => map.set(m.id, m.status));
  return map;
}

function runFlow(
  flow: AutomationFlow,
  cooldownMs: number,
  running: Set<string>,
  lastFlowRun: Map<string, number>,
  _reason: string,
) {
  if (running.has(flow.id)) return;
  const now = Date.now();
  const last = lastFlowRun.get(flow.id) ?? 0;
  if (now - last < cooldownMs) return;

  const state = useHomeStore.getState();
  if (!conditionsPass(flow.conditions, new Date(), state)) return;

  running.add(flow.id);
  lastFlowRun.set(flow.id, now);

  void executeActions(flow.actions).finally(() => {
    running.delete(flow.id);
  });
}

function conditionsPass(
  conditions: FlowCondition[],
  now: Date,
  state: ReturnType<typeof useHomeStore.getState>,
) {
  if (!conditions.length) return true;
  const deviceMap = new Map(state.devices.map((d) => [d.id, d]));
  const day = WEEKDAYS[now.getDay()];
  const minutes = now.getHours() * 60 + now.getMinutes();

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
        return device.isOn === (condition.state === "on");
      }
      case "day":
        return condition.days.includes(day);
      default:
        return true;
    }
  });
}

async function executeActions(actions: FlowAction[]) {
  for (const action of actions) {
    if (action.type === "delay") {
      const seconds = Number.isFinite(action.seconds)
        ? Math.max(1, action.seconds)
        : 1;
      await sleep(seconds * 1000);
      continue;
    }
    if (action.type === "toggle") {
      await deviceClient.sendCommand({
        op: "toggle",
        deviceId: action.deviceId,
        on: action.on,
      });
      continue;
    }
    if (action.type === "set-ac") {
      await deviceClient.sendCommand({
        op: "set-temp",
        deviceId: action.deviceId,
        value: action.tempC,
        mode: action.mode,
      });
      continue;
    }
    if (action.type === "set-brightness") {
      await deviceClient.sendCommand({
        op: "set-brightness",
        deviceId: action.deviceId,
        value: action.brightness,
      });
      continue;
    }
    if (action.type === "run-scene") {
      useHomeStore.getState().runScene(action.sceneId);
      continue;
    }
    if (action.type === "notify") {
      await sendLocalNotification("VantaHome automation", action.message, {
        kind: "automation",
      });
    }
  }
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
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}-${hh}:${mm}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
