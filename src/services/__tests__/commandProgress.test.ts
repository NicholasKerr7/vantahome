import {
  CommandProgressError,
  CommandProgressStore,
  type CommandProgressReason,
  type CommandProgressStatus,
} from "../commandProgress";

/** Build synthetic metadata only; tests never dispatch a device operation. */
function metadata(commandId = "command-a") {
  return { commandId, deviceId: "device-a", createdAt: 1_000, expiresAt: 16_000 };
}

describe("local command progress", () => {
  beforeEach(() => { jest.useFakeTimers().setSystemTime(2_000); });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  test("starts pending and preserves only allowlisted metadata", () => {
    const store = new CommandProgressStore();
    const listener = jest.fn();
    store.subscribe(listener);
    const input = { ...metadata(), nonce: "private", payload: {} };
    const handle = store.start(input);
    expect(Object.isFrozen(handle)).toBe(true);
    expect(typeof handle.token).toBe("symbol");
    expect(store.get(handle.commandId)).toEqual({
      ...metadata(), status: "pending", attempts: 0, updatedAt: 2_000,
    });
    expect(listener).toHaveBeenCalledWith({
      type: "updated", command: store.get(handle.commandId),
    });
  });

  test("tracks retry submission without claiming physical confirmation", () => {
    const store = new CommandProgressStore();
    const handle = store.start(metadata());
    expect(store.transition(handle, "sending", 1)).toBe(true);
    expect(store.transition(handle, "queued", 1, "transport_rejected")).toBe(true);
    expect(store.transition(handle, "retrying", 2)).toBe(true);
    expect(store.get(handle.commandId)?.reason).toBeUndefined();
    expect(store.transition(handle, "queued", 2)).toBe(true);
    expect(store.transition(handle, "retrying", 3)).toBe(true);
    expect(store.transition(handle, "submitted")).toBe(true);
    expect(store.get(handle.commandId)?.attempts).toBe(3);
    expect(store.transition(handle, "confirmed" as CommandProgressStatus)).toBe(false);
    expect(store.get(handle.commandId)?.status).toBe("submitted");
  });

  test.each(["submitted", "failed", "rejected", "expired", "timed_out", "cancelled"] as const)(
    "%s is terminal and cannot restart delivery",
    (status) => {
      const store = new CommandProgressStore();
      const handle = store.start(metadata());
      store.transition(handle, "sending", 1);
      expect(store.transition(handle, status)).toBe(true);
      for (const next of ["pending", "sending", "queued", "retrying", "submitted", "cancelled"] as const) {
        expect(store.transition(handle, next, 2)).toBe(false);
      }
      expect(store.get(handle.commandId)?.status).toBe(status);
    },
  );

  test("rejects skipped or repeated states without notifying listeners", () => {
    const store = new CommandProgressStore();
    const handle = store.start(metadata());
    const listener = jest.fn();
    store.subscribe(listener);
    for (const status of ["submitted", "queued", "retrying", "timed_out", "pending"] as const) {
      expect(store.transition(handle, status)).toBe(false);
    }
    expect(listener).not.toHaveBeenCalled();
    expect(store.get(handle.commandId)?.status).toBe("pending");
  });

  test.each(["rejected", "expired", "cancelled"] as const)(
    "allows %s while pending or queued",
    (status) => {
      for (const queued of [false, true]) {
        const store = new CommandProgressStore();
        const handle = store.start(metadata());
        if (queued) {
          store.transition(handle, "sending", 1);
          store.transition(handle, "queued");
        }
        expect(store.transition(handle, status)).toBe(true);
      }
    },
  );

  test.each([-1, 0.5, 5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid attempt count %s",
    (attempts) => {
      const store = new CommandProgressStore();
      const handle = store.start(metadata());
      expect(store.transition(handle, "sending", attempts)).toBe(false);
      expect(store.get(handle.commandId)?.attempts).toBe(0);
    },
  );

  test("rejects decreasing counters and unknown reasons", () => {
    const store = new CommandProgressStore();
    const handle = store.start(metadata());
    store.transition(handle, "sending", 1);
    store.transition(handle, "queued");
    expect(store.transition(handle, "retrying", 0)).toBe(false);
    expect(store.transition(handle, "retrying", 2, "private error" as CommandProgressReason)).toBe(false);
    expect(store.transition(handle, "retrying", 4)).toBe(true);
    expect(store.transition(handle, "failed", 4, "retry_exhausted")).toBe(true);
  });

  test("timestamps remain monotonic when the local clock moves backwards", () => {
    const store = new CommandProgressStore();
    const handle = store.start(metadata());
    jest.setSystemTime(1_500);
    store.transition(handle, "sending", 1);
    expect(store.get(handle.commandId)?.updatedAt).toBe(2_000);
    jest.setSystemTime(3_000);
    store.transition(handle, "submitted");
    expect(store.get(handle.commandId)?.updatedAt).toBe(3_000);
  });

  test.each([
    { commandId: "" }, { commandId: "  " }, { commandId: " padded" },
    { commandId: "a".repeat(129) }, { deviceId: "" }, { deviceId: "a".repeat(129) },
    { createdAt: -1 }, { createdAt: Number.NaN }, { createdAt: Number.POSITIVE_INFINITY },
    { expiresAt: Number.NaN }, { expiresAt: Number.POSITIVE_INFINITY },
    { expiresAt: 1_000 }, { expiresAt: 999 }, { expiresAt: 61_001 },
  ])("rejects malformed metadata %p", (invalid) => {
    const store = new CommandProgressStore();
    expect(() => store.start({ ...metadata(), ...invalid })).toThrow(TypeError);
    expect(store.getAll()).toEqual([]);
  });

  test("accepts boundary-sized identifiers and a 60-second lifetime", () => {
    const store = new CommandProgressStore();
    const handle = store.start({ commandId: "a".repeat(128), deviceId: "b".repeat(128), createdAt: 0, expiresAt: 60_000 });
    expect(store.get(handle.commandId)?.expiresAt).toBe(60_000);
  });

  test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid capacity %s",
    (capacity) => { expect(() => new CommandProgressStore(capacity)).toThrow(TypeError); },
  );

  test("refuses duplicate IDs even when terminal without evicting history", () => {
    const store = new CommandProgressStore(1);
    const handle = store.start(metadata());
    store.transition(handle, "cancelled");
    expect(() => store.start(metadata())).toThrow(CommandProgressError);
    expect(() => store.start(metadata())).toThrow(expect.objectContaining({ reason: "duplicate_command" }));
    expect(store.get(handle.commandId)?.status).toBe("cancelled");
  });

  test("refuses capacity overflow when every command remains active", () => {
    const store = new CommandProgressStore(2);
    const first = store.start(metadata());
    store.transition(first, "sending", 1);
    store.start(metadata("command-b"));
    expect(() => store.start(metadata("command-c"))).toThrow(expect.objectContaining({ reason: "tracking_capacity" }));
    expect(store.getAll()).toHaveLength(2);
  });

  test("evicts the oldest terminal result but keeps active commands", () => {
    const store = new CommandProgressStore(3);
    const first = store.start(metadata());
    const second = store.start(metadata("command-b"));
    store.start(metadata("command-c"));
    store.transition(second, "cancelled");
    jest.setSystemTime(3_000);
    store.transition(first, "cancelled");
    store.start(metadata("command-d"));
    expect(store.getAll().map(({ commandId }) => commandId)).toEqual(["command-a", "command-c", "command-d"]);
    expect(store.transition(second, "sending", 1)).toBe(false);
  });

  test("defaults to 200 entries and does not evict active commands", () => {
    const store = new CommandProgressStore();
    for (let index = 0; index < 200; index += 1) store.start(metadata(`command-${index}`));
    expect(() => store.start(metadata("overflow"))).toThrow(CommandProgressError);
    expect(store.getAll()).toHaveLength(200);
  });

  test("a copied or previous-session handle cannot update a reused ID", () => {
    const store = new CommandProgressStore();
    const first = store.start(metadata());
    expect(store.transition({ ...first }, "sending", 1)).toBe(false);
    store.reset();
    expect(store.getAll()).toEqual([]);
    const second = store.start(metadata());
    expect(second.token).not.toBe(first.token);
    expect(store.transition(first, "sending", 1)).toBe(false);
    expect(store.transition(second, "sending", 1)).toBe(true);
  });

  test("evicted handles stay invalid when the same ID is admitted again", () => {
    const store = new CommandProgressStore(1);
    const first = store.start(metadata());
    store.transition(first, "cancelled");
    const second = store.start(metadata("command-b"));
    store.transition(second, "cancelled");
    const reused = store.start(metadata());
    expect(store.transition(first, "sending", 1)).toBe(false);
    expect(store.transition(reused, "sending", 1)).toBe(true);
  });

  test("subscriptions have no initial replay and can unsubscribe", () => {
    const store = new CommandProgressStore();
    store.start(metadata());
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getAll()).toHaveLength(1);
    store.reset();
    expect(listener).toHaveBeenCalledWith({ type: "reset" });
    unsubscribe();
    store.start(metadata());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("consumer mutations cannot alter history or later subscriber snapshots", () => {
    const store = new CommandProgressStore();
    store.subscribe((event) => {
      if (event.type === "updated") (event.command as { status: string }).status = "confirmed";
    });
    const listener = jest.fn();
    store.subscribe(listener);
    store.start(metadata());
    const snapshot = store.get("command-a")!;
    (snapshot as { deviceId: string }).deviceId = "different-device";
    const all = store.getAll();
    (all[0] as { attempts: number }).attempts = 100;
    all.length = 0;
    expect(store.get("command-a")).toEqual({ ...metadata(), status: "pending", attempts: 0, updatedAt: 2_000 });
    expect(listener.mock.calls[0][0].command.status).toBe("pending");
  });

  test("throwing listeners cannot interrupt delivery or leak their error", () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    const store = new CommandProgressStore();
    store.subscribe(() => { throw new Error("private payload"); });
    const listener = jest.fn();
    store.subscribe(listener);
    expect(() => store.start(metadata())).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith("Command progress subscriber failed.");
    expect(JSON.stringify(warning.mock.calls)).not.toContain("private payload");
  });

  test("reentrant reset stops remaining delivery of the prior session event", () => {
    const store = new CommandProgressStore();
    store.subscribe((event) => { if (event.type === "updated") store.reset(); });
    const listener = jest.fn();
    store.subscribe(listener);
    const stale = store.start(metadata());
    expect(listener.mock.calls).toEqual([[{ type: "reset" }]]);
    expect(store.getAll()).toEqual([]);
    expect(store.transition(stale, "sending", 1)).toBe(false);
  });

  test("reentrant transitions cannot deliver stale statuses after a newer event", () => {
    const store = new CommandProgressStore();
    const handle = store.start(metadata());
    store.subscribe((event) => {
      if (event.type === "updated" && event.command.status === "sending") {
        store.transition(handle, "submitted");
      }
    });
    const listener = jest.fn();
    store.subscribe(listener);
    store.transition(handle, "sending", 1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].command.status).toBe("submitted");
  });

  test("subscriber changes use a stable listener snapshot", () => {
    const store = new CommandProgressStore();
    const later = jest.fn();
    const removed = jest.fn();
    let unsubscribeRemoved = () => {};
    store.subscribe(() => { store.subscribe(later); unsubscribeRemoved(); });
    unsubscribeRemoved = store.subscribe(removed);
    const handle = store.start(metadata());
    expect(later).not.toHaveBeenCalled();
    expect(removed).not.toHaveBeenCalled();
    store.transition(handle, "sending", 1);
    expect(later).toHaveBeenCalledTimes(1);
  });
});
