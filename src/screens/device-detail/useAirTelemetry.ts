import { useEffect, useState } from "react";
import { AppState } from "react-native";
import type { Device } from "../../store/useHomeStore";
import { readAirTelemetry } from "./airTelemetry";

/** Age air readings while the app is active and refresh on resume without keeping a background timer alive. */
export function useAirTelemetry(device: Device | undefined, sample: boolean) {
  const [now, setNow] = useState(Date.now);
  const enabled = device?.kind === "air";
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    /** Restart only for an active screen; app resume immediately reevaluates cached timestamps. */
    const refresh = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (AppState.currentState !== null && AppState.currentState !== "active") return;
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), 60_000);
    };
    refresh();
    const subscription = AppState.addEventListener("change", refresh);
    // Web can omit the subscription when the Page Visibility API is unavailable.
    return () => { if (timer) clearInterval(timer); subscription?.remove(); };
  }, [enabled]);
  return device ? readAirTelemetry(device, sample, Math.max(now, Date.now())) : null;
}
