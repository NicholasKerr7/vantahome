import { EMPTY_SCENE_ACCESS, canControlSceneDevice, type SceneAccess } from './sceneAccess';
import { replaceRuntimeDevices } from './devicePlacement';
import {
  diffSimulationSnapshots, rebaseSimulationChanges, simulationChangeBaseline, parseSimulationSnapshotMessage, SIMULATION_CHANNEL,
  type SimulationChanges, type SimulationRequest, type SimulationSnapshot,
} from './simulationBridgeProtocol';

interface SimulationBridgeStore {
  applySnapshot: (snapshot: SimulationSnapshot, access?: SceneAccess) => void;
  subscribe: (listener: (next: SimulationSnapshot, previous: SimulationSnapshot) => void) => () => void;
}
interface SimulationBridgeOptions {
  store: SimulationBridgeStore;
  send: (message: SimulationRequest) => void;
  onHydrated: () => void;
  onSyncError: () => void;
}
export const SIMULATION_HYDRATION_TIMEOUT_MS = 12_000;
const HANDSHAKE_RETRY_DELAYS_MS = [2_000, 5_000] as const;
let nextRequestId = 0;

/**
 * Synchronize optimistic simulation edits with an isolated host. Every edit is sent immediately;
 * acknowledged host echoes are rebased under newer edits, so rapid sliders cannot jump backwards.
 */
export function createSimulationBridgeClient({ store, send, onHydrated, onSyncError }: SimulationBridgeOptions): { receive: (input: unknown) => void; dispose: () => void } {
  let applyingHost = false;
  let hydrated = false;
  let access = EMPTY_SCENE_ACCESS;
  let disposed = false;
  let lastAcknowledgedId = 0;
  let lastSentId = 0;
  let beforeHydration: { base: SimulationChanges; changes: SimulationChanges }[] = [];
  const pending = new Map<number, { base: SimulationChanges; changes: SimulationChanges }>();
  const hydrationTimers: ReturnType<typeof setTimeout>[] = [];

  /** Stop bounded handshake retries and their timeout as soon as the session is restored. */
  function clearHydrationTimers(): void {
    for (const timer of hydrationTimers) clearTimeout(timer);
    hydrationTimers.length = 0;
  }

  /** A detached or failing native host must show a useful sync notice instead of crashing controls. */
  function sendSafely(message: SimulationRequest): void {
    try { send(message); }
    catch { onSyncError(); }
  }

  /** Retry the initial request a fixed number of times to tolerate host listener setup races. */
  function requestSnapshot(): void {
    if (!disposed && !hydrated) sendSafely({ channel: SIMULATION_CHANNEL, version: 1, type: 'request' });
  }

  /** Drop queued edits when a host revokes control; stale optimistic values must not override its snapshot. */
  function restrictChanges(changes: SimulationChanges): SimulationChanges {
    if (!changes.deviceStates) return changes;
    const { deviceStates, ...preferences } = changes;
    const allowed = Object.fromEntries(Object.entries(deviceStates).filter(([id]) => canControlSceneDevice(access, id)));
    return Object.keys(allowed).length ? { ...preferences, deviceStates: allowed } : preferences;
  }

  /** Send each edit with the exact values its sender saw, including final edits before navigation. */
  function publish(base: SimulationChanges, changes: SimulationChanges): void {
    const requestId = ++nextRequestId;
    lastSentId = requestId;
    pending.set(requestId, { base, changes });
    sendSafely({ channel: SIMULATION_CHANNEL, version: 1, type: 'patch', requestId, base, changes });
  }

  const unsubscribe = store.subscribe((next, previous) => {
    if (disposed || applyingHost) return;
    const differences = diffSimulationSnapshots(previous, next);
    const changes = hydrated ? restrictChanges(differences) : differences;
    if (!Object.keys(changes).length) return;
    const base = simulationChangeBaseline(previous, changes);
    if (hydrated) publish(base, changes);
    else beforeHydration.push({ base, changes });
  });

  /** Accept only current acknowledgements, preserving local edits the host has not processed yet. */
  function receive(input: unknown): void {
    if (disposed) return;
    const message = parseSimulationSnapshotMessage(input);
    if (!message) return;
    const acknowledgedId = message.acknowledgedRequestId;
    if (acknowledgedId !== undefined) {
      if (acknowledgedId <= lastAcknowledgedId || acknowledgedId > lastSentId) return;
      lastAcknowledgedId = acknowledgedId;
      for (const id of pending.keys()) if (id <= acknowledgedId) pending.delete(id);
    }
    // Parsing is pure: install a validated catalog only after the acknowledgement is accepted.
    // Missing catalogs intentionally clear the previous scope's custom fixtures.
    replaceRuntimeDevices(message.placements ?? []);
    access = message.access ?? EMPTY_SCENE_ACCESS;
    for (const [id, edit] of pending) pending.set(id, { base: restrictChanges(edit.base), changes: restrictChanges(edit.changes) });
    beforeHydration = beforeHydration.map((edit) => ({ base: restrictChanges(edit.base), changes: restrictChanges(edit.changes) }));
    let state = message.state;
    for (const { base, changes } of pending.values()) state = rebaseSimulationChanges(state, base, changes);
    const firstSnapshot = !hydrated;
    if (firstSnapshot) for (const { base, changes } of beforeHydration) state = rebaseSimulationChanges(state, base, changes);
    hydrated = true;
    applyingHost = true;
    try { store.applySnapshot(state, access); }
    finally { applyingHost = false; }
    if (firstSnapshot) {
      clearHydrationTimers();
      onHydrated();
      for (const { base, changes } of beforeHydration) if (Object.keys(changes).length) publish(base, changes);
      beforeHydration = [];
    }
  }

  for (const delay of HANDSHAKE_RETRY_DELAYS_MS) hydrationTimers.push(setTimeout(requestSnapshot, delay));
  hydrationTimers.push(setTimeout(() => {
    if (!disposed && !hydrated) onSyncError();
  }, SIMULATION_HYDRATION_TIMEOUT_MS));
  requestSnapshot();
  return {
    receive,
    /** Unsubscribe on background/unmount; previously posted transactions already belong to the host. */
    dispose(): void { disposed = true; clearHydrationTimers(); unsubscribe(); pending.clear(); },
  };
}
