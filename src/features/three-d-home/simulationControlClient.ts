import { getDevice } from '../../../packages/home-scene/src/data';
import { applyDeviceSetting, runDeviceActionState, setDeviceLevelState, toggleDeviceState } from '../../../packages/home-scene/src/deviceControlActions';
import { createDefaultSimulationSnapshot, diffSimulationSnapshots, mergeSimulationChanges, type SimulationChanges, type SimulationSnapshot, type SimulationSnapshotMessage } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { advanceSafetySimulation, pauseSafetySimulation } from '../../../packages/home-scene/src/safetySimulation';
import { acknowledgeFireIncident, clearSimulatedFireSources, resetFireIncident } from '../../../packages/home-scene/src/fireSafetySimulation';
import type { DeviceStates } from '../../../packages/home-scene/src/simulationTypes';
import type { DeviceState, SettingValue } from '../../../packages/home-scene/src/simulationTypes';
import { EMPTY_SCENE_ACCESS, type SceneAccess } from '../../../packages/home-scene/src/sceneAccess';
import { SimulationSession } from './simulationSession';
import type { SimulationSaveStatus } from './simulationPersistence';

type Session = Pick<SimulationSession, 'handleMessage' | 'dispose'>;
type SessionFactory = (deliver: (message: SimulationSnapshotMessage) => void, status: (status: SimulationSaveStatus) => void) => Session;
export type ControlSnapshot = { state: SimulationSnapshot; ready: boolean; status: SimulationSaveStatus; access?: SceneAccess };

/** A renderer-independent, optimistic client for the existing local simulation bridge. */
export class SimulationControlClient {
  private value: ControlSnapshot = { state: createDefaultSimulationSnapshot(), ready: false, status: 'saving', access: EMPTY_SCENE_ACCESS };
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

  /** Advance only active foreground seconds; idle ticks do not write storage. */
  advanceSafety = (seconds: number): void => { this.updateSafety((states) => advanceSafetySimulation(states, seconds)); };

  /** Interrupt motion/countdowns on background without using wall-clock catch-up. */
  pauseSafety = (): void => { this.updateSafety(pauseSafetySimulation); };

  /** Acknowledge a preview while preserving its alarm and emergency hold. */
  acknowledgeFire = (): void => { this.updateSafety(acknowledgeFireIncident); };

  /** Clear sample detector inputs, leaving the incident latched for explicit reset. */
  clearFireSources = (): void => { this.updateSafety(clearSimulatedFireSources); };

  /** Reset only a globally clear incident; no real-device transport is reachable. */
  resetFire = (): void => { this.updateSafety(resetFireIncident); };

  /** Diff cross-device operations so concurrent surfaces retain unrelated edits. */
  private updateSafety(reduce: (states: DeviceStates) => DeviceStates): void {
    const state = this.value.state;
    const next = reduce(state.deviceStates);
    if (next === state.deviceStates) return;
    const changes = diffSimulationSnapshots(state, { ...state, deviceStates: next });
    this.commit(changes);
  }

  /** Finish acknowledged local edits when the panel closes, without retaining UI listeners. */
  dispose(): void {
    this.closed = true;
    this.listeners.clear();
    if (!this.pending.size) { this.session?.dispose(); this.session = null; }
  }

  /** Rebase later slider edits over older acknowledgements instead of visibly rolling them back. */
  private receive = (message: SimulationSnapshotMessage): void => {
    this.canonical = message.state;
    const access = message.access ?? EMPTY_SCENE_ACCESS;
    if (JSON.stringify(access) !== JSON.stringify(this.value.access)) this.pending.clear();
    if (message.acknowledgedRequestId !== undefined) {
      for (const id of this.pending.keys()) if (id <= message.acknowledgedRequestId) this.pending.delete(id);
    }
    let state = this.canonical;
    for (const changes of this.pending.values()) state = mergeSimulationChanges(state, changes);
    this.publish({ ...this.value, state, access, ready: true });
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
    this.commit({ deviceStates });
  }

  /** Submit bounded local changes through the same bridge as the rendered model. */
  private commit(changes: SimulationChanges): void {
    if (this.closed || !this.value.ready || !this.session || !changes.deviceStates || !Object.keys(changes.deviceStates).length) return;
    if (Object.keys(changes.deviceStates).some((id) => !this.value.access?.controllableDeviceIds.includes(id))) return;
    const next = mergeSimulationChanges(this.value.state, changes);
    // Cross-device safety effects must stay inside the grant before any optimistic state appears.
    if (Object.keys(diffSimulationSnapshots(this.value.state, next).deviceStates ?? {})
      .some((id) => !this.value.access?.controllableDeviceIds.includes(id))) return;
    const requestId = ++this.nextRequest;
    this.pending.set(requestId, changes);
    this.publish({ ...this.value, state: next });
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
