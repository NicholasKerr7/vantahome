import type { StoreApi } from 'zustand';
import { runtimePolicy, type RuntimeMode } from '../../config/runtimeMode';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';
import {
  mergeSimulationChanges, parseSimulationRequest,
  type SimulationChanges, type SimulationSnapshot, type SimulationSnapshotMessage,
} from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { overlayDemoDevices, projectSimulationToDemo } from './demoDeviceMapping';
import { simulationPersistence, type SimulationPersistence, type SimulationSaveStatus } from './simulationPersistence';

type HomeStore = Pick<StoreApi<HomeState>, 'getState' | 'setState' | 'subscribe'>;
type SessionOptions = { store?: HomeStore; persistence?: SimulationPersistence; mode?: RuntimeMode };

/** Share only an offline, unauthenticated owner demonstration, never household observations. */
export function canShareDemoDevices(state: HomeState, mode: RuntimeMode): boolean {
  const member = state.household.find((candidate) => candidate.id === state.activeMemberId);
  return mode === 'demo' && !state.accountUserId && !state.authenticatedUserId
    && !state.accountHomeId && !state.activeHomeId && !state.realtime.enabled
    && !state.realtime.useMqtt && member?.role === 'Owner';
}

/** Invalidate an open bridge synchronously when identity, home or transport scope changes. */
function sessionIdentity(state: HomeState): string {
  return JSON.stringify([
    state.accountUserId, state.authenticatedUserId, state.accountHomeId, state.activeHomeId,
    state.sessionEpoch, state.realtime.enabled, state.realtime.useMqtt, state.activeMemberId,
    state.household.find((member) => member.id === state.activeMemberId)?.role,
  ]);
}

/** Exchange only validated simulation snapshots; this class has no device-command transport. */
export class SimulationSession {
  private readonly store: HomeStore;
  private readonly persistence: SimulationPersistence;
  private readonly identity: string;
  private readonly scope: string;
  private readonly sharedDemo: boolean;
  private state: SimulationSnapshot | null = null;
  private ready: Promise<void>;
  private disposed = false;
  private requested = false;
  private projecting = false;
  private lastRequestId = 0;
  private unsubscribeStore: () => void;
  private unsubscribePersistence: () => void;
  private unsubscribeState: () => void;
  private pendingPatches = new Map<number, { base: SimulationSnapshot; changes: SimulationChanges }>();

  /** Capture the current scope before asynchronous hydration can race an account change. */
  constructor(
    private readonly deliver: (message: SimulationSnapshotMessage) => void,
    private readonly onSaveStatus: (status: SimulationSaveStatus) => void,
    options: SessionOptions = {},
  ) {
    this.store = options.store ?? useHomeStore;
    this.persistence = options.persistence ?? simulationPersistence;
    const home = this.store.getState();
    this.identity = sessionIdentity(home);
    this.sharedDemo = canShareDemoDevices(home, options.mode ?? runtimePolicy.mode);
    // Account identifiers stay in the host's local storage key and never cross the frame boundary.
    this.scope = this.sharedDemo ? 'demo' : `preview:${home.accountUserId ?? home.authenticatedUserId ?? 'local'}`;
    this.unsubscribePersistence = this.persistence.subscribe(this.scope, onSaveStatus);
    this.unsubscribeState = this.persistence.subscribeState(this.scope, (next) => {
      if (this.disposed || !this.state || next === this.state) return;
      this.state = next;
      if (this.requested) this.sendSnapshot();
    });
    this.unsubscribeStore = this.store.subscribe((state, previous) => {
      if (sessionIdentity(state) !== this.identity) {
        this.dispose();
        onSaveStatus('disconnected');
        return;
      }
      if (!this.sharedDemo || this.projecting || !this.state || state.devices === previous.devices) return;
      const next = overlayDemoDevices(this.state, state.devices);
      if (next === this.state) return;
      this.state = next;
      this.persistence.save(this.scope, next);
      if (this.requested) this.sendSnapshot();
    });
    this.ready = this.persistence.load(this.scope).then((saved) => {
      if (this.disposed) return;
      this.state = this.sharedDemo ? overlayDemoDevices(saved, this.store.getState().devices) : saved;
    });
  }

  /** Process ordered patches only after hydration and an explicit handshake. */
  handleMessage(input: unknown): boolean {
    const message = parseSimulationRequest(input);
    if (!message) return false;
    if (this.disposed) return true;
    // Capture the sender's baseline before another surface commits. Rebase independent
    // fields later, retaining rapid queued edits from this sender in their original order.
    if (message.type === 'patch' && this.state && this.requested && message.requestId > this.lastRequestId && !this.pendingPatches.has(message.requestId)) {
      let base = this.state;
      for (const pending of this.pendingPatches.values()) base = rebaseChanges(base, pending.base, pending.changes);
      this.pendingPatches.set(message.requestId, { base, changes: message.changes });
    }
    this.ready = this.ready.then(() => {
      if (this.disposed || !this.state) return;
      if (message.type === 'request') {
        this.requested = true;
        this.sendSnapshot();
        return;
      }
      if (!this.requested || message.requestId <= this.lastRequestId) { this.pendingPatches.delete(message.requestId); return; }
      this.lastRequestId = message.requestId;
      const previous = this.state;
      const pending = this.pendingPatches.get(message.requestId);
      this.pendingPatches.delete(message.requestId);
      this.state = pending ? rebaseChanges(previous, pending.base, pending.changes) : mergeSimulationChanges(previous, message.changes);
      // Publish first so another session cannot project a stale dashboard snapshot over
      // unrelated scene devices while the shared host store notifies its subscribers.
      this.persistence.save(this.scope, this.state);
      if (this.sharedDemo) {
        const current = this.store.getState();
        const devices = projectSimulationToDemo(this.state, previous, current.devices);
        this.projecting = true;
        try { if (devices !== current.devices) this.store.setState({ devices }); }
        finally { this.projecting = false; }
      }
      this.sendSnapshot(message.requestId);
    }).catch(() => {
      // Renderer teardown can reject delivery; stop the session and expose recovery instead of stranding its queue.
      if (!this.disposed) {
        this.dispose();
        this.onSaveStatus('disconnected');
      }
    });
    return true;
  }

  /** Stop all cross-view updates when the frame closes, while accepted disk writes finish. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeStore();
    this.unsubscribePersistence();
    this.unsubscribeState();
    this.pendingPatches.clear();
  }

  /** Send the complete canonical snapshot so either renderer can recover after reopening. */
  private sendSnapshot(acknowledgedRequestId?: number): void {
    if (!this.state || this.disposed) return;
    try {
      this.deliver({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state: this.state,
        ...(acknowledgedRequestId === undefined ? {} : { acknowledgedRequestId }) });
    } catch {
      // A terminated WebView must not throw through a dashboard store update.
      this.dispose();
      this.onSaveStatus('disconnected');
    }
  }
}

/** Encode data as a literal; simulated settings can never become executable bridge code. */
export function nativeSimulationSnapshotScript(message: SimulationSnapshotMessage): string {
  const payload = JSON.stringify(message).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `window.dispatchEvent(new CustomEvent('vantahome-simulation',{detail:${payload}}));true;`;
}

/** Rebase only changed fields so concurrent voice and scene edits do not undo one another. */
function rebaseChanges(current: SimulationSnapshot, base: SimulationSnapshot, changes: SimulationChanges): SimulationSnapshot {
  const rebased: SimulationChanges = { ...changes };
  if (changes.deviceStates) {
    rebased.deviceStates = {};
    for (const [id, submitted] of Object.entries(changes.deviceStates)) {
      const before = base.deviceStates[id];
      const latest = current.deviceStates[id];
      if (!before || !latest) continue;
      const next = { ...latest };
      if (submitted.on !== before.on) next.on = submitted.on;
      if (submitted.level !== before.level) next.level = submitted.level;
      const settings = { ...latest.settings };
      for (const key of new Set([...Object.keys(before.settings ?? {}), ...Object.keys(submitted.settings ?? {})])) {
        if (submitted.settings?.[key] === before.settings?.[key]) continue;
        if (submitted.settings?.[key] === undefined) delete settings[key];
        else settings[key] = submitted.settings[key];
      }
      if (Object.keys(settings).length) next.settings = settings;
      else delete next.settings;
      rebased.deviceStates[id] = next;
    }
  }
  return mergeSimulationChanges(current, rebased);
}
