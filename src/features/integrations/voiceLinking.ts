import type { IntegrationProvider } from "../../store/useHomeStore";

export type VoiceProvider = Extract<IntegrationProvider, "alexa" | "google">;
export type VoiceLinkConfiguration = { authorizeUrl: string; clientId: string; redirectUri: string };
export type VoiceLinkScope = {
  authenticatedUserId: string | null;
  activeHomeId: string | null;
  activeMemberId: string | null;
  sessionEpoch: number;
  membershipReady: boolean;
};
export type VoiceLinkResult =
  | "authorization-saved" | "cancelled" | "stale-session" | "invalid-callback"
  | "provider-denied" | "unavailable" | "failed" | "busy" | "sign-in-required";

export type VoiceLinkDependencies = {
  getScope: () => VoiceLinkScope;
  getConfiguration: (provider: VoiceProvider) => VoiceLinkConfiguration | null;
  createState: () => string;
  openAuthorization: (url: string, redirectUri: string) => Promise<{ type: string; url?: string }>;
  setStatus: (provider: VoiceProvider, status: "linking" | "not-linked") => void;
  saveAuthorization: (provider: VoiceProvider) => void;
};

/** Only the two existing provider adapters support account authorization. */
export function isVoiceProvider(provider: string): provider is VoiceProvider {
  return provider === "alexa" || provider === "google";
}

/** Resolve public linking configuration without exposing credentials or inventing readiness. */
export function resolveVoiceConfiguration(input: {
  authorizeUrl?: string; functionsUrl?: string; supabaseUrl?: string; clientId?: string; redirectUri: string;
}): VoiceLinkConfiguration | null {
  const clientId = input.clientId?.trim();
  const base = input.functionsUrl?.trim() || input.supabaseUrl?.trim().replace(/\.supabase\.co\/?$/, ".functions.supabase.co");
  const endpoint = input.authorizeUrl?.trim() || (base ? `${base.replace(/\/$/, "")}/voice-authorize` : "");
  if (!clientId || !endpoint) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) return null;
    return { authorizeUrl: url.href, clientId, redirectUri: input.redirectUri };
  } catch {
    return null;
  }
}

/** Reject callbacks for another endpoint, duplicate fields, fragments, or another attempt. */
export function validateVoiceCallback(url: string, redirectUri: string, state: string): VoiceLinkResult {
  try {
    const callback = new URL(url);
    const expected = new URL(redirectUri);
    if (callback.protocol !== expected.protocol || callback.hostname !== expected.hostname ||
      callback.port !== expected.port || callback.pathname !== expected.pathname ||
      callback.username || callback.password || callback.hash) return "invalid-callback";
    const params = callback.searchParams;
    const keys = Array.from(params.keys());
    if (new Set(keys).size !== keys.length || params.get("state") !== state) return "invalid-callback";
    if (params.has("error")) return "provider-denied";
    const code = params.get("code");
    return code && code.trim() && code.length <= 4096 ? "authorization-saved" : "invalid-callback";
  } catch {
    return "invalid-callback";
  }
}

/** Bind every asynchronous callback to the account, home, member, and session that began it. */
export function voiceScopeIsCurrent(previous: VoiceLinkScope, current: VoiceLinkScope): boolean {
  return Boolean(previous.authenticatedUserId && previous.activeHomeId && previous.activeMemberId &&
    previous.membershipReady && current.membershipReady &&
    previous.authenticatedUserId === current.authenticatedUserId && previous.activeHomeId === current.activeHomeId &&
    previous.activeMemberId === current.activeMemberId && previous.sessionEpoch === current.sessionEpoch);
}

/** Create one shared authorization runner; a returned code records local progress, never provider verification. */
export function createVoiceLinkController(dependencies: VoiceLinkDependencies) {
  let activeAttempt = false;
  return async (provider: IntegrationProvider): Promise<VoiceLinkResult> => {
    if (!isVoiceProvider(provider)) return "unavailable";
    const configuration = dependencies.getConfiguration(provider);
    if (!configuration) return "unavailable";
    const scope = { ...dependencies.getScope() };
    if (!voiceScopeIsCurrent(scope, scope)) return "sign-in-required";
    if (activeAttempt) return "busy";
    activeAttempt = true;
    try {
      const state = dependencies.createState();
      if (state.length < 32) return "failed";
      const url = new URL(configuration.authorizeUrl);
      url.search = new URLSearchParams({
        client_id: configuration.clientId, redirect_uri: configuration.redirectUri, response_type: "code", state,
      }).toString();
      dependencies.setStatus(provider, "linking");
      const result = await dependencies.openAuthorization(url.href, configuration.redirectUri);
      if (!voiceScopeIsCurrent(scope, dependencies.getScope())) return "stale-session";
      const outcome = result.type !== "success" || !result.url
        ? "cancelled" : validateVoiceCallback(result.url, configuration.redirectUri, state);
      if (outcome === "authorization-saved") dependencies.saveAuthorization(provider);
      else dependencies.setStatus(provider, "not-linked");
      return outcome;
    } catch {
      if (!voiceScopeIsCurrent(scope, dependencies.getScope())) return "stale-session";
      dependencies.setStatus(provider, "not-linked");
      return "failed";
    } finally {
      activeAttempt = false;
    }
  };
}

export const VOICE_LINK_FEEDBACK: Record<VoiceLinkResult, string> = {
  "authorization-saved": "Authorization saved locally. Provider verification and device control are still pending.",
  cancelled: "Authorization cancelled. No connection was verified.",
  "stale-session": "Your account or home changed. Open authorization again for the current home.",
  "invalid-callback": "The authorization response could not be verified. Please try again.",
  "provider-denied": "Authorization was declined or could not be completed.",
  unavailable: "Account authorization requires a configured HTTPS endpoint and provider client.",
  failed: "Authorization could not be completed. Please try again.",
  busy: "An authorization window is already open.",
  "sign-in-required": "Sign in to your home before authorizing an assistant.",
};
