import type { Buffer } from "buffer";
import type { Device } from "../store/useHomeStore";
import { deviceClient, type ConnectionStatus } from "./deviceClient";
import { reportRoomPresence } from "./roomPresence";
import mqtt from "mqtt";

type MqttBridgeOptions = {
  url?: string;
  username?: string;
  password?: string;
  clientId?: string;
  topicState?: string;
  topicCommand?: string;
  publishState?: boolean;
  onStatus?: (status: ConnectionStatus, error?: string) => void;
};

type MqttStatePayload = {
  deviceId: string;
  patch: Partial<Device>;
  ts?: number;
};

type MqttBatchPayload = {
  events: MqttStatePayload[];
};

type MqttSnapshotPayload = {
  devices: Device[];
  ts?: number;
};

type MqttPresencePayload = {
  type: "presence";
  roomId?: string | null;
  deviceId?: string | null;
  kind?: "known" | "unknown";
  source?: "camera" | "motion" | "sensor";
};

export function startMqttBridge(options: MqttBridgeOptions = {}) {
  const url = options.url ?? process.env.EXPO_PUBLIC_MQTT_URL;
  if (!url) return null;

  // Bridge MQTT state messages into the local deviceClient and publish outgoing commands.
  const topicState =
    options.topicState ??
    process.env.EXPO_PUBLIC_MQTT_TOPIC_STATE ??
    "vantahome/devices/state";
  const topicCommand =
    options.topicCommand ??
    process.env.EXPO_PUBLIC_MQTT_TOPIC_COMMAND ??
    "vantahome/devices/command";
  const publishState =
    options.publishState ??
    (process.env.EXPO_PUBLIC_MQTT_PUBLISH_STATE ?? "").toLowerCase() === "true";

  const client = mqtt.connect(url, {
    username: options.username ?? process.env.EXPO_PUBLIC_MQTT_USERNAME,
    password: options.password ?? process.env.EXPO_PUBLIC_MQTT_PASSWORD,
    clientId:
      options.clientId ?? `vantahome-${Math.random().toString(16).slice(2)}`,
    keepalive: 30,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 10000,
  });

  options.onStatus?.("connecting");

  client.on("connect", () => {
    client.subscribe(topicState);
    options.onStatus?.("connected");
  });

  client.on("reconnect", () => {
    options.onStatus?.("connecting");
  });

  client.on("close", () => {
    options.onStatus?.("disconnected");
  });

  client.on("error", (err) => {
    options.onStatus?.("error", err?.message ?? "MQTT error");
  });

  client.on("message", (topic, payload) => {
    if (topic !== topicState) return;
    const data = parseMessage(payload);
    if (!data) return;

    if (data.type === "presence") {
      const evt = data as MqttPresencePayload;
      reportRoomPresence({
        roomId: evt.roomId ?? undefined,
        deviceId: evt.deviceId ?? undefined,
        kind: evt.kind ?? "unknown",
        source: evt.source ?? "motion",
      });
      return;
    }

    if (data.type === "state") {
      const evt = data as MqttStatePayload & { type?: string };
      if (!evt.deviceId || !evt.patch) return;
      deviceClient.pushState(evt.deviceId, evt.patch);
      return;
    }

    if (data.type === "state-batch") {
      const batch = data as MqttBatchPayload & { type?: string };
      if (!batch.events) return;
      batch.events.forEach((evt) => {
        if (!evt?.deviceId || !evt?.patch) return;
        deviceClient.pushState(evt.deviceId, evt.patch);
      });
      return;
    }

    if (data.type === "snapshot") {
      const snapshot = data as MqttSnapshotPayload & { type?: string };
      if (!snapshot.devices) return;
      snapshot.devices.forEach((device) => {
        if (!device?.id) return;
        deviceClient.pushState(device.id, device);
      });
      return;
    }

    if (data.deviceId && data.patch) {
      deviceClient.pushState(data.deviceId, data.patch);
    }
  });

  const clearCommandTransport = deviceClient.setCommandTransport(
    async (cmd, patch) => {
      client.publish(
        topicCommand,
        JSON.stringify({ type: "command", payload: cmd }),
      );
      if (publishState && patch) {
        client.publish(
          topicState,
          JSON.stringify({
            type: "state",
            deviceId: cmd.deviceId,
            patch,
            ts: Date.now(),
          }),
        );
      }
    },
  );

  return () => {
    clearCommandTransport();
    client.end(true);
  };
}

function parseMessage(payload: Buffer | string) {
  const raw = typeof payload === "string" ? payload : payload.toString();
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
