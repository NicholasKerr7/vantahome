import type { StoreApi } from 'zustand';
import { runtimePolicy, type RuntimeMode } from '../../config/runtimeMode';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';
import {
  mergeSimulationChanges, parseSimulationRequest,
  type SimulationSnapshot, type SimulationSnapshotMessage,
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
    this.ready = this.ready.then(() => {
      if (this.disposed || !this.state) return;
      if (message.type === 'request') {
        this.requested = true;
        this.sendSnapshot();
        return;
      }
      if (!this.requested || message.requestId <= this.lastRequestId) return;
      this.lastRequestId = message.requestId;
      const previous = this.state;
      this.state = mergeSimulationChanges(previous, message.changes);
      if (this.sharedDemo) {
        const current = this.store.getState();
        const devices = projectSimulationToDemo(this.state, previous, current.devices);
        this.projecting = true;
        try { if (devices !== current.devices) this.store.setState({ devices }); }
        finally { this.projecting = false; }
      }
      this.persistence.save(this.scope, this.state);
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
