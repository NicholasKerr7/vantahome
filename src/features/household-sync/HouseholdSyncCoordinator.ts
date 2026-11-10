import { equalSimulationDeviceState } from '../three-d-home/simulationStateEquality';
import { diffSimulationSnapshots, createDefaultSimulationSnapshot, type SimulationSnapshot, type DeviceState } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import type { SimulationPersistence, SimulationRemoteAdapter } from '../three-d-home/simulationPersistence';
import { HouseholdSyncError, type HouseholdSyncTransport, type SharedHomeScope, type SharedHomeSnapshot, type SharedWriteIntent } from './householdSyncTransport';

export type HouseholdSyncStatus = 'checking' | 'local' | 'connecting' | 'live' | 'syncing' | 'offline' | 'conflict' | 'unavailable';
export type HouseholdSyncView = {
  status: HouseholdSyncStatus; homeName: string; deviceCount: number;
  lastSyncedAt: number | null; error: string | null; busy: boolean;
};
type Persistence = Pick<SimulationPersistence, 'load' | 'getSnapshot' | 'attachRemote' | 'markShared' | 'releaseUnshared' | 'setRemoteStatus' | 'applyRemote'>;
type Options = {
  scope: SharedHomeScope; storageScope: string; persistence: Persistence; transport: HouseholdSyncTransport;
  clientId: string; requestId: () => string; current: () => boolean; accessChanged: () => void;
};
type EnableReview = { homeName: string; deviceCount: number; fingerprint: string; states: Record<string, DeviceState> };

/** Coordinate one account's authorized observations and strict, non-replayed shared transactions. */
export class HouseholdSyncCoordinator {
  private value: HouseholdSyncView = { status: 'checking', homeName: '', deviceCount: 0, lastSyncedAt: null, error: null, busy: false };
  private listeners = new Set<() => void>();
  private observed: SharedHomeSnapshot | null = null;
  private closed = false;
  private connected = false;
  private subscriptionGeneration = 0;
  private writing = false;
  private refreshing: Promise<void> | null = null;
  private dirty = false;
  private pendingRevisionChanges = new Set<string>();
  private writingIds = new Set<string>();
  private review: EnableReview | null = null;
  private leaseDeadline = 0;
  private connectionTimer: ReturnType<typeof setTimeout> | undefined;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private healthTimer: ReturnType<typeof setInterval> | undefined;
  private detach: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly adapter: SimulationRemoteAdapter;

  constructor(private readonly options: Options) {
    this.adapter = { transact: (before, after, intent) => this.transact(before, after, intent), canAdvance: () => this.canAdvance() };
  }

  /** Stable React external-store accessors; snapshots change only when visible status changes. */
  getSnapshot = (): HouseholdSyncView => this.value;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };

  /** Establish the read barrier before accepting any cached simulation command. */
  start(): void {
    this.attach();
    this.subscribeConnection();
    this.waitForConnection();
    void this.refresh();
    // A bounded foreground reconciliation also detects a missed event or an expired membership.
    this.healthTimer = setInterval(() => this.scheduleRefresh(), 30_000);
  }

  /** Replace a failed socket without accepting late callbacks from the old subscription. */
  private subscribeConnection(): void {
    const generation = ++this.subscriptionGeneration;
    this.unsubscribe?.();
    this.unsubscribe = this.options.transport.subscribe(() => { if (generation === this.subscriptionGeneration) this.scheduleRefresh(); }, (connected) => {
      if (!this.isCurrent() || generation !== this.subscriptionGeneration) return;
      this.connected = connected;
      if (connected) {
        if (this.connectionTimer) clearTimeout(this.connectionTimer);
        this.connectionTimer = undefined;
        this.scheduleRefresh();
      }
      else if (this.observed?.enabled) this.fail(new HouseholdSyncError('network', 'Connection lost. Shared controls are paused until verified again.'));
    });
  }

  /** Explicit recovery renews a failed socket and reads current state without resending commands. */
  reconnect = async (): Promise<void> => {
    if (!this.isCurrent() || this.writing) return;
    if (!this.connected) { this.subscribeConnection(); this.waitForConnection(); }
    await this.refresh();
  };

  /** A stalled subscription must expose recovery instead of leaving the home indefinitely connecting. */
  private waitForConnection(): void {
    if (this.connectionTimer || this.connected) return;
    this.connectionTimer = setTimeout(() => {
      this.connectionTimer = undefined;
      if (!this.connected && this.observed?.enabled !== false) {
        this.fail(new HouseholdSyncError('network', 'The shared connection is taking too long. Reconnect to verify your home.'));
      }
    }, 12_000);
  }

  /** One attachment owns this local cache; authoritative disabled reads may release it again. */
  private attach(): void {
    if (!this.detach) this.detach = this.options.persistence.attachRemote(this.options.storageScope, this.adapter);
  }

  /** Keep the active simulator clock on the phone that explicitly initiated this movement. */
  canAdvance(): boolean {
    return this.isCurrent() && this.connected && !this.writing && this.observed?.clock?.clientId === this.options.clientId
      && Date.now() < this.leaseDeadline && this.value.status === 'live';
  }

  /** Capture the exact current local baseline; opening a review never changes the household. */
  async prepareEnable(): Promise<{ homeName: string; deviceCount: number }> {
    await this.refresh();
    if (!this.isCurrent() || this.observed?.enabled !== false || !this.connected || this.value.status !== 'local' || this.value.error) throw new HouseholdSyncError('unavailable', 'Reconnect before reviewing sharing.');
    const snapshot = await this.options.persistence.load(this.options.storageScope);
    if (!this.isCurrent()) throw new HouseholdSyncError('scope_changed', 'Household access changed.');
    const states = Object.fromEntries(this.options.scope.bindings.map((binding) => [binding.modelDeviceId, snapshot.deviceStates[binding.modelDeviceId]]));
    this.review = { homeName: this.value.homeName, deviceCount: this.options.scope.bindings.length, states,
      fingerprint: JSON.stringify(states) };
    return { homeName: this.review.homeName, deviceCount: this.review.deviceCount };
  }

  /** Discard a private review when its sheet closes or the account leaves the foreground. */
  cancelReview(): void { this.review = null; }

  /** Seed once using the reviewed Owner baseline; uncertain results are read back, never blindly seeded again. */
  async enable(): Promise<void> {
    const review = this.review;
    this.review = null;
    if (!review || !this.isCurrent() || this.writing || this.observed?.enabled !== false || !this.connected) return;
    const current = await this.options.persistence.load(this.options.storageScope);
    const states = Object.fromEntries(this.options.scope.bindings.map((binding) => [binding.modelDeviceId, current.deviceStates[binding.modelDeviceId]]));
    if (!this.isCurrent() || JSON.stringify(states) !== review.fingerprint) {
      throw new HouseholdSyncError('VH409', 'Device settings changed during review. Review sharing again.');
    }
    this.attach();
    this.writing = true;
    this.publish({ status: 'syncing', busy: true, error: null });
    try {
      const snapshot = await this.options.transport.enable(this.options.requestId(), review.states);
      if (!this.isCurrent()) return;
      await this.accept(snapshot, current, false);
    } catch (error) {
      this.fail(error);
      throw error;
    } finally { this.writing = false; this.dirty = true; this.publish({ busy: false }); this.flushRefresh(); }
  }

  /** Refresh from a current server read, coalescing notifications while a transaction is in flight. */
  refresh = (): Promise<void> => {
    if (!this.isCurrent()) return Promise.resolve();
    if (this.writing) { this.dirty = true; return Promise.resolve(); }
    if (this.refreshing) { this.dirty = true; return this.refreshing; }
    this.refreshing = this.read().finally(() => { this.refreshing = null; this.flushRefresh(); });
    return this.refreshing;
  };

  /** Keep a failed read distinct from a verified local-only home. */
  private async read(): Promise<void> {
    try {
      const [snapshot, local] = await Promise.all([this.options.transport.read(), this.options.persistence.load(this.options.storageScope)]);
      if (this.isCurrent()) await this.accept(snapshot, local, false);
    } catch (error) { this.fail(error); }
  }

  /** Overlay only server-authorized model states, retaining personal rendering preferences. */
  private merge(snapshot: SharedHomeSnapshot, local: SimulationSnapshot): SimulationSnapshot {
    const defaults = createDefaultSimulationSnapshot().deviceStates;
    const devices = Object.fromEntries(this.options.scope.bindings.map((binding) => [binding.modelDeviceId, defaults[binding.modelDeviceId]]));
    for (const row of snapshot.devices) devices[row.modelDeviceId] = row.state;
    return { ...local, deviceStates: { ...local.deviceStates, ...devices } };
  }

  /** Update receipts using revisions, including an unseen edit that later returned to its previous value. */
  private async accept(snapshot: SharedHomeSnapshot, local: SimulationSnapshot, ownWrite: boolean): Promise<SimulationSnapshot> {
    if (!this.isCurrent()) throw new HouseholdSyncError('scope_changed', 'Household access changed.');
    const previous = this.observed;
    if (previous?.enabled && !snapshot.enabled) throw new HouseholdSyncError('invalid_response', 'Shared home status changed unexpectedly. Reconnect to verify it.');
    if (previous?.devices.some((old) => !snapshot.devices.some((row) => row.deviceId === old.deviceId))) {
      this.options.accessChanged();
      throw new HouseholdSyncError('scope_changed', 'Device access changed. Verifying your household.');
    }
    for (const row of snapshot.devices) {
      const old = previous?.devices.find((item) => item.deviceId === row.deviceId);
      if (old && row.revision < old.revision) throw new HouseholdSyncError('invalid_response', 'A stale shared-home response was rejected. Reconnect to verify the latest state.');
    }
    if (!snapshot.enabled) {
      if (this.detach && !await this.options.persistence.releaseUnshared(this.options.storageScope, this.adapter)) throw new HouseholdSyncError('invalid_response', 'Previously shared controls need verification.');
      this.detach = null;
      this.observed = snapshot;
      this.publish({ status: 'local', homeName: snapshot.homeName, deviceCount: this.options.scope.bindings.length, lastSyncedAt: Date.now(), error: null });
      return local;
    }
    this.attach();
    await this.options.persistence.markShared(this.options.storageScope, this.adapter);
    if (!this.isCurrent()) throw new HouseholdSyncError('scope_changed', 'Household access changed.');
    const changed = snapshot.devices.filter((row) => {
      const old = previous?.devices.find((item) => item.deviceId === row.deviceId);
      return !old || old.revision !== row.revision;
    }).map((row) => row.modelDeviceId);
    const merged = this.merge(snapshot, local);
    this.observed = snapshot;
    this.leaseDeadline = Date.now() + Math.max(0, (snapshot.clock?.expiresAtMs ?? snapshot.serverTimeMs) - snapshot.serverTimeMs);
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    if (snapshot.clock) this.expiryTimer = setTimeout(() => this.scheduleRefresh(), Math.max(1, this.leaseDeadline - Date.now() + 60));
    if (ownWrite) {
      for (const id of changed) if (!this.writingIds.has(id)) this.pendingRevisionChanges.add(id);
    } else {
      this.options.persistence.applyRemote(this.options.storageScope, merged, [...new Set([...changed, ...this.pendingRevisionChanges])]);
      this.pendingRevisionChanges.clear();
    }
    if (!this.connected) this.waitForConnection();
    this.options.persistence.setRemoteStatus(this.options.storageScope, this.connected ? 'shared' : 'connecting');
    this.publish({ status: this.connected ? 'live' : 'connecting', homeName: snapshot.homeName,
      deviceCount: this.options.scope.bindings.length, lastSyncedAt: Date.now(), error: null });
    return merged;
  }

  /** Strict compare-and-swap prevents local cached edits or stale ticks from replacing a newer person's state. */
  private async transact(previous: SimulationSnapshot, next: SimulationSnapshot, intent: SharedWriteIntent): Promise<SimulationSnapshot> {
    if (this.refreshing) await this.refreshing;
    if (!this.isCurrent() || !this.connected || !this.observed?.enabled || this.writing
      || !['live', 'syncing'].includes(this.value.status)) throw new HouseholdSyncError('unavailable', 'Reconnect before changing shared controls.');
    const changes = diffSimulationSnapshots(previous, next).deviceStates ?? {};
    const submitted = Object.entries(changes).map(([modelDeviceId, state]) => {
      const binding = this.options.scope.bindings.find((entry) => entry.modelDeviceId === modelDeviceId);
      const row = this.observed!.devices.find((entry) => entry.modelDeviceId === modelDeviceId);
      if (!binding || (row && !equalSimulationDeviceState(row.state, previous.deviceStates[modelDeviceId]))) {
        const error = new HouseholdSyncError('VH409', 'This device changed during your action. Refresh and try again.');
        this.fail(error); this.scheduleRefresh();
        throw error;
      }
      return { ...binding, expectedRevision: row?.revision ?? 0, state };
    });
    // A scene may alter only personal presentation or create an explicit same-value receipt.
    if (!submitted.length) return { ...next, deviceStates: this.merge(this.observed, previous).deviceStates };
    if (intent !== 'command' && !this.canAdvance()) throw new HouseholdSyncError('VH409', 'The gate timer belongs to another active controller.');
    this.writing = true;
    this.writingIds = new Set(submitted.map((row) => row.modelDeviceId));
    this.options.persistence.setRemoteStatus(this.options.storageScope, 'syncing');
    this.publish({ status: 'syncing', busy: true, error: null });
    try {
      const snapshot = await this.options.transport.patch(this.options.requestId(), this.options.clientId, intent, submitted);
      return await this.accept(snapshot, next, true);
    } catch (error) {
      // Foreground intervals can arrive just before the server's one-second boundary.
      // Keep the prior accepted state and let the next ordinary tick try; never speed up the gate.
      if (intent === 'tick' && error instanceof HouseholdSyncError && error.code === 'VH429') {
        this.options.persistence.setRemoteStatus(this.options.storageScope, 'shared');
        this.publish({ status: 'live', error: null });
        return previous;
      }
      this.fail(error);
      // Refresh, rather than replay, resolves both conflicts and an accepted command whose response was lost.
      this.dirty = true;
      throw error;
    } finally { this.writing = false; this.writingIds.clear(); this.dirty = true; this.publish({ busy: false }); this.flushRefresh(); }
  }

  /** Coalesce duplicate realtime hints; server authorization always precedes data publication. */
  private scheduleRefresh(): void {
    if (!this.isCurrent()) return;
    this.dirty = true;
    if (this.refreshTimer || this.writing || this.refreshing) return;
    this.refreshTimer = setTimeout(() => { this.refreshTimer = undefined; this.dirty = false; void this.refresh(); }, 80);
  }

  /** Run one deferred read after a pending operation has left its critical section. */
  private flushRefresh(): void { if (this.dirty) this.scheduleRefresh(); }

  /** Fail closed without publishing a local-only command as shared success. */
  private fail(error: unknown): void {
    if (!this.isCurrent()) return;
    const status = error instanceof HouseholdSyncError && error.code === 'VH409' ? 'conflict' : 'offline';
    this.options.persistence.setRemoteStatus(this.options.storageScope, status);
    this.review = null;
    this.publish({ status, busy: false, error: error instanceof HouseholdSyncError ? error.message : 'Shared home is unavailable. Reconnect to verify the latest state.' });
    if (error instanceof HouseholdSyncError && error.code === '42501') this.options.accessChanged();
  }

  /** Captured scopes remain invalid after disposal even if the same person returns later. */
  private isCurrent(): boolean { return !this.closed && this.options.current(); }

  /** Avoid publishing unchanged status objects on every ordinary server check. */
  private publish(patch: Partial<HouseholdSyncView>): void {
    if (this.closed) return;
    const next = { ...this.value, ...patch };
    if (JSON.stringify(next) === JSON.stringify(this.value)) return;
    this.value = next;
    for (const listener of this.listeners) listener();
  }

  /** Close this account's transport and timers; detached shared caches stay read-only. */
  close(): void {
    this.closed = true;
    this.review = null;
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    if (this.connectionTimer) clearTimeout(this.connectionTimer);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.unsubscribe?.(); this.options.transport.close(); this.detach?.();
    this.listeners.clear();
  }
}
