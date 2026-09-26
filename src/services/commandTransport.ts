import type { CommandProgressReason } from "./commandProgress";

/** A local delivery outcome, never an assertion about physical device state. */
export type CommandAttemptResult =
  | { status: "submitted" | "retryable" }
  | {
      status: "rejected" | "expired" | "timed_out" | "cancelled";
      reason?: CommandProgressReason;
    };

type CommandAttemptFailure = Exclude<
  CommandAttemptResult,
  { status: "submitted" | "retryable" }
>;

/** Marks a known permanent refusal without retaining a server response body. */
export class CommandTransportRejectedError extends Error {
  /** Only fixed reason codes may cross from an authenticated transport. */
  constructor(
    public readonly reason:
      | "permission_denied"
      | "invalid_command"
      | "invalid_response"
      | "transport_rejected"
      | "session_changed",
  ) {
    super(reason === "session_changed"
      ? "Device session is no longer active."
      : "Device command was not accepted.");
    this.name = "CommandTransportRejectedError";
  }
}

/** Classify HTTP refusals without reading, retaining, or displaying their body. */
export function commandRejectionFromHttpError(error: unknown) {
  if (!error || typeof error !== "object" || !("context" in error)) return null;
  const context: unknown = error.context;
  if (!context || typeof context !== "object" || !("status" in context)) return null;
  const status = context.status;
  if (status === 401 || status === 403) return new CommandTransportRejectedError("permission_denied");
  if (typeof status === "number" && [400, 404, 405, 410, 413, 415, 422].includes(status)) {
    return new CommandTransportRejectedError("invalid_command");
  }
  // A conflict can follow a lost acceptance response. It is not proof that the
  // device executed or that nothing was queued, so do not fabricate success.
  if (status === 409) return new CommandTransportRejectedError("transport_rejected");
  return null;
}

/** Bounds local waits; cancellation cannot retract a request already delivered. */
export class CommandAttemptRunner {
  private readonly cancellations = new Set<() => void>();

  /** Discards all old-session results, including transports that never settle. */
  cancelAll() {
    for (const cancel of [...this.cancellations]) cancel();
  }

  /** Attempts delivery once, checking identity, authorization and TTL around it. */
  run(
    deliver: () => Promise<void> | void,
    expiresAt: number,
    check: () => CommandAttemptFailure | null,
  ): Promise<CommandAttemptResult> {
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      /** Resolve once and release both the deadline and cancellation callback. */
      const finish = (result: CommandAttemptResult) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        this.cancellations.delete(cancel);
        resolve(result);
      };
      /** Session cancellation stops waiting, not necessarily server execution. */
      const cancel = () => finish({ status: "cancelled", reason: "session_changed" });
      /** A failed policy check is a refusal, never permission to dispatch. */
      const readFailure = (): CommandAttemptFailure | null => {
        try { return check(); } catch {
          console.warn("Command delivery policy check failed.");
          return { status: "rejected", reason: "transport_rejected" };
        }
      };
      /** Late acknowledgements cannot revive expired or revoked local work. */
      const afterDelivery = (result: CommandAttemptResult) => {
        if (settled) return;
        const failure = readFailure();
        finish(failure?.status === "expired"
          ? { status: "timed_out", reason: "transport_timeout" }
          : failure ?? result);
      };

      this.cancellations.add(cancel);
      const failure = readFailure();
      if (failure) { finish(failure); return; }
      timer = setTimeout(
        () => finish({ status: "timed_out", reason: "transport_timeout" }),
        Math.max(0, expiresAt - Date.now()),
      );
      // Promise.resolve().then also captures synchronous transport exceptions.
      void Promise.resolve().then(() => {
        if (settled) return;
        const beforeSend = readFailure();
        if (beforeSend) { finish(beforeSend); return; }
        return deliver();
      }).then(
        () => afterDelivery({ status: "submitted" }),
        (error: unknown) => afterDelivery(error instanceof CommandTransportRejectedError
          ? { status: error.reason === "session_changed" ? "cancelled" : "rejected", reason: error.reason }
          : { status: "retryable" }),
      );
    });
  }
}

/** A safe initial-send failure; it deliberately contains no raw network error. */
export class CommandDeliveryError extends Error {
  /** Reports local failure without claiming the device did or did not execute. */
  constructor(
    public readonly status: "rejected" | "timed_out" | "cancelled",
    public readonly reason?: CommandProgressReason,
  ) {
    super(status === "timed_out"
      ? "Device command response timed out; device outcome is unknown."
      : "Device command delivery stopped; check its status before retrying.");
    this.name = "CommandDeliveryError";
  }
}
