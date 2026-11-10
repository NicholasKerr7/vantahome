import { supabase } from '../../services/supabaseClient';
import { parseSimulationRequest, type DeviceState } from '../../../packages/home-scene/src/simulationBridgeProtocol';

export type SharedDeviceBinding = { deviceId: string; modelDeviceId: string };
export type SharedDeviceRow = SharedDeviceBinding & { revision: number; state: DeviceState };
export type SharedHomeSnapshot = {
  homeId: string; homeName: string; enabled: boolean; serverTimeMs: number; devices: SharedDeviceRow[];
  clock: { clientId: string; expiresAtMs: number } | null;
  requestId?: string; status?: 'applied' | 'existing';
};
export type SharedDeviceChange = SharedDeviceBinding & { expectedRevision: number; state: DeviceState };
export type SharedWriteIntent = 'command' | 'tick' | 'pause';
export type SharedHomeScope = { userId: string; homeId: string; key: string; bindings: SharedDeviceBinding[] };
export interface HouseholdSyncTransport {
  read(): Promise<SharedHomeSnapshot>;
  enable(requestId: string, states: Record<string, DeviceState>): Promise<SharedHomeSnapshot>;
  patch(requestId: string, clientId: string, intent: SharedWriteIntent, changes: SharedDeviceChange[]): Promise<SharedHomeSnapshot>;
  subscribe(onChange: () => void, onConnection: (connected: boolean) => void): () => void;
  close(): void;
}

/** Keep transport diagnostics out of the UI while retaining machine-readable conflict recovery. */
export class HouseholdSyncError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'HouseholdSyncError'; }
}

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const INVALID = 'Shared home information could not be verified. Reconnect to refresh it.';

/** Reject unknown devices, mixed homes and malformed states before any shared value enters local storage. */
export function parseSharedHomeSnapshot(input: unknown, scope: SharedHomeScope, requestId?: string): SharedHomeSnapshot {
  if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 192 * 1024) {
    throw new HouseholdSyncError('invalid_response', INVALID);
  }
  const value = input as Record<string, unknown>;
  const validKeys = ['homeId', 'homeName', 'enabled', 'serverTimeMs', 'devices', 'clock', 'requestId', 'status'];
  if (Object.keys(value).some((key) => !validKeys.includes(key)) || value.homeId !== scope.homeId
    || typeof value.homeName !== 'string' || !value.homeName.trim() || value.homeName.length > 500
    || typeof value.enabled !== 'boolean' || typeof value.serverTimeMs !== 'number'
    || !Number.isSafeInteger(value.serverTimeMs) || value.serverTimeMs <= 0
    || !Array.isArray(value.devices) || value.devices.length > 124
    || (requestId && (value.requestId !== requestId || !['applied', 'existing'].includes(String(value.status))))) {
    throw new HouseholdSyncError('invalid_response', INVALID);
  }
  const seen = new Set<string>();
  const devices: SharedDeviceRow[] = value.devices.map((candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new HouseholdSyncError('invalid_response', INVALID);
    const row = candidate as Record<string, unknown>;
    const binding = scope.bindings.find((entry) => entry.deviceId === row.deviceId && entry.modelDeviceId === row.modelDeviceId);
    if (!binding || Object.keys(row).sort().join(',') !== 'deviceId,modelDeviceId,revision,state'
      || seen.has(binding.deviceId) || typeof row.revision !== 'number' || !Number.isSafeInteger(row.revision) || row.revision < 1) {
      throw new HouseholdSyncError('invalid_response', INVALID);
    }
    const change = { deviceStates: { [binding.modelDeviceId]: row.state } };
    const parsed = parseSimulationRequest({ channel: 'vantahome-simulation', version: 1, type: 'patch', requestId: 1, base: change, changes: change });
    if (parsed?.type !== 'patch' || !parsed.changes.deviceStates) throw new HouseholdSyncError('invalid_response', INVALID);
    seen.add(binding.deviceId);
    return { ...binding, revision: row.revision, state: parsed.changes.deviceStates[binding.modelDeviceId] };
  });
  let clock: SharedHomeSnapshot['clock'] = null;
  if (value.clock !== null) {
    if (!value.clock || typeof value.clock !== 'object' || Array.isArray(value.clock)) throw new HouseholdSyncError('invalid_response', INVALID);
    const row = value.clock as Record<string, unknown>;
    if (Object.keys(row).sort().join(',') !== 'clientId,expiresAtMs' || typeof row.clientId !== 'string' || !UUID.test(row.clientId)
      || typeof row.expiresAtMs !== 'number' || !Number.isSafeInteger(row.expiresAtMs)
      || row.expiresAtMs - value.serverTimeMs > 6_000 || !scope.bindings.some((entry) => entry.modelDeviceId === 'entry-gate')) {
      throw new HouseholdSyncError('invalid_response', INVALID);
    }
    clock = { clientId: row.clientId, expiresAtMs: row.expiresAtMs };
  }
  if (!value.enabled && (devices.length || clock)) throw new HouseholdSyncError('invalid_response', INVALID);
  return { homeId: scope.homeId, homeName: value.homeName, enabled: value.enabled, serverTimeMs: value.serverTimeMs, devices, clock,
    ...(requestId ? { requestId, status: value.status as 'applied' | 'existing' } : {}) };
}

/** Bind every RPC to the captured account; subscription payloads are only hints for a fresh authorized read. */
export function createHouseholdSyncTransport(scope: SharedHomeScope, current: () => boolean): HouseholdSyncTransport {
  const abort = new AbortController();
  const client = supabase;
  if (!client) throw new HouseholdSyncError('unavailable', 'Sign in to a household to share simulation controls.');

  /** Abort a bounded request on timeout, account change or provider teardown. */
  async function rpc(name: string, params: Record<string, unknown>, requestId?: string): Promise<SharedHomeSnapshot> {
    if (abort.signal.aborted || !current()) throw new HouseholdSyncError('scope_changed', 'Household access changed. Reopen Shared home.');
    const { data, error } = await client!.auth.getSession();
    if (error || abort.signal.aborted || !current() || data.session?.user.id !== scope.userId || !data.session.access_token) {
      throw new HouseholdSyncError('scope_changed', 'Your account session needs verification.');
    }
    const request = new AbortController();
    const stop = () => request.abort();
    abort.signal.addEventListener('abort', stop);
    const timer = setTimeout(stop, 12_000);
    try {
      const response = await client!.rpc(name, params).setHeader('Authorization', `Bearer ${data.session.access_token}`).abortSignal(request.signal);
      if (!current() || abort.signal.aborted) throw new HouseholdSyncError('scope_changed', 'Household access changed.');
      if (response.error) {
        const code = response.error.code ?? 'network';
        throw new HouseholdSyncError(code, code === 'VH409' ? 'Another person changed this device. Refresh and review its current settings.'
          : code === '42501' ? 'Your current household access does not permit this change. Reconnect to verify access.'
            : 'The shared home could not confirm this request. Reconnect to check the latest state.');
      }
      return parseSharedHomeSnapshot(response.data, scope, requestId);
    } finally { clearTimeout(timer); abort.signal.removeEventListener('abort', stop); }
  }

  return {
    read: () => rpc('get_household_simulation', { target_home_id: scope.homeId }),
    enable: (requestId, states) => rpc('enable_household_simulation', { target_home_id: scope.homeId, request_id: requestId, initial_states: states }, requestId),
    patch: (requestId, clientId, intent, changes) => rpc('patch_household_simulation', {
      target_home_id: scope.homeId, request_id: requestId, client_id: clientId, intent, changes,
    }, requestId),
    subscribe(onChange, onConnection) {
      const channel = client.channel(`shared-simulation:${scope.userId}:${scope.homeId}`);
      for (const table of ['household_simulation_devices']) {
        const hint = () => { if (current() && !abort.signal.aborted) onChange(); };
        channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `home_id=eq.${scope.homeId}` }, hint);
        channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `home_id=eq.${scope.homeId}` }, hint);
      }
      channel.subscribe((status) => {
        if (current() && !abort.signal.aborted) onConnection(status === 'SUBSCRIBED');
      });
      return () => { void client.removeChannel(channel); };
    },
    close: () => abort.abort(),
  };
}
