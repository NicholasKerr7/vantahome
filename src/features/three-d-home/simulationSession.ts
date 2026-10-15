import { GATE_DEVICE_ID } from '../../../packages/home-scene/src/gateSafetySimulation';
import { pauseSafetySimulation } from '../../../packages/home-scene/src/safetySimulation';
import { projectFireSimulationToDemo } from './fireDemoMapping';
import { resolveDemoDeviceMapping } from './demoDeviceMapping';
import type { StoreApi } from 'zustand';
import { runtimePolicy, type RuntimeMode } from '../../config/runtimeMode';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';
import {
  diffSimulationSnapshots, parseSimulationRequest, rebaseSimulationChanges,
  type SimulationSnapshot, type SimulationSnapshotMessage,
} from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { overlayDemoDevices, projectSimulationToDemo } from './demoDeviceMapping';
import { simulationPersistence, type SimulationPersistence, type SimulationSaveStatus } from './simulationPersistence';
import { parseSceneCatalogRequest, SCENE_CATALOG_CHANNEL, type SceneCatalogMessage, type SceneCatalogRequest } from '../../../packages/home-scene/src/sceneCatalogProtocol';
import { canShareModelScenes, modelSceneCatalog } from './modelSceneCatalog';
import { modelSimulationIdentity, modelSimulationScope, resolveModelSceneAccess, scopeSimulationSnapshot } from './modelSceneAccess';
import { EMPTY_SCENE_ACCESS } from '../../../packages/home-scene/src/sceneAccess';
import { getRuntimePlacements } from '../../../packages/home-scene/src/devicePlacement';
import { reconcileSimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { synchronizeRuntimeDeviceCatalog } from './runtimeDeviceCatalog';
import { AUTHORED_DEVICES } from '../../../packages/home-scene/src/data';

type HomeStore = Pick<StoreApi<HomeState>, 'getState' | 'setState' | 'subscribe'>;
type SessionOptions = { store?: HomeStore; persistence?: SimulationPersistence; mode?: RuntimeMode; onSceneCatalog?: (message: SceneCatalogMessage) => void };

/** Share only an offline, unauthenticated owner demonstration, never household observations. */
export function canShareDemoDevices(state: HomeState, mode: RuntimeMode): boolean {
  const member = state.household.find((candidate) => candidate.id === state.activeMemberId);
  return mode === 'demo' && !state.accountUserId && !state.authenticatedUserId
    && !state.accountHomeId && !state.activeHomeId && !state.realtime.enabled
    && !state.realtime.useMqtt && member?.role === 'Owner';
}

/** Exchange only validated simulation snapshots; this class has no device-command transport. */
export class SimulationSession {
  private readonly store: HomeStore;
  private readonly persistence: SimulationPersistence;
  private readonly identity: string;
  private readonly scope: string;
  private readonly sharedDemo: boolean;
  private readonly mode: RuntimeMode;
  private readonly deliverCatalog?: (message: SceneCatalogMessage) => void;
  private catalogRequested = false;
  private lastSceneRequestId = 0;
  private state: SimulationSnapshot | null = null;
  private ready: Promise<void>;
  private disposed = false;
  private requested = false;
  private projecting = false;
  private lastRequestId = 0;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribeStore: () => void;
  private unsubscribePersistence: () => void;
  private unsubscribeState: () => void;

  /** Capture the current scope before asynchronous hydration can race an account change. */
  constructor(
    private readonly deliver: (message: SimulationSnapshotMessage) => void,
    private readonly onSaveStatus: (status: SimulationSaveStatus) => void,
    options: SessionOptions = {},
  ) {
    this.store = options.store ?? useHomeStore;
    this.persistence = options.persistence ?? simulationPersistence;
    this.mode = options.mode ?? runtimePolicy.mode;
    this.deliverCatalog = options.onSceneCatalog;
    const home = this.store.getState();
    synchronizeRuntimeDeviceCatalog(home);
    this.identity = modelSimulationIdentity(home);
    this.sharedDemo = canShareDemoDevices(home, this.mode);
    // Account identifiers stay in the host's local storage key and never cross the frame boundary.
    this.scope = modelSimulationScope(home, this.sharedDemo);
    this.unsubscribePersistence = this.persistence.subscribe(this.scope, onSaveStatus);
    this.unsubscribeState = this.persistence.subscribeState(this.scope, (next) => {
      if (this.disposed || next === this.state) return;
      const restoring = this.state === null;
      if (!this.state) this.restoreState(next);
      else this.state = next;
      if (this.requested) this.sendSnapshot();
      if (restoring && this.catalogRequested) this.sendSceneCatalog();
    });
    this.unsubscribeStore = this.store.subscribe((state, previous) => {
      synchronizeRuntimeDeviceCatalog(state);
      if (modelSimulationIdentity(state) !== this.identity) {
        // Preserve an interruption within the previous verified scope before teardown.
        this.pauseAuthorizedSafety(previous);
        this.revokeAccess();
        this.dispose();
        onSaveStatus('disconnected');
        return;
      }
      const registryChanged = state.devices !== previous.devices && (state.devices.length !== previous.devices.length
        || state.devices.some((device, index) => {
          const before = previous.devices[index];
          return device.id !== before?.id || device.kind !== before?.kind || device.roomId !== before?.roomId
            || device.modelDeviceId !== before?.modelDeviceId || device.simulationOnly !== before?.simulationOnly
            || device.name !== before?.name || JSON.stringify(device.modelPlacement) !== JSON.stringify(before?.modelPlacement);
        }));
      const accessChanged = state.roomMembers !== previous.roomMembers || state.memberPermissionOverrides !== previous.memberPermissionOverrides
        || state.household !== previous.household || state.rooms !== previous.rooms || state.membershipReady !== previous.membershipReady
        || registryChanged;
      if (accessChanged) {
        if (this.state && state.membershipReady) {
          const reconciled = reconcileSimulationSnapshot(this.state);
          if (reconciled !== this.state) { this.state = reconciled; this.persistence.save(this.scope, reconciled); }
        }
        if (!resolveModelSceneAccess(state, this.mode).controllableDeviceIds.includes(GATE_DEVICE_ID)) this.pauseAuthorizedSafety(previous);
        this.scheduleExpiry();
        if (this.requested) this.sendSnapshot();
      }
      // Slider changes do not alter metadata; registry or authorization changes can affect visibility.
      if (this.catalogRequested && (state.scenes !== previous.scenes || state.activeSceneId !== previous.activeSceneId
        || accessChanged)) this.sendSceneCatalog();
      if (!this.sharedDemo || this.projecting || !this.state || state.devices === previous.devices) return;
      const previousSnapshot = this.state;
      const next = overlayDemoDevices(this.state, state.devices, previous.devices);
      if (next === this.state) return;
      this.state = next;
      this.persistence.save(this.scope, next);
      // Reflect normalized positions back into the catalog so a later native edit
      // cannot restore the stale opening value that preceded a toggle routine.
      const devices = projectSimulationToDemo(next, previousSnapshot, this.store.getState().devices);
      this.projecting = true;
      try { if (devices !== this.store.getState().devices) this.store.setState({ devices }); }
      finally { this.projecting = false; }
      if (this.requested) this.sendSnapshot();
    });
    this.scheduleExpiry();
    this.ready = this.persistence.load(this.scope).then((saved) => {
      if (this.disposed) return;
      if (!this.state) this.restoreState(saved);
    }).catch(() => {
      // Persistence already reports an actionable read failure. Keep authority closed;
      // reopening/retrying can re-read the original cache without resetting it.
    });
  }

  /** Install a validated baseline once, including recovery initiated by another open surface. */
  private restoreState(saved: SimulationSnapshot): void {
    const reconciled = reconcileSimulationSnapshot(saved);
    this.state = this.sharedDemo ? overlayDemoDevices(reconciled, this.store.getState().devices) : reconciled;
    if (this.sharedDemo) {
      // Persisted simulation alarms are authoritative; default host flags must not erase them.
      const current = this.store.getState().devices;
      const devices = current.map((device) => {
        const mapping = resolveDemoDeviceMapping(device);
        const simulated = mapping && this.state?.deviceStates[mapping.sceneId];
        return simulated ? projectFireSimulationToDemo(device, simulated) : device;
      });
      this.projecting = true;
      try { if (devices.some((device, index) => device !== current[index])) this.store.setState({ devices }); }
      finally { this.projecting = false; }
    }
  }

  /** Process ordered patches only after hydration and an explicit handshake. */
  handleMessage(input: unknown): boolean {
    const catalogRequest = parseSceneCatalogRequest(input);
    if (catalogRequest) return this.handleSceneRequest(catalogRequest);
    const message = parseSimulationRequest(input);
    if (!message) return false;
    if (this.disposed) return true;
    if (message.type === 'request') this.requested = true;
    // No renderer may queue edits against defaults before receiving a restored baseline.
    if (message.type === 'patch' && !this.state) return true;
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
      const access = resolveModelSceneAccess(this.store.getState(), this.mode);
      // Reject an entire mixed transaction, so a permitted light cannot smuggle a gate or camera edit.
      const allowed = new Set(access.controllableDeviceIds);
      const changedIds = Object.keys(message.changes.deviceStates ?? {});
      if (!access.roomIds.length || changedIds.some((id) => !allowed.has(id))) {
        this.sendSnapshot(message.requestId);
        return;
      }
      const next = rebaseSimulationChanges(previous, message.base, message.changes);
      // Safety simulations may span several devices. Do not let their derived effects widen a partial grant.
      if (Object.keys(diffSimulationSnapshots(previous, next).deviceStates ?? {}).some((id) => !allowed.has(id))) {
        this.sendSnapshot(message.requestId);
        return;
      }
      this.state = next;
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

  /** Execute only a currently visible, known local scene; never accept actions or physical commands from a frame. */
  private handleSceneRequest(message: SceneCatalogRequest): boolean {
    if (this.disposed || !this.deliverCatalog) return true;
    if (message.type === 'request') this.catalogRequested = true;
    if (message.type !== 'request' && !this.state) return true;
    this.ready = this.ready.then(async () => {
      if (this.disposed || !this.state) return;
      if (message.type === 'request') {
        this.catalogRequested = true;
        this.sendSceneCatalog();
        return;
      }
      if (!this.catalogRequested || message.requestId <= this.lastSceneRequestId) return;
      this.lastSceneRequestId = message.requestId;
      const current = this.store.getState();
      const catalog = modelSceneCatalog(current, this.mode);
      if (!canShareModelScenes(current, this.mode) || !catalog.scenes.some((scene) => scene.id === message.sceneId)) {
        this.sendSceneCatalog();
        return;
      }
      await current.runScene(message.sceneId);
      if (!this.disposed) { this.sendSceneCatalog(); if (this.requested) this.sendSnapshot(); }
    }).catch(() => { if (!this.disposed) this.onSaveStatus('error'); });
    return true;
  }

  /** Scene summaries always come from the same native collection and active identity as the Scenes screen. */
  private sendSceneCatalog(): void {
    if (this.disposed || !this.deliverCatalog) return;
    try {
      this.deliverCatalog({ channel: SCENE_CATALOG_CHANNEL, version: 1, type: 'catalog', catalog: modelSceneCatalog(this.store.getState(), this.mode) });
    } catch { this.dispose(); this.onSaveStatus('disconnected'); }
  }

  /** Commit a foreground interruption synchronously, before membership or renderer teardown. */
  pauseSafety(): void {
    this.pauseAuthorizedSafety(this.store.getState());
  }

  /** Pause only this already-hydrated, authorized simulation scope; never load or touch another home. */
  private pauseAuthorizedSafety(home: HomeState): void {
    if (this.disposed || !this.state || modelSimulationIdentity(home) !== this.identity
      || !resolveModelSceneAccess(home, this.mode).controllableDeviceIds.includes(GATE_DEVICE_ID)) return;
    const deviceStates = pauseSafetySimulation(this.state.deviceStates);
    if (deviceStates === this.state.deviceStates) return;
    this.state = { ...this.state, deviceStates };
    this.persistence.save(this.scope, this.state);
    if (this.requested) this.sendSnapshot();
  }

  /** Stop all cross-view updates when the frame closes, while accepted disk writes finish. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeStore();
    this.unsubscribePersistence();
    this.unsubscribeState();
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
  }

  /** Reject queued host navigation immediately when this scene loses its current permission scope. */
  canNavigate(): boolean {
    return !this.disposed && this.state !== null && resolveModelSceneAccess(this.store.getState(), this.mode).propertyOverview === true;
  }

  /** Send the complete canonical snapshot so either renderer can recover after reopening. */
  private sendSnapshot(acknowledgedRequestId?: number): void {
    if (!this.state || this.disposed) return;
    try {
      const home = this.store.getState();
      if (modelSimulationIdentity(home) !== this.identity) { this.revokeAccess(); return; }
      synchronizeRuntimeDeviceCatalog(home);
      const access = modelSimulationIdentity(home) === this.identity ? resolveModelSceneAccess(home, this.mode) : EMPTY_SCENE_ACCESS;
      this.deliver({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state: scopeSimulationSnapshot(this.state, access), access, placements: getRuntimePlacements(),
        ...(acknowledgedRequestId === undefined ? {} : { acknowledgedRequestId }) });
    } catch {
      // A terminated WebView must not throw through a dashboard store update.
      this.dispose();
      this.onSaveStatus('disconnected');
    }
  }

  /** Expire an open scene at the deadline even when no store update or user action occurs. */
  private scheduleExpiry(): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    const home = this.store.getState();
    const member = home.household.find((entry) => entry.id === home.activeMemberId);
    const deadline = member?.role === 'Guest' && member.accessExpiresAt ? Date.parse(member.accessExpiresAt) : NaN;
    if (!Number.isFinite(deadline) || deadline <= Date.now()) return;
    this.expiryTimer = setTimeout(() => {
      if (this.disposed) return;
      this.sendSnapshot();
      this.scheduleExpiry();
    }, Math.min(deadline - Date.now() + 1, 2_147_000_000));
  }

  /** Remove the previous identity's presentation before disconnecting an existing frame or inspector. */
  private revokeAccess(): void {
    try {
      if (this.state && this.requested) this.deliver({ channel: 'vantahome-simulation', version: 1, type: 'snapshot',
        state: scopeSimulationSnapshot(this.state, EMPTY_SCENE_ACCESS, AUTHORED_DEVICES), access: EMPTY_SCENE_ACCESS, placements: [] });
      if (this.catalogRequested) this.deliverCatalog?.({ channel: SCENE_CATALOG_CHANNEL, version: 1, type: 'catalog',
        catalog: { scenes: [], activeSceneId: null } });
    }
    catch { /* Teardown can already have detached its renderer. */ }
  }
}

/** Encode data as a literal; simulated settings can never become executable bridge code. */
export function nativeSimulationSnapshotScript(message: SimulationSnapshotMessage): string {
  const payload = JSON.stringify(message).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `window.dispatchEvent(new CustomEvent('vantahome-simulation',{detail:${payload}}));true;`;
}
