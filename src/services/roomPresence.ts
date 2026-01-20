import { deviceClient } from "./deviceClient";
import { useHomeStore } from "../store/useHomeStore";

type PresenceKind = "known" | "unknown";
type PresenceSource = "camera" | "motion" | "sensor";

type PresenceEvent = {
  roomId?: string | null;
  deviceId?: string | null;
  kind: PresenceKind;
  source: PresenceSource;
};

const ROOM_IDLE_MS = 5000;

const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();
const roomAutoLights = new Map<string, Set<string>>();

function resolveRoomId(event: PresenceEvent) {
  if (event.roomId) return event.roomId;
  if (!event.deviceId) return null;
  const device = useHomeStore
    .getState()
    .devices.find((d) => d.id === event.deviceId);
  return device?.roomId ?? null;
}

function clearRoomTimer(roomId: string) {
  const timer = roomTimers.get(roomId);
  if (!timer) return;
  clearTimeout(timer);
  roomTimers.delete(roomId);
}

function scheduleRoomIdle(roomId: string) {
  clearRoomTimer(roomId);
  const timer = setTimeout(() => {
    roomTimers.delete(roomId);
    const state = useHomeStore.getState();
    const autoLights = roomAutoLights.get(roomId);
    if (!autoLights || autoLights.size === 0) return;
    autoLights.forEach((lightId) => {
      const light = state.devices.find((d) => d.id === lightId);
      if (!light || !light.isOn) return;
      deviceClient
        .sendCommand({ op: "toggle", deviceId: lightId, on: false })
        .catch(() => {});
    });
    roomAutoLights.delete(roomId);
  }, ROOM_IDLE_MS);
  roomTimers.set(roomId, timer);
}

export function reportRoomPresence(event: PresenceEvent) {
  const roomId = resolveRoomId(event);
  if (!roomId) return;

  const state = useHomeStore.getState();
  const lights = state.devices.filter(
    (device) => device.kind === "light" && device.roomId === roomId,
  );
  if (!lights.length) return;

  const autoLights = roomAutoLights.get(roomId) ?? new Set<string>();
  lights.forEach((light) => {
    if (light.isOn) return;
    autoLights.add(light.id);
    deviceClient
      .sendCommand({ op: "toggle", deviceId: light.id, on: true })
      .catch(() => {});
  });
  if (autoLights.size > 0) {
    roomAutoLights.set(roomId, autoLights);
  }

  scheduleRoomIdle(roomId);
}
