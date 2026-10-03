export type AppVariant = "production" | "preview";

export interface AppIdentity {
  readonly variant: AppVariant;
  readonly scheme: "vantahome" | "vantahome-preview";
  readonly bundleIdentifier:
    | "com.anonymous.vantahome"
    | "com.anonymous.vantahome.preview";
  readonly displayName: "VantaHome" | "VantaHome Preview";
}

/** Resolve one supported build identity; invalid explicit variants fail closed. */
export function resolveAppVariant(configuredVariant?: string): AppIdentity;
