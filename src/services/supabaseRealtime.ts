import type { Device } from '../store/useHomeStore';
import { deviceClient } from './deviceClient';
import { supabase } from './supabaseClient';

type SupabaseRealtimeOptions = {
  channel?: string;
};

type DeviceStatePayload = {
  deviceId: string;
  patch: Partial<Device>;
  ts?: number;
};

type DeviceStateBatchPayload = {
  events: DeviceStatePayload[];
};

export function startSupabaseDeviceRealtime(options: SupabaseRealtimeOptions = {}) {
  if (!supabase) return null;

  const channelName = options.channel ?? process.env.EXPO_PUBLIC_SUPABASE_RT_CHANNEL ?? 'device-events';
  // Broadcast-only channel keeps device events light and avoids row-level permissions.
  const channel = supabase.channel(channelName, { config: { broadcast: { ack: false, self: true } } });

  channel.on('broadcast', { event: 'device-state' }, ({ payload }) => {
    const data = payload as DeviceStatePayload;
    if (!data?.deviceId || !data?.patch) return;
    deviceClient.pushState(data.deviceId, data.patch);
  });

  channel.on('broadcast', { event: 'device-state-batch' }, ({ payload }) => {
    const data = payload as DeviceStateBatchPayload;
    if (!data?.events) return;
    data.events.forEach((evt) => {
      if (!evt?.deviceId || !evt?.patch) return;
      deviceClient.pushState(evt.deviceId, evt.patch);
    });
  });

  channel.subscribe((status) => {
    if (status === 'CHANNEL_ERROR') {
      console.warn('Supabase realtime channel error');
    }
  });

  const clearCommandTransport = deviceClient.setCommandTransport(async (cmd, patch) => {
    if (!patch) return;
    await channel.send({
      type: 'broadcast',
      event: 'device-state',
      payload: { deviceId: cmd.deviceId, patch, ts: Date.now() },
    });
  });

  return () => {
    clearCommandTransport();
    channel.unsubscribe();
  };
}
