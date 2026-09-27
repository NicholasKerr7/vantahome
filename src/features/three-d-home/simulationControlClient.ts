import { getDevice } from '../../../packages/home-scene/src/data';
import { applyDeviceSetting, runDeviceActionState, setDeviceLevelState, toggleDeviceState } from '../../../packages/home-scene/src/deviceControlActions';
import { createDefaultSimulationSnapshot, mergeSimulationChanges, type SimulationChanges, type SimulationSnapshot, type SimulationSnapshotMessage } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import type { DeviceState, SettingValue } from '../../../packages/home-scene/src/simulationTypes';
import { SimulationSession } from './simulationSession';
import type { SimulationSaveStatus } from './simulationPersistence';

type Session = Pick<SimulationSession, 'handleMessage' | 'dispose'>;
type SessionFactory = (deliver: (message: SimulationSnapshotMessage) => void, status: (status: SimulationSaveStatus) => void) => Session;
export type ControlSnapshot = { state: SimulationSnapshot; ready: boolean; status: SimulationSaveStatus };

/** A renderer-independent, optimistic client for the existing local simulation bridge. */
export class SimulationControlClient {
  private value: ControlSnapshot = { state: createDefaultSimulationSnapshot(), ready: false, status: 'saving' };
  private canonical = this.value.state;
  private session: Session | null = null;
  private nextRequest = 0;
  private closed = false;
  private pending = new Map<number, SimulationChanges>();
  private listeners = new Set<() => void>();

  /** Allow deterministic transport tests without importing or calling a hardware service. */
  constructor(private readonly createSession: SessionFactory = (deliver, status) => new SimulationSession(deliver, status)) {}

  /** Stable external-store reader used by native and web React controls. */
  getSnapshot = (): ControlSnapshot => this.value;

  /** Subscribe only to actual state or persistence changes. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Hydrate the same scoped state used by the full house WebView before enabling input. */
  connect(): void {
    this.closed = false;
    if (this.session) return;
    this.publish({ ...this.value, ready: false });
    this.session = this.createSession(this.receive, (status) => {
      this.publish({ ...this.value, status, ready: status !== 'disconnected' && this.value.ready });
    });
    this.session.handleMessage({ channel: 'vantahome-simulation', version: 1, type: 'request' });
  }

  /** Apply a schema-validated field through the shared device reducer. */
  setSetting = (id: string, field: string, value: SettingValue): void => {
    this.update([id], (state) => applyDeviceSetting(id, state, field, value));
  };

  /** Run a catalog action with the same semantics as the full Three.js inspector. */
  runAction = (id: string, actionId: string): void => {
    this.update([id], (state) => runDeviceActionState(id, state, actionId));
  };

  /** Toggle only the selected simulated device, including meaningful sensor checks. */
  toggle = (id: string): void => { this.update([id], (state) => toggleDeviceState(id, state)); };

  /** Preserve position invariants and advanced settings while dragging a quick slider. */
  setLevel = (id: string, level: number): void => { this.update([id], (state) => setDeviceLevelState(id, state, level)); };

  /** Commit the three bedroom fixtures in one patch so their quick switch cannot race itself. */
  setPower = (ids: readonly string[], on: boolean): void => {
    this.update(ids, (state, id) => state.on === on ? state : toggleDeviceState(id, state));
  };

  /** Finish acknowledged local edits when the panel closes, without retaining UI listeners. */
  dispose(): void {
    this.closed = true;
    this.listeners.clear();
    if (!this.pending.size) { this.session?.dispose(); this.session = null; }
  }

  /** Rebase later slider edits over older acknowledgements instead of visibly rolling them back. */
  private receive = (message: SimulationSnapshotMessage): void => {
    this.canonical = message.state;
    if (message.acknowledgedRequestId !== undefined) {
      for (const id of this.pending.keys()) if (id <= message.acknowledgedRequestId) this.pending.delete(id);
    }
    let state = this.canonical;
    for (const changes of this.pending.values()) state = mergeSimulationChanges(state, changes);
    this.publish({ ...this.value, state, ready: true });
    if (this.closed && !this.pending.size) { this.session?.dispose(); this.session = null; }
  };

  /** Queue immutable device replacements after optimistic application and validate at the bridge. */
  private update(ids: readonly string[], reduce: (state: DeviceState, id: string) => DeviceState): void {
    if (this.closed || !this.value.ready || !this.session) return;
    const deviceStates: Record<string, DeviceState> = {};
    for (const id of ids) {
      const current = this.value.state.deviceStates[id];
      if (!current || !getDevice(id)) continue;
      const next = reduce(current, id);
      if (next !== current) deviceStates[id] = next;
    }
    if (!Object.keys(deviceStates).length) return;
    const requestId = ++this.nextRequest;
    const changes: SimulationChanges = { deviceStates };
    this.pending.set(requestId, changes);
    this.publish({ ...this.value, state: mergeSimulationChanges(this.value.state, changes) });
    if (!this.session.handleMessage({ channel: 'vantahome-simulation', version: 1, type: 'patch', requestId, changes })) {
      this.pending.delete(requestId);
      let state = this.canonical;
      for (const pending of this.pending.values()) state = mergeSimulationChanges(state, pending);
      this.publish({ ...this.value, state, status: 'error' });
    }
  }

  /** Notify React after replacing the stable snapshot reference. */
  private publish(value: ControlSnapshot): void {
    this.value = value;
    for (const listener of this.listeners) listener();
  }
}
