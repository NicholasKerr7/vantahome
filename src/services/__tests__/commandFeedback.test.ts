import { getCommandFeedback } from "../commandFeedback";
import type {
  CommandProgress,
  CommandProgressReason,
  CommandProgressStatus,
} from "../commandProgress";

const STATUS_CASES: Readonly<Record<CommandProgressStatus, { active: boolean; tone: "neutral" | "warning" }>> = {
  pending: { active: true, tone: "neutral" },
  sending: { active: true, tone: "neutral" },
  queued: { active: true, tone: "warning" },
  retrying: { active: true, tone: "warning" },
  submitted: { active: false, tone: "neutral" },
  failed: { active: false, tone: "warning" },
  rejected: { active: false, tone: "warning" },
  expired: { active: false, tone: "warning" },
  timed_out: { active: false, tone: "warning" },
  cancelled: { active: false, tone: "warning" },
};

const REASON_TITLES: Readonly<Record<CommandProgressReason, string>> = {
  permission_denied: "Permission required",
  invalid_command: "Command not accepted",
  invalid_response: "Response not verified",
  transport_rejected: "Delivery not verified",
  retry_exhausted: "Delivery not verified",
  transport_timeout: "Response timed out",
  session_changed: "Session changed",
};

/** Build metadata-only input without introducing a real command or device. */
function progress(
  status: CommandProgressStatus,
  reason?: CommandProgressReason,
  attempts = 1,
): Pick<CommandProgress, "status" | "reason" | "attempts"> {
  return { status, reason, attempts };
}

describe("command delivery feedback", () => {
  test.each(Object.entries(STATUS_CASES) as [CommandProgressStatus, typeof STATUS_CASES[CommandProgressStatus]][])(
    "provides local delivery copy for %s without implying completion",
    (status, expected) => {
      const feedback = getCommandFeedback(progress(status), false);
      expect(feedback).toEqual({
        ...expected,
        title: expect.any(String),
        description: expect.any(String),
      });
      expect(feedback.title.length).toBeGreaterThan(0);
      expect(feedback.description.length).toBeGreaterThan(0);
      expect(`${feedback.title} ${feedback.description}`).not.toMatch(
        /success|completed|device (?:changed|updated|executed)|state is confirmed|nothing happened/i,
      );
    },
  );

  test.each(Object.keys(STATUS_CASES) as CommandProgressStatus[])(
    "labels %s as simulation without claiming that physical delivery was impossible",
    (status) => {
      const real = getCommandFeedback(progress(status), false);
      const simulated = getCommandFeedback(progress(status), true);
      expect(simulated).toEqual({
        ...real,
        title: `Demo: ${real.title}`,
        description: `${real.description} Simulation is not real-device confirmation.`,
      });
      expect(simulated.description).not.toMatch(/no real device (?:was|has been)|never sent|not sent/i);
    },
  );

  test.each(Object.entries(REASON_TITLES) as [CommandProgressReason, string][])(
    "uses fixed safe copy for a %s refusal",
    (reason, title) => {
      const feedback = getCommandFeedback(progress("rejected", reason), false);
      expect(feedback).toEqual({
        title,
        description: expect.any(String),
        tone: "warning",
        active: false,
      });
      expect(feedback.description).toMatch(/check .*device.*before sending/i);
      expect(feedback.description).not.toContain(reason);
    },
  );

  test("submission is transport acceptance, never physical success", () => {
    expect(getCommandFeedback(progress("submitted"), false)).toEqual({
      title: "Submitted",
      description: "Transport accepted the request. Device state is not confirmed.",
      active: false,
      tone: "neutral",
    });
  });

  test.each(["invalid_response", "transport_rejected"] as const)(
    "%s preserves the ambiguous outcome and discourages blind resending",
    (reason) => {
      const feedback = getCommandFeedback(progress("rejected", reason), false);
      expect(feedback.description).toMatch(/outcome is unknown/i);
      expect(feedback.description).toMatch(/check the device before sending again/i);
      expect(feedback.description).not.toMatch(/not (?:sent|delivered|executed)|was rejected/i);
    },
  );

  test("timeouts do not offer or promise an automatic retry", () => {
    const feedback = getCommandFeedback(progress("timed_out", "transport_timeout"), false);
    expect(feedback.description).toMatch(/outcome is unknown/i);
    expect(feedback.description).toMatch(/no automatic retry/i);
    expect(feedback.description).toMatch(/check the device before sending again/i);
  });

  test("queue feedback describes automatic, bounded retries rather than a durable queue", () => {
    const feedback = getCommandFeedback(progress("queued"), false);
    expect(feedback.description).toMatch(/automatically, up to 4 attempts total/i);
    expect(feedback.description).toMatch(/while the command is valid/i);
    expect(feedback.description).not.toMatch(/saved|persisted|durable|will (?:send|complete)/i);
  });

  test.each([1, 2, 3, 4])("shows automatic attempt %s within the maximum", (attempts) => {
    const feedback = getCommandFeedback(progress("retrying", undefined, attempts), false);
    expect(feedback.description).toBe(
      `Retrying automatically on attempt ${attempts} of 4. Device state is not confirmed.`,
    );
  });

  test.each([-1, 0, 1.5, 5, 999_999, Number.NaN, Number.POSITIVE_INFINITY])(
    "does not interpolate an invalid attempt count %s",
    (attempts) => {
      const feedback = getCommandFeedback(progress("retrying", undefined, attempts), false);
      expect(feedback.description).toBe(
        "Retrying automatically within the 4-attempt limit. Device state is not confirmed.",
      );
    },
  );

  test("session cancellation does not claim to retract an already delivered request", () => {
    const feedback = getCommandFeedback(progress("cancelled", "session_changed"), false);
    expect(feedback.title).toBe("Session changed");
    expect(feedback.description).toMatch(/does not cancel an already delivered request/i);
  });

  test("unrelated reasons cannot override active or submitted status", () => {
    for (const status of ["pending", "sending", "queued", "retrying", "submitted"] as const) {
      expect(getCommandFeedback(progress(status, "permission_denied"), false)).toEqual(
        getCommandFeedback(progress(status), false),
      );
    }
  });

  test("keeps identifiers, payloads, credentials, and raw errors out of the copy", () => {
    const command = {
      ...progress("rejected", "permission_denied"),
      commandId: "sensitive-command",
      deviceId: "sensitive-device",
      nonce: "sensitive-nonce",
      idempotencyKey: "sensitive-idempotency-key",
      token: "sensitive-token",
      error: "sensitive-error",
      changes: { label: "sensitive-payload" },
    };
    const feedback = getCommandFeedback(command, false);
    expect(JSON.stringify(feedback)).not.toContain("sensitive-");
    expect(Object.keys(feedback).sort()).toEqual(["active", "description", "title", "tone"]);
    expect(command.reason).toBe("permission_denied");
  });

  test("returns independent values without mutating input or shared copy", () => {
    const command = Object.freeze(progress("submitted"));
    const first = getCommandFeedback(command, false);
    const second = getCommandFeedback(command, false);
    expect(first).not.toBe(second);
    Object.assign(first, { title: "mutated" });
    expect(getCommandFeedback(command, false).title).toBe("Submitted");
    expect(second.title).toBe("Submitted");
  });
});
