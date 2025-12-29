import { deviceClient } from "./deviceClient";
import { useHomeStore } from "../store/useHomeStore";
import { startMqttBridge } from "./mqttBridge";
import { supabase } from "./supabaseClient";
import { startSupabaseDeviceRealtime } from "./supabaseRealtime";

type RealtimeOptions = {
  wsUrl?: string | null;
  enabled?: boolean;
  enableMockTelemetry?: boolean;
  telemetryIntervalMs?: number;
  useSupabase?: boolean;
  supabaseChannel?: string;
  mqttUrl?: string;
  mqttTopicState?: string;
  mqttTopicCommand?: string;
  mqttPublishState?: boolean;
  useMqtt?: boolean;
};

export function startDeviceRealtime(options: RealtimeOptions = {}) {
  const enabled = options.enabled ?? true;
  const wsUrl =
    options.wsUrl === null
      ? null
      : (options.wsUrl ?? process.env.EXPO_PUBLIC_DEVICE_WS_URL);
  const mqttUrl = options.mqttUrl ?? process.env.EXPO_PUBLIC_MQTT_URL;
  const wantsMqtt = options.useMqtt ?? !!mqttUrl;
  const useMqtt = enabled && wantsMqtt;
  const wantsSupabase = options.useSupabase ?? (!!supabase && !useMqtt);
  const useSupabase = enabled && wantsSupabase;
  // Priority order: MQTT (local), then Supabase, then direct WS, then mock telemetry.
  const enableMockTelemetry =
    options.enableMockTelemetry ?? (!wsUrl && !useSupabase && !useMqtt);

  const unsubscribe = deviceClient.subscribeState((evt) => {
    useHomeStore.getState().setDevice(evt.deviceId, evt.patch);
  });

  const stopMqtt = useMqtt
    ? startMqttBridge({
        url: mqttUrl,
        topicState: options.mqttTopicState,
        topicCommand: options.mqttTopicCommand,
        publishState: options.mqttPublishState,
      })
    : undefined;
  const stopSupabase =
    !useMqtt && useSupabase
      ? startSupabaseDeviceRealtime({ channel: options.supabaseChannel })
      : undefined;
  const disconnect =
    !useMqtt && !useSupabase && wsUrl ? deviceClient.connect(wsUrl) : undefined;
  const stopTelemetry = enableMockTelemetry
    ? startMockTelemetry(options.telemetryIntervalMs)
    : undefined;

  return () => {
    unsubscribe();
    stopMqtt?.();
    stopSupabase?.();
    disconnect?.();
    stopTelemetry?.();
  };
}

function startMockTelemetry(intervalMs = 2000) {
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));
  const timer = setInterval(() => {
    const { devices } = useHomeStore.getState();
    const deltaHours = intervalMs / 3600000;

    devices.forEach((device) => {
      // Lightweight noise model so dashboards feel alive without a backend.
      if (device.kind === "energy") {
        const nextPower = clamp(
          (device.powerW ?? 600) + (Math.random() - 0.5) * 160,
          200,
          1600,
        );
        const nextEnergy =
          (device.energyTodayKwh ?? 0) + (nextPower / 1000) * deltaHours;
        deviceClient.pushState(device.id, {
          powerW: Math.round(nextPower),
          energyTodayKwh: +nextEnergy.toFixed(2),
        });
      }
      if (device.kind === "water") {
        const flowBase =
          Math.random() > 0.7 ? Math.random() * 12 : Math.random() * 3;
        const nextFlow = clamp((device.waterLpm ?? 0) * 0.6 + flowBase, 0, 18);
        const nextToday =
          (device.waterTodayL ?? 0) + (nextFlow / 60) * (intervalMs / 1000);
        deviceClient.pushState(device.id, {
          waterLpm: Math.round(nextFlow * 10) / 10,
          waterTodayL: Math.round(nextToday),
        });
      }
      if (device.kind === "air") {
        const nextAqi = clamp(
          (device.airQualityIndex ?? 30) + (Math.random() - 0.5) * 6,
          10,
          140,
        );
        const nextHumidity = clamp(
          (device.humidity ?? 45) + (Math.random() - 0.5) * 3,
          30,
          65,
        );
        deviceClient.pushState(device.id, {
          airQualityIndex: Math.round(nextAqi),
          humidity: Math.round(nextHumidity),
        });
      }
    });
  }, intervalMs);

  return () => clearInterval(timer);
}
