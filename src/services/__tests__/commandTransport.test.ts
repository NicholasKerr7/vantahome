import {
  CommandAttemptRunner,
  CommandTransportRejectedError,
  commandRejectionFromHttpError,
} from "../commandTransport";

/** Resolve delivery microtasks without advancing the local command deadline. */
async function tick() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe("bounded command delivery", () => {
  let runner: CommandAttemptRunner;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(1000);
    runner = new CommandAttemptRunner();
  });
  afterEach(() => {
    runner.cancelAll();
    expect(jest.getTimerCount()).toBe(0);
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test("cancels before dispatch and removes its deadline", async () => {
    const deliver = jest.fn();
    const result = runner.run(deliver, 2000, () => null);
    runner.cancelAll();
    await expect(result).resolves.toEqual({ status: "cancelled", reason: "session_changed" });
    await tick();
    expect(deliver).not.toHaveBeenCalled();
  });

  test.each(["resolve", "reject"] as const)("ignores a late %s after timeout", async (outcome) => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const delivery = new Promise<void>((success, failure) => { resolve = success; reject = failure; });
    const result = runner.run(() => delivery, 2000, () => null);
    await tick();
    await jest.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toEqual({ status: "timed_out", reason: "transport_timeout" });
    if (outcome === "resolve") resolve();
    else reject(new Error("private transport response"));
    await tick();
    await expect(result).resolves.toMatchObject({ status: "timed_out" });
  });

  test("refuses dispatch if policy is revoked in the intervening microtask", async () => {
    const check = jest.fn().mockReturnValueOnce(null).mockReturnValue({ status: "rejected", reason: "permission_denied" });
    const deliver = jest.fn();
    await expect(runner.run(deliver, 2000, check)).resolves.toMatchObject({ status: "rejected" });
    expect(deliver).not.toHaveBeenCalled();
  });

  test("fails closed when policy evaluation throws without retaining its message", async () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    const deliver = jest.fn();
    const result = await runner.run(deliver, 2000, () => { throw new Error("private policy details"); });
    expect(result).toEqual({ status: "rejected", reason: "transport_rejected" });
    expect(deliver).not.toHaveBeenCalled();
    expect(JSON.stringify(warning.mock.calls)).not.toContain("private");
  });

  test("a response after the deadline is ambiguous even if its timer has not fired", async () => {
    const check = () => Date.now() >= 2000 ? { status: "expired" as const } : null;
    const result = runner.run(() => { jest.setSystemTime(2000); }, 2000, check);
    await expect(result).resolves.toEqual({ status: "timed_out", reason: "transport_timeout" });
  });

  test("captures synchronous exceptions and distinguishes temporary failures", async () => {
    await expect(runner.run(() => { throw new Error("offline"); }, 2000, () => null))
      .resolves.toEqual({ status: "retryable" });
    await expect(runner.run(() => { throw new CommandTransportRejectedError("invalid_response"); }, 2000, () => null))
      .resolves.toEqual({ status: "rejected", reason: "invalid_response" });
    await expect(runner.run(() => { throw new CommandTransportRejectedError("session_changed"); }, 2000, () => null))
      .resolves.toEqual({ status: "cancelled", reason: "session_changed" });
  });

  test.each([401, 403])("classifies HTTP %i without reading the response body", (status) => {
    const error = { context: { status, get body() { throw new Error("Must not inspect body"); } } };
    expect(commandRejectionFromHttpError(error)?.reason).toBe("permission_denied");
  });

  test.each([400, 404, 405, 410, 413, 415, 422])("treats HTTP %i as a permanent invalid request", (status) => {
    expect(commandRejectionFromHttpError({ context: { status } })?.reason).toBe("invalid_command");
  });

  test("conflict never fabricates an acceptance or physical outcome", () => {
    expect(commandRejectionFromHttpError({ context: { status: 409 } })?.reason).toBe("transport_rejected");
  });

  test.each([null, undefined, {}, { context: null }, { context: { status: "403" } },
    { context: { status: 429 } }, { context: { status: 500 } }, { context: { status: 503 } },
  ])("does not treat an unknown/transient error as a known refusal: %j", (error) => {
    expect(commandRejectionFromHttpError(error)).toBeNull();
  });
});
