import { deviceClient } from "./deviceClient";
import { supabase } from "./supabaseClient";
import { parseDeviceStateEvent } from "./transportSchemas";
import { runtimePolicy } from "../config/runtimeMode";
import { selectVisibleDevices, useHomeStore } from "../store/useHomeStore";

type SupabaseRealtimeOptions = {
  channel?: string;
  userId?: string | null;
  homeId?: string | null;
};

export function startSupabaseDeviceRealtime(
  options: SupabaseRealtimeOptions = {},
) {
  if (!supabase) return null;
  if (runtimePolicy.allowMockTelemetry) return startDemoRealtime(options.channel);
  const client = supabase;
  const { userId, homeId } = options;
  if (!userId || !homeId) return null;

  let stopped = false;
  const abort = new AbortController();
  const pending = new Set<string>();
  const dirty = new Set<string>();
  const currentScope = () => {
    const state = useHomeStore.getState();
    return !stopped && state.membershipReady &&
      state.authenticatedUserId === userId && state.activeHomeId === homeId;
  };
  const canObserve = (deviceId: string) => currentScope() &&
    selectVisibleDevices(useHomeStore.getState()).some((device) => device.id === deviceId);
  if (!currentScope()) return null;

  // A notification is only an invalidation hint. Re-read through current RLS,
  // including household/room permissions, before accepting observed state.
  const refreshDevice = async (deviceId: string) => {
    if (!canObserve(deviceId)) return;
    if (pending.has(deviceId)) {
      dirty.add(deviceId);
      return;
    }
    pending.add(deviceId);
    try {
      do {
        dirty.delete(deviceId);
        const { data, error } = await client
          .from("device_state")
          .select("device_id, state, updated_at, devices!inner(home_id)")
          .eq("device_id", deviceId)
          .eq("devices.home_id", homeId)
          .abortSignal(abort.signal)
          .maybeSingle();
        if (error || !data || !canObserve(deviceId)) return;
        const event = parseDeviceStateEvent({
          deviceId: data.device_id,
          patch: data.state,
          ts: Date.parse(data.updated_at),
        });
        if (event?.deviceId === deviceId) {
          deviceClient.pushState(deviceId, { ...event.patch, observedAt: event.ts });
        }
      } while (dirty.has(deviceId) && canObserve(deviceId));
    } catch {
      // Connection loss/cleanup must never fall back to client-authored state.
    } finally {
      pending.delete(deviceId);
      dirty.delete(deviceId);
    }
  };

  const channel = client.channel(`device-state:${userId}:${homeId}`);
  const onObservation = (payload: { new: { device_id?: unknown } }) => {
    const deviceId = payload.new.device_id;
    if (typeof deviceId === "string") void refreshDevice(deviceId);
  };
  channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "device_state" }, onObservation);
  channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "device_state" }, onObservation);
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED" && currentScope()) {
      for (const device of selectVisibleDevices(useHomeStore.getState())) {
        void refreshDevice(device.id);
      }
    }
    if (status === "CHANNEL_ERROR") console.warn("Device updates temporarily unavailable");
  });

  const clearCommandTransport = deviceClient.setCommandTransport(async (command) => {
    if (!canObserve(command.deviceId)) throw new Error("Device session is no longer active.");
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || sessionData.session?.user.id !== userId || !canObserve(command.deviceId)) {
      throw new Error("Device session is no longer active.");
    }
    const { data, error } = await client.functions.invoke("device-command", {
      body: command,
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      signal: abort.signal,
    });
    if (error || data?.command?.command_id !== command.commandId || data?.command?.status !== "created" || !currentScope()) {
      throw new Error("Device command was not accepted.");
    }
    // Acceptance is not physical confirmation. Only observed database state
    // updates the UI in a release runtime.
  });

  return () => {
    stopped = true;
    abort.abort();
    clearCommandTransport();
    void client.removeChannel(channel);
  };
}

function startDemoRealtime(configuredChannel?: string) {
  if (!supabase) return null;
  const client = supabase;
  let stopped = false;
  const channel = client.channel(configuredChannel ?? "demo-device-events", {
    config: { broadcast: { ack: false, self: true } },
  });

  channel.on("broadcast", { event: "device-state" }, ({ payload }) => {
    if (stopped) return;
    const event = parseDeviceStateEvent(payload);
    if (!event) return;
    deviceClient.pushState(event.deviceId, event.patch);
  });

  channel.on("broadcast", { event: "device-state-batch" }, ({ payload }) => {
    if (stopped) return;
    const events: unknown[] =
      payload &&
      typeof payload === "object" &&
      "events" in payload &&
      Array.isArray(payload.events) && payload.events.length <= 1000
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

  const clearCommandTransport = deviceClient.setCommandTransport(async (cmd, patch) => {
        if (!patch || stopped) return;
        await channel.send({
          type: "broadcast",
          event: "device-state",
          payload: { deviceId: cmd.deviceId, patch, ts: Date.now() },
        });
      });

  return () => {
    stopped = true;
    clearCommandTransport();
    void client.removeChannel(channel);
  };
}
