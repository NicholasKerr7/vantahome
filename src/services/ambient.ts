import { deviceClient } from "./deviceClient";
import { useHomeStore, type AmbientReading } from "../store/useHomeStore";

const OUTDOOR_SENSOR_ID = (
  process.env.EXPO_PUBLIC_OUTDOOR_SENSOR_ID ?? ""
).trim();
const INDOOR_SENSOR_ID = (
  process.env.EXPO_PUBLIC_INDOOR_SENSOR_ID ?? ""
).trim();
const WEATHER_LAT = parseFloat(process.env.EXPO_PUBLIC_WEATHER_LAT ?? "");
const WEATHER_LON = parseFloat(process.env.EXPO_PUBLIC_WEATHER_LON ?? "");
const WEATHER_POLL_MIN = parseInt(
  process.env.EXPO_PUBLIC_WEATHER_POLL_MIN ?? "15",
  10,
);
const HAS_WEATHER_COORDS =
  Number.isFinite(WEATHER_LAT) && Number.isFinite(WEATHER_LON);

type PatchWithLabel = { label?: string; tempC?: number };

export function startAmbientData() {
  const stopSensors = deviceClient.subscribeState((evt) => {
    const patch = evt.patch as PatchWithLabel;
    if (OUTDOOR_SENSOR_ID && evt.deviceId === OUTDOOR_SENSOR_ID) {
      const temp = typeof patch.tempC === "number" ? patch.tempC : null;
      if (temp == null) return;
      const label = resolveLabel(evt.deviceId, patch, "Outdoor");
      useHomeStore
        .getState()
        .setOutdoor({ tempC: Math.round(temp), label, source: "sensor" });
      return;
    }
    if (INDOOR_SENSOR_ID && evt.deviceId === INDOOR_SENSOR_ID) {
      const temp = typeof patch.tempC === "number" ? patch.tempC : null;
      if (temp == null) return;
      const label = resolveLabel(evt.deviceId, patch, "Indoor");
      useHomeStore
        .getState()
        .setIndoor({ tempC: Math.round(temp), label, source: "sensor" });
    }
  });

  const stopWeather =
    !OUTDOOR_SENSOR_ID && HAS_WEATHER_COORDS
      ? startWeatherPolling({
          lat: WEATHER_LAT,
          lon: WEATHER_LON,
          intervalMin: Number.isFinite(WEATHER_POLL_MIN)
            ? Math.max(5, WEATHER_POLL_MIN)
            : 15,
        })
      : undefined;

  return () => {
    stopSensors();
    stopWeather?.();
  };
}

function resolveLabel(
  deviceId: string,
  patch: PatchWithLabel,
  fallback: string,
) {
  if (patch.label && patch.label.trim().length > 0) return patch.label.trim();
  const device = useHomeStore
    .getState()
    .devices.find((item) => item.id === deviceId);
  return device?.name ?? fallback;
}

function startWeatherPolling({
  lat,
  lon,
  intervalMin,
}: {
  lat: number;
  lon: number;
  intervalMin: number;
}) {
  let cancelled = false;

  const poll = async () => {
    if (cancelled) return;
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(lat));
      url.searchParams.set("longitude", String(lon));
      url.searchParams.set("current_weather", "true");
      url.searchParams.set("temperature_unit", "celsius");

      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data = await res.json();
      const current = data?.current_weather;
      if (!current || typeof current.temperature !== "number") return;

      const label = weatherLabel(current.weathercode);
      useHomeStore.getState().setOutdoor({
        tempC: Math.round(current.temperature),
        label,
        source: "weather",
      });
    } catch {
      // Ignore transient network errors; we'll retry on the next poll.
    }
  };

  poll();
  const timer = setInterval(poll, intervalMin * 60 * 1000);
  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}

function weatherLabel(code?: number): AmbientReading["label"] {
  const labels: Record<number, string> = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    56: "Freezing drizzle",
    57: "Freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Rain showers",
    81: "Rain showers",
    82: "Heavy showers",
    85: "Snow showers",
    86: "Snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm hail",
    99: "Thunderstorm hail",
  };
  if (typeof code === "number" && labels[code]) return labels[code];
  return "Outdoor";
}
