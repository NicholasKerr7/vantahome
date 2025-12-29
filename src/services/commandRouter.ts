import {
  AC_TEMP_MAX_C,
  AC_TEMP_MIN_C,
  type DeviceMode,
  useHomeStore,
} from "../store/useHomeStore";

export type Command =
  | { deviceId: string; op: "toggle"; on?: boolean }
  | { deviceId: string; op: "set-temp"; value: number; mode?: DeviceMode }
  | { deviceId: string; op: "set-brightness"; value: number }
  | { deviceId: string; op: "set-volume"; value: number }
  | { deviceId: string; op: "set-channel"; value: number }
  | { deviceId: string; op: "set-muted"; value: boolean }
  | { deviceId: string; op: "launch-app"; app: string }
  | {
      deviceId: string;
      op: "media";
      action:
        | "play"
        | "play-pause"
        | "next"
        | "previous"
        | "rewind"
        | "fast-forward";
    }
  | {
      deviceId: string;
      op: "nav";
      action: "up" | "down" | "left" | "right" | "select" | "home";
    };

/**
 * Minimal in-app command router.
 * In production, your Alexa/Google adapters would call into a backend, which
 * then calls equivalent setters. Keeping this thin lets us reuse it locally.
 */
export function applyCommand(cmd: Command) {
  const setDevice = useHomeStore.getState().setDevice;
  const toggle = useHomeStore.getState().toggleDevice;

  switch (cmd.op) {
    case "toggle": {
      if (typeof cmd.on === "boolean") {
        setDevice(cmd.deviceId, { isOn: cmd.on });
      } else {
        toggle(cmd.deviceId);
      }
      return;
    }
    case "set-temp": {
      const value = Math.max(
        AC_TEMP_MIN_C,
        Math.min(AC_TEMP_MAX_C, Math.round(cmd.value)),
      );
      setDevice(cmd.deviceId, { tempC: value, mode: cmd.mode, isOn: true });
      return;
    }
    case "set-brightness": {
      const value = Math.max(0, Math.min(100, Math.round(cmd.value)));
      setDevice(cmd.deviceId, { brightness: value, isOn: value > 0 });
      return;
    }
    case "set-volume": {
      const value = Math.max(0, Math.min(100, Math.round(cmd.value)));
      setDevice(cmd.deviceId, { volume: value, isOn: true });
      return;
    }
    case "set-channel": {
      const value = Math.max(1, Math.min(999, Math.round(cmd.value)));
      setDevice(cmd.deviceId, { channel: value, isOn: true });
      return;
    }
    case "set-muted": {
      setDevice(cmd.deviceId, { muted: cmd.value, isOn: true });
      return;
    }
    case "launch-app": {
      setDevice(cmd.deviceId, { source: cmd.app, isOn: true });
      return;
    }
    case "media": {
      setDevice(cmd.deviceId, { isOn: true });
      return;
    }
    case "nav": {
      setDevice(cmd.deviceId, { isOn: true });
      return;
    }
  }
}
