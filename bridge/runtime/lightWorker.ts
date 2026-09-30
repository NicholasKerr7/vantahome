import type { LightAdmission } from "../lightAdmission";
import {
  permitsLightPower, sameLightBinding,
  type LightAuthorizer, type LightCommandRecord, type LightPrincipal,
} from "../lightContract";
import {
  expireLightCommand, interruptLightCommand, planLightDispatch,
  recordLightObservation, recordLightServiceResult, type LightServiceCall,
} from "../lightLifecycle";
import { SqliteLightJournal } from "./sqliteLightJournal";
import type { LightAdapter, LightAdapterEvent, LightAdapterSnapshot } from "./types";

/** Local worker receipts report observed HA state, never physical confirmation. */
export type LightSubmission =
  | { kind: "reserved" | "duplicate"; record: LightCommandRecord }
  | { kind: "refused"; reason: Extract<LightAdmission, { kind: "refused" }>["reason"] | "unavailable" | "storage_unavailable" };

/** Dependencies belong to a trusted host; a supplied principal is not phone authentication. */
export type LightWorkerOptions = {
  journal: SqliteLightJournal;
  adapter: LightAdapter;
  authorize: LightAuthorizer;
  clock?: () => number;
  /** Zero permits deterministic manual tick tests; deployed workers use the default timer. */
  tickIntervalMs?: number;
};

/**
 * Executes only the one configured light's explicit power requests. Admission,
 * dispatch intent, results and observations are committed before being reported.
 * No HTTP listener, mobile pairing, credential loading or cloud queue is enabled.
 */
export class LightWorker {
  private readonly journal: SqliteLightJournal;
  private readonly adapter: LightAdapter;
  private readonly authorize: LightAuthorizer;
  private readonly clock: () => number;
  private readonly unsubscribe: () => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: "running" | "stopped" | "storage-failed" = "running";

  /** Observe an explicitly provided adapter; constructing a worker never connects it. */
  constructor(options: LightWorkerOptions) {
    this.journal = options.journal;
    this.adapter = options.adapter;
    this.authorize = options.authorize;
    this.clock = options.clock ?? Date.now;
    const interval = options.tickIntervalMs ?? 250;
    if (!Number.isSafeInteger(interval) || interval < 0 || interval > 1000) throw new Error("invalid_tick_interval");
    this.unsubscribe = this.adapter.subscribe((event) => this.handleEvent(event));
    if (interval > 0) {
      this.timer = setInterval(() => this.tick(), interval);
      this.timer.unref();
    }
  }

  /** Expose a sanitized operational state without leaking storage or transport errors. */
  health(): "running" | "stopped" | "storage-failed" { return this.state; }

  /** Transport read failures mean unavailable state, not broken persistent storage. */
  private snapshot(): LightAdapterSnapshot | null {
    try { return this.adapter.getSnapshot(); } catch { return null; }
  }

  /** Stop all effects after a failed commit; reopening storage performs crash recovery. */
  private failStorage(): void {
    this.state = "storage-failed";
    this.clearSubscriptions();
    try { this.adapter.close(); } catch { /* A failed adapter must not restart storage work. */ }
    try { this.journal.close(); } catch { /* No further command can be admitted by this worker. */ }
  }

  /** Remove callbacks before closing dependencies to prevent reentrant disconnect writes. */
  private clearSubscriptions(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unsubscribe();
  }

  /** Authorize current identity before returning an existing actor-scoped receipt. */
  receipt(commandId: string, principal: LightPrincipal): LightCommandRecord | null {
    if (this.state !== "running" || !permitsLightPower(principal, this.journal.binding, this.authorize)) return null;
    try {
      this.tick();
      if (this.state !== "running") return null;
      return this.journal.read().find((record) => record.command.commandId === commandId &&
        record.principal.actorId === principal.actorId && record.principal.homeId === principal.homeId) ?? null;
    } catch { this.failStorage(); return null; }
  }

  /** Reserve before dispatch, and return exact retries without ever sending them again. */
  submit(input: unknown, principal: LightPrincipal): LightSubmission {
    if (this.state !== "running") return { kind: "refused", reason: this.state === "storage-failed" ? "storage_unavailable" : "unavailable" };
    const snapshot = this.snapshot();
    if (!snapshot || !sameLightBinding(snapshot.light.binding, this.journal.binding)) {
      return { kind: "refused", reason: "unavailable" };
    }
    try {
      this.tick();
      if (this.state !== "running") return { kind: "refused", reason: "storage_unavailable" };
      const admission = this.journal.reserve(input, principal, snapshot.light, this.authorize, this.clock());
      if (admission.kind === "refused") return admission;
      if (admission.kind === "duplicate") return { kind: "duplicate", record: admission.record };
      const record = this.dispatch(admission.record.command.commandId);
      return record ? { kind: "reserved", record } : { kind: "refused", reason: "storage_unavailable" };
    } catch { this.failStorage(); return { kind: "refused", reason: "storage_unavailable" }; }
  }

  /** Commit dispatch intent first; never let a failed transaction release a call. */
  private dispatch(commandId: string): LightCommandRecord | null {
    let call: LightServiceCall | null = null;
    const record = this.journal.update(commandId, (current, journal) => {
      const snapshot = this.snapshot();
      if (!snapshot) return interruptLightCommand(current);
      let requestId: number;
      try { requestId = this.adapter.allocateRequestId(); }
      catch { return interruptLightCommand(current); }
      const plan = planLightDispatch(current, snapshot.light, {
        sessionId: snapshot.sessionId,
        requestId,
        observation: snapshot.observation,
      }, this.authorize, this.clock(), journal);
      call = plan.call;
      return plan.record;
    });
    if (!record || !call || !record.sessionId) return record;
    // There is no await between this last policy/session check and the socket
    // write. A session change or revoked policy can never reuse the committed call.
    const snapshot = this.snapshot();
    const checked = expireLightCommand(record, this.authorize, this.clock());
    if (checked.status !== "dispatching" || !snapshot || snapshot.sessionId !== record.sessionId ||
        snapshot.light.entityId !== record.entityId || !sameLightBinding(snapshot.light.binding, record.binding)) {
      return this.journal.update(commandId, () => checked.status !== "dispatching" ? checked : interruptLightCommand(record));
    }
    try { this.adapter.send(call, record.sessionId); }
    catch {
      // A thrown socket write may have reached HA. Preserve uncertainty and end
      // the session instead of inferring failure or retrying the explicit action.
      const interrupted = this.journal.update(commandId, interruptLightCommand);
      this.adapter.close();
      return interrupted;
    }
    if (this.state !== "running") return null;
    return this.journal.read().find((entry) => entry.command.commandId === commandId) ?? null;
  }

  /** Persist authenticated adapter evidence; any storage failure stops the worker. */
  private handleEvent(event: LightAdapterEvent): void {
    if (this.state !== "running") return;
    try {
      this.journal.updateAll((record) => {
        if (event.type === "observation") return recordLightObservation(record, event.observation, this.authorize, this.clock());
        if (event.type === "service-result") return recordLightServiceResult(record, event.input, event.sessionId, this.authorize, this.clock());
        return record.sessionId === event.sessionId || record.status === "reserved" ? interruptLightCommand(record) : record;
      });
    } catch { this.failStorage(); }
  }

  /** Enforce expiry and revocation even while the integration sends no events. */
  tick(): void {
    if (this.state !== "running") return;
    try { this.journal.updateAll((record) => expireLightCommand(record, this.authorize, this.clock())); }
    catch { this.failStorage(); }
  }

  /** Stop supervision explicitly, retain uncertain outcomes, and release storage ownership. */
  close(): void {
    if (this.state !== "running") return;
    this.state = "stopped";
    this.clearSubscriptions();
    try { this.journal.updateAll(interruptLightCommand); }
    catch { this.state = "storage-failed"; }
    finally {
      try { this.adapter.close(); } finally { this.journal.close(); }
    }
  }
}
