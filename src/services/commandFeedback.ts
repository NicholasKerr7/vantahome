import type {
  CommandProgress,
  CommandProgressReason,
  CommandProgressStatus,
} from "./commandProgress";

/** Safe presentation copy describes local delivery, never physical completion. */
export type CommandFeedback = Readonly<{
  title: string;
  description: string;
  tone: "neutral" | "warning";
  active: boolean;
}>;

type FeedbackCopy = Pick<CommandFeedback, "title" | "description">;

const STATUS_FEEDBACK: Readonly<Record<CommandProgressStatus, CommandFeedback>> = {
  pending: {
    title: "Preparing command",
    description: "Checking this request before delivery begins.",
    tone: "neutral",
    active: true,
  },
  sending: {
    title: "Sending command",
    description: "Waiting for the transport response. Device state is not confirmed.",
    tone: "neutral",
    active: true,
  },
  queued: {
    title: "Queued for retry",
    description: "Retrying automatically, up to 4 attempts total, while the command is valid.",
    tone: "warning",
    active: true,
  },
  retrying: {
    title: "Retrying command",
    description: "Retrying automatically within the 4-attempt limit. Device state is not confirmed.",
    tone: "warning",
    active: true,
  },
  submitted: {
    title: "Submitted",
    description: "Transport accepted the request. Device state is not confirmed.",
    tone: "neutral",
    active: false,
  },
  failed: {
    title: "Delivery not verified",
    description: "Automatic retries have stopped. Check the device before sending again.",
    tone: "warning",
    active: false,
  },
  rejected: {
    title: "Delivery stopped",
    description: "This request cannot continue. Check the device before sending again.",
    tone: "warning",
    active: false,
  },
  expired: {
    title: "Command expired",
    description: "The delivery window ended. No more retries; check the device before sending again.",
    tone: "warning",
    active: false,
  },
  timed_out: {
    title: "Response timed out",
    description: "The device outcome is unknown. No automatic retry; check the device before sending again.",
    tone: "warning",
    active: false,
  },
  cancelled: {
    title: "Local tracking stopped",
    description: "This does not cancel an already delivered request. Check the device before sending again.",
    tone: "warning",
    active: false,
  },
};

const REJECTION_FEEDBACK: Readonly<Record<CommandProgressReason, FeedbackCopy>> = {
  permission_denied: {
    title: "Permission required",
    description: "Access could not be verified. Check your home access and the device before sending again.",
  },
  invalid_command: {
    title: "Command not accepted",
    description: "Check the device and control settings before sending another request.",
  },
  invalid_response: {
    title: "Response not verified",
    description: "The delivery response could not be verified. The outcome is unknown; check the device before sending again.",
  },
  transport_rejected: {
    title: "Delivery not verified",
    description: "Delivery could not be established. The outcome is unknown; check the device before sending again.",
  },
  retry_exhausted: STATUS_FEEDBACK.failed,
  transport_timeout: STATUS_FEEDBACK.timed_out,
  session_changed: {
    title: "Session changed",
    description: "Local delivery stopped after the session changed. Check the device before sending again.",
  },
};

/** Bound presentation counters even if a caller supplies malformed metadata. */
function getAttemptLabel(attempts: number): string {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 4) {
    return "within the 4-attempt limit";
  }
  return `on attempt ${attempts} of 4`;
}

/**
 * Map allowlisted local metadata to fixed, non-sensitive interface copy.
 * Simulation labeling is contextual, not proof that no external transport ran.
 */
export function getCommandFeedback(
  command: Pick<CommandProgress, "status" | "reason" | "attempts">,
  simulated: boolean,
): CommandFeedback {
  const feedback = { ...STATUS_FEEDBACK[command.status] };
  if (command.status === "rejected" && command.reason) {
    Object.assign(feedback, REJECTION_FEEDBACK[command.reason]);
  } else if (command.status === "retrying") {
    feedback.description = `Retrying automatically ${getAttemptLabel(command.attempts)}. Device state is not confirmed.`;
  } else if (command.status === "cancelled" && command.reason === "session_changed") {
    feedback.title = "Session changed";
  }

  if (!simulated) return feedback;
  return {
    ...feedback,
    title: `Demo: ${feedback.title}`,
    description: `${feedback.description} Simulation is not real-device confirmation.`,
  };
}
