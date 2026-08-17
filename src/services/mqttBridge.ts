import type { Buffer } from "buffer";
import { deviceClient, type ConnectionStatus } from "./deviceClient";
import { reportRoomPresence } from "./roomPresence";
import mqtt from "mqtt";
import { runtimePolicy } from "../config/runtimeMode";
import { parseTransportMessage } from "./transportSchemas";

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

export function startMqttBridge(options: MqttBridgeOptions = {}) {
  const url = options.url ?? process.env.EXPO_PUBLIC_MQTT_URL;
  if (!url) return null;
  if (!runtimePolicy.allowDirectMqtt) {
    options.onStatus?.(
      "error",
      `Direct mobile MQTT is disabled in ${runtimePolicy.mode} mode; connect through Vanta Bridge.`,
    );
    return null;
  }
  const isLocalTls =
    url.startsWith("wss://localhost") ||
    url.startsWith("wss://127.0.0.1") ||
    url.startsWith("wss://0.0.0.0");

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
    // Development-only explicit credentials. Never source broker secrets from
    // EXPO_PUBLIC_* because those values are compiled into the mobile binary.
    username: options.username,
    password: options.password,
    clientId:
      options.clientId ?? `vantahome-${Math.random().toString(16).slice(2)}`,
    keepalive: 30,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 10000,
    rejectUnauthorized: !isLocalTls,
  });

  let hasConnected = false;
  options.onStatus?.("connecting");

  client.on("connect", () => {
    hasConnected = true;
    client.subscribe(topicState);
    options.onStatus?.("connected");
  });

  client.on("reconnect", () => {
    options.onStatus?.("connecting");
  });

  client.on("close", () => {
    // Avoid rapid offline/online flicker during reconnects.
    options.onStatus?.(hasConnected ? "connecting" : "connecting");
  });

  client.on("error", (err) => {
    options.onStatus?.("error", err?.message ?? "MQTT error");
  });

  client.on("offline", () => {
    options.onStatus?.("disconnected");
  });

  client.on("message", (topic, payload) => {
    if (topic !== topicState) return;
    const data = parseMessage(payload);
    const message = parseTransportMessage(data);
    if (!message) return;

    if (message.type === "presence") {
      reportRoomPresence({
        roomId: message.roomId,
        deviceId: message.deviceId,
        kind: message.kind,
        source: message.source,
      });
      return;
    }

    if (message.type === "state") {
      deviceClient.pushState(message.event.deviceId, message.event.patch);
      return;
    }

    if (message.type === "state-batch") {
      message.events.forEach((event) => {
        deviceClient.pushState(event.deviceId, event.patch);
      });
      return;
    }

    if (message.type === "snapshot") {
      message.devices.forEach((device) => {
        const { id, name: _name, kind: _kind, roomId: _roomId, ...patch } = device;
        deviceClient.pushState(id, patch);
      });
    }
  });

  const clearCommandTransport = deviceClient.setCommandTransport(
    async (cmd, patch) => {
      client.publish(
        topicCommand,
        JSON.stringify({ type: "command", payload: cmd }),
      );
      if (runtimePolicy.mode === "demo" && publishState && patch) {
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
