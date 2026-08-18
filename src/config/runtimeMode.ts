export const RUNTIME_MODES = [
  "demo",
  "development",
  "alpha",
  "production",
] as const;

export type RuntimeMode = (typeof RUNTIME_MODES)[number];

function isRuntimeMode(value: string | undefined): value is RuntimeMode {
  return RUNTIME_MODES.includes(value as RuntimeMode);
}

function resolveRuntimeMode(): RuntimeMode {
  const configured = process.env.EXPO_PUBLIC_VANTA_MODE?.trim().toLowerCase();
  if (isRuntimeMode(configured)) return configured;

  // An unconfigured developer build keeps the current seeded experience. A
  // release build fails closed: mock transports are never enabled implicitly.
  return typeof __DEV__ !== "undefined" && __DEV__ ? "demo" : "production";
}

export const runtimeMode = resolveRuntimeMode();

export const runtimePolicy = Object.freeze({
  mode: runtimeMode,
  allowUnauthenticatedDemo: runtimeMode === "demo",
  allowMockTelemetry: runtimeMode === "demo" || runtimeMode === "development",
  allowDirectMqtt: runtimeMode === "demo" || runtimeMode === "development",
  requireRealTransport: runtimeMode === "alpha" || runtimeMode === "production",
});

export type AuthExperience =
  | "configuration-required"
  | "demo"
  | "sign-in"
  | "authenticated";

/**
 * Keeps the release auth gate independent from navigation rendering. Only an
 * explicitly resolved demo runtime may expose seeded local data without a
 * Supabase session; every other mode fails closed when auth is unavailable.
 */
export function resolveAuthExperience({
  hasSupabase,
  hasSession,
  allowUnauthenticatedDemo = runtimePolicy.allowUnauthenticatedDemo,
}: {
  hasSupabase: boolean;
  hasSession: boolean;
  allowUnauthenticatedDemo?: boolean;
}): AuthExperience {
  if (!hasSupabase) {
    return allowUnauthenticatedDemo ? "demo" : "configuration-required";
  }
  return hasSession ? "authenticated" : "sign-in";
}

/** Rejects insecure release sockets and credentials embedded in URLs. */
export function isAllowedDirectWebSocketUrl(
  value: string | null | undefined,
  mode: RuntimeMode = runtimePolicy.mode,
) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return false;
    if (mode === "alpha" || mode === "production") {
      return parsed.protocol === "wss:";
    }
    return parsed.protocol === "ws:" || parsed.protocol === "wss:";
  } catch {
    return false;
  }
}
