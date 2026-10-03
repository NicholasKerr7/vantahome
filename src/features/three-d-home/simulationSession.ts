import { projectFireSimulationToDemo } from './fireDemoMapping';
import { resolveDemoDeviceMapping } from './demoDeviceMapping';
import type { StoreApi } from 'zustand';
import { runtimePolicy, type RuntimeMode } from '../../config/runtimeMode';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';
import {
  diffSimulationSnapshots, mergeSimulationChanges, parseSimulationRequest,
  type SimulationChanges, type SimulationSnapshot, type SimulationSnapshotMessage,
} from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { overlayDemoDevices, projectSimulationToDemo } from './demoDeviceMapping';
import { simulationPersistence, type SimulationPersistence, type SimulationSaveStatus } from './simulationPersistence';
import { parseSceneCatalogRequest, SCENE_CATALOG_CHANNEL, type SceneCatalogMessage, type SceneCatalogRequest } from '../../../packages/home-scene/src/sceneCatalogProtocol';
import { canShareModelScenes, modelSceneCatalog } from './modelSceneCatalog';
import { modelSimulationIdentity, modelSimulationScope, resolveModelSceneAccess, scopeSimulationSnapshot } from './modelSceneAccess';
import { EMPTY_SCENE_ACCESS } from '../../../packages/home-scene/src/sceneAccess';

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
  private pendingPatches = new Map<number, { base: SimulationSnapshot; changes: SimulationChanges }>();

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
    this.identity = modelSimulationIdentity(home);
    this.sharedDemo = canShareDemoDevices(home, this.mode);
    // Account identifiers stay in the host's local storage key and never cross the frame boundary.
    this.scope = modelSimulationScope(home, this.sharedDemo);
    this.unsubscribePersistence = this.persistence.subscribe(this.scope, onSaveStatus);
    this.unsubscribeState = this.persistence.subscribeState(this.scope, (next) => {
      if (this.disposed || !this.state || next === this.state) return;
      this.state = next;
      if (this.requested) this.sendSnapshot();
    });
    this.unsubscribeStore = this.store.subscribe((state, previous) => {
      if (modelSimulationIdentity(state) !== this.identity) {
        this.revokeAccess();
        this.dispose();
        onSaveStatus('disconnected');
        return;
      }
      const registryChanged = state.devices !== previous.devices && (state.devices.length !== previous.devices.length
        || state.devices.some((device, index) => {
          const before = previous.devices[index];
          return device.id !== before?.id || device.kind !== before?.kind || device.roomId !== before?.roomId
            || device.modelDeviceId !== before?.modelDeviceId;
        }));
      if (state.roomMembers !== previous.roomMembers || state.memberPermissionOverrides !== previous.memberPermissionOverrides
        || state.household !== previous.household || state.rooms !== previous.rooms || state.membershipReady !== previous.membershipReady
        || registryChanged) {
        this.scheduleExpiry();
        if (this.requested) this.sendSnapshot();
      }
      // Slider changes do not alter scene metadata; only registry changes can affect visibility.
      if (this.catalogRequested && (state.scenes !== previous.scenes || state.activeSceneId !== previous.activeSceneId
        || state.rooms !== previous.rooms || registryChanged)) this.sendSceneCatalog();
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
      this.state = this.sharedDemo ? overlayDemoDevices(saved, this.store.getState().devices) : saved;
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
    });
  }

  /** Process ordered patches only after hydration and an explicit handshake. */
  handleMessage(input: unknown): boolean {
    const catalogRequest = parseSceneCatalogRequest(input);
    if (catalogRequest) return this.handleSceneRequest(catalogRequest);
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
      const access = resolveModelSceneAccess(this.store.getState(), this.mode);
      // Reject an entire mixed transaction, so a permitted light cannot smuggle a gate or camera edit.
      const allowed = new Set(access.controllableDeviceIds);
      const changedIds = Object.keys(message.changes.deviceStates ?? {});
      if (!access.roomIds.length || changedIds.some((id) => !allowed.has(id))) {
        this.sendSnapshot(message.requestId);
        return;
      }
      const next = pending ? rebaseChanges(previous, pending.base, pending.changes) : mergeSimulationChanges(previous, message.changes);
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
    this.ready = this.ready.then(async () => {
      if (this.disposed) return;
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

  /** Stop all cross-view updates when the frame closes, while accepted disk writes finish. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeStore();
    this.unsubscribePersistence();
    this.unsubscribeState();
    this.pendingPatches.clear();
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
  }

  /** Send the complete canonical snapshot so either renderer can recover after reopening. */
  private sendSnapshot(acknowledgedRequestId?: number): void {
    if (!this.state || this.disposed) return;
    try {
      const access = resolveModelSceneAccess(this.store.getState(), this.mode);
      this.deliver({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state: scopeSimulationSnapshot(this.state, access), access,
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
    if (!this.state || !this.requested) return;
    try { this.deliver({ channel: 'vantahome-simulation', version: 1, type: 'snapshot',
      state: scopeSimulationSnapshot(this.state, EMPTY_SCENE_ACCESS), access: EMPTY_SCENE_ACCESS }); }
    catch { /* Teardown can already have detached its renderer. */ }
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
