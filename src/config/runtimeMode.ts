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
  allowMockTelemetry: runtimeMode === "demo" || runtimeMode === "development",
  allowDirectMqtt: runtimeMode === "demo" || runtimeMode === "development",
  requireRealTransport: runtimeMode === "alpha" || runtimeMode === "production",
});
