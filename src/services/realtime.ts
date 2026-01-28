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
  mqttFallbackTimeoutMs?: number;
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
  const fallbackUseSupabase = options.useSupabase ?? !!supabase;
  const fallbackTimeoutMs = options.mqttFallbackTimeoutMs ?? 6000;

  const unsubscribe = deviceClient.subscribeState((evt) => {
    useHomeStore.getState().setDevice(evt.deviceId, evt.patch);
  });

  let stopSupabase: (() => void) | undefined;
  let disconnect: (() => void) | undefined;
  let stopTelemetry: (() => void) | undefined;
  let statusUnsub: (() => void) | undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

  const stopFallback = () => {
    stopSupabase?.();
    disconnect?.();
    stopTelemetry?.();
    stopSupabase = undefined;
    disconnect = undefined;
    stopTelemetry = undefined;
  };

  const startFallback = () => {
    if (stopSupabase || disconnect || stopTelemetry) return;
    if (fallbackUseSupabase && supabase) {
      stopSupabase = startSupabaseDeviceRealtime({
        channel: options.supabaseChannel,
      });
      return;
    }
    if (wsUrl) {
      disconnect = deviceClient.connect(wsUrl);
      return;
    }
    if (enableMockTelemetry) {
      stopTelemetry = startMockTelemetry(options.telemetryIntervalMs);
    }
  };

  const stopMqtt = useMqtt
    ? startMqttBridge({
        url: mqttUrl,
        topicState: options.mqttTopicState,
        topicCommand: options.mqttTopicCommand,
        publishState: options.mqttPublishState,
        onStatus: (status, error) => {
          useHomeStore.getState().setRealtime({
            mqttStatus: status,
            mqttError: error,
          });
        },
      })
    : undefined;

  if (!useMqtt && useSupabase) {
    stopSupabase = startSupabaseDeviceRealtime({
      channel: options.supabaseChannel,
    });
  }
  if (!useMqtt && !useSupabase && wsUrl) {
    disconnect = deviceClient.connect(wsUrl);
  }
  if (!useMqtt && enableMockTelemetry) {
    stopTelemetry = startMockTelemetry(options.telemetryIntervalMs);
  }

  if (useMqtt) {
    fallbackTimer = setTimeout(() => {
      const status = useHomeStore.getState().realtime.mqttStatus;
      if (status !== "connected") startFallback();
    }, fallbackTimeoutMs);
    statusUnsub = useHomeStore.subscribe((state, prev) => {
      if (state.realtime.mqttStatus === prev.realtime.mqttStatus) return;
      const status = state.realtime.mqttStatus;
      if (status === "connected") {
        stopFallback();
        return;
      }
      if (status === "error" || status === "disconnected") {
        startFallback();
      }
    });
  }

  return () => {
    unsubscribe();
    stopMqtt?.();
    stopFallback();
    statusUnsub?.();
    if (fallbackTimer) clearTimeout(fallbackTimer);
    if (useMqtt) {
      useHomeStore.getState().setRealtime({
        mqttStatus: "disconnected",
        mqttError: undefined,
      });
    }
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
        const baseSolar = device.solarW ?? 0;
        const solarNoise = baseSolar > 0 ? (Math.random() - 0.45) * 120 : 0;
        const nextSolar = clamp(baseSolar + solarNoise, 0, 2000);
        const nextSolarToday =
          (device.solarTodayKwh ?? 0) + (nextSolar / 1000) * deltaHours;
        const nextGridToday = Math.max(0, nextEnergy - nextSolarToday);
        deviceClient.pushState(device.id, {
          powerW: Math.round(nextPower),
          energyTodayKwh: +nextEnergy.toFixed(2),
          solarW: Math.round(nextSolar),
          solarTodayKwh: +nextSolarToday.toFixed(2),
          gridTodayKwh: +nextGridToday.toFixed(2),
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
        const nextPm25 = clamp(
          (device.airPm25 ?? 8) + (Math.random() - 0.5) * 2,
          2,
          60,
        );
        const nextPm10 = clamp(
          (device.airPm10 ?? 14) + (Math.random() - 0.5) * 3,
          5,
          90,
        );
        const nextCo2 = clamp(
          (device.airCo2 ?? 620) + (Math.random() - 0.5) * 60,
          420,
          1600,
        );
        const nextVoc = clamp(
          (device.airVoc ?? 120) + (Math.random() - 0.5) * 24,
          40,
          420,
        );
        const nextFormaldehyde = clamp(
          (device.airFormaldehyde ?? 0.04) + (Math.random() - 0.5) * 0.01,
          0.01,
          0.2,
        );
        const nextPollen = clamp(
          (device.airPollen ?? 1) + (Math.random() - 0.5) * 0.6,
          0,
          5,
        );
        const nextConfidence = clamp(
          (device.airQualityConfidence ?? 92) + (Math.random() - 0.5) * 2,
          70,
          99,
        );
        const nextTemp = clamp(
          (device.tempC ?? 22) + (Math.random() - 0.5) * 0.4,
          16,
          28,
        );
        const nextOutdoorAqi =
          typeof device.airOutdoorAqi === "number"
            ? clamp(device.airOutdoorAqi + (Math.random() - 0.5) * 3, 8, 120)
            : undefined;
        const nextOutdoorPm25 =
          typeof device.airOutdoorPm25 === "number"
            ? clamp(device.airOutdoorPm25 + (Math.random() - 0.5) * 2, 3, 70)
            : undefined;
        const nextOutdoorCo2 =
          typeof device.airOutdoorCo2 === "number"
            ? clamp(device.airOutdoorCo2 + (Math.random() - 0.5) * 30, 380, 800)
            : undefined;
        const nextOutdoorVoc =
          typeof device.airOutdoorVoc === "number"
            ? clamp(device.airOutdoorVoc + (Math.random() - 0.5) * 16, 30, 240)
            : undefined;
        const nextOutdoorHumidity =
          typeof device.airOutdoorHumidity === "number"
            ? clamp(
                device.airOutdoorHumidity + (Math.random() - 0.5) * 3,
                30,
                70,
              )
            : undefined;
        const nextOutdoorTempC =
          typeof device.airOutdoorTempC === "number"
            ? clamp(device.airOutdoorTempC + (Math.random() - 0.5) * 0.4, 12, 32)
            : undefined;
        deviceClient.pushState(device.id, {
          airQualityIndex: Math.round(nextAqi),
          humidity: Math.round(nextHumidity),
          airPm25: Math.round(nextPm25),
          airPm10: Math.round(nextPm10),
          airCo2: Math.round(nextCo2),
          airVoc: Math.round(nextVoc),
          airFormaldehyde: Math.round(nextFormaldehyde * 100) / 100,
          airPollen: Math.round(nextPollen * 10) / 10,
          airQualityConfidence: Math.round(nextConfidence),
          tempC: Math.round(nextTemp * 10) / 10,
          airOutdoorAqi:
            nextOutdoorAqi == null
              ? device.airOutdoorAqi
              : Math.round(nextOutdoorAqi),
          airOutdoorPm25:
            nextOutdoorPm25 == null
              ? device.airOutdoorPm25
              : Math.round(nextOutdoorPm25),
          airOutdoorCo2:
            nextOutdoorCo2 == null
              ? device.airOutdoorCo2
              : Math.round(nextOutdoorCo2),
          airOutdoorVoc:
            nextOutdoorVoc == null
              ? device.airOutdoorVoc
              : Math.round(nextOutdoorVoc),
          airOutdoorHumidity:
            nextOutdoorHumidity == null
              ? device.airOutdoorHumidity
              : Math.round(nextOutdoorHumidity),
          airOutdoorTempC:
            nextOutdoorTempC == null
              ? device.airOutdoorTempC
              : Math.round(nextOutdoorTempC * 10) / 10,
        });
      }
    });
  }, intervalMs);

  return () => clearInterval(timer);
}
