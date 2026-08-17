import { deviceClient } from "./deviceClient";
import { supabase } from "./supabaseClient";
import { parseDeviceStateEvent } from "./transportSchemas";
import { runtimePolicy } from "../config/runtimeMode";

type SupabaseRealtimeOptions = {
  channel?: string;
};

export function startSupabaseDeviceRealtime(
  options: SupabaseRealtimeOptions = {},
) {
  if (!supabase) return null;

  const channelName =
    options.channel ??
    process.env.EXPO_PUBLIC_SUPABASE_RT_CHANNEL ??
    "device-events";
  // Broadcast-only channel keeps device events light and avoids row-level permissions.
  const channel = supabase.channel(channelName, {
    config: { broadcast: { ack: false, self: true } },
  });

  channel.on("broadcast", { event: "device-state" }, ({ payload }) => {
    const event = parseDeviceStateEvent(payload);
    if (!event) return;
    deviceClient.pushState(event.deviceId, event.patch);
  });

  channel.on("broadcast", { event: "device-state-batch" }, ({ payload }) => {
    const events: unknown[] =
      payload &&
      typeof payload === "object" &&
      "events" in payload &&
      Array.isArray(payload.events)
        ? payload.events
        : [];
    events.forEach((value) => {
      const event = parseDeviceStateEvent(value);
      if (!event) return;
      deviceClient.pushState(event.deviceId, event.patch);
    });
  });

  channel.subscribe((status) => {
    if (status === "CHANNEL_ERROR") {
      console.warn("Supabase realtime channel error");
    }
  });

  const clearCommandTransport = runtimePolicy.allowMockTelemetry
    ? deviceClient.setCommandTransport(async (cmd, patch) => {
        if (!patch) return;
        await channel.send({
          type: "broadcast",
          event: "device-state",
          payload: { deviceId: cmd.deviceId, patch, ts: Date.now() },
        });
      })
    : () => {};

  return () => {
    clearCommandTransport();
    channel.unsubscribe();
  };
}
