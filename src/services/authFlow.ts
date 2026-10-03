import type { Session } from "@supabase/supabase-js";
import { getAuthRedirectParams } from "../config/authRedirects";
import { secureSessionStorage } from "./secureSessionStorage";
import { supabase } from "./supabaseClient";
import { ensureSecureAuthCrypto } from "./authCrypto";
import {
  beginInvitationPasswordSetup,
  bindInvitationPasswordSetup,
  discardInvitationPasswordIntent,
} from "./invitationPasswordSetup";
export {
  completeInvitationPasswordSetup,
  needsInvitationPasswordSetup,
} from "./invitationPasswordSetup";

const FLOW_KEY = "vantahome.auth.pending-flow";
type FlowKind = "oauth" | "recovery" | "signup";
type PendingFlow = { kind: FlowKind; createdAt: number; userId: string | null };
const MAX_FLOW_AGE_MS = 60 * 60 * 1000;
let pendingExchange: { code: string; promise: Promise<Session | null> } | null =
  null;
let flowVersion = 0;
let storageQueue = Promise.resolve();
let activeCodeExchange: Promise<unknown> | null = null;

/** Password sign-in/sign-out must not race an SDK exchange already in flight. */
export async function waitForAuthExchange() {
  await activeCodeExchange?.catch(() => {});
}

/** Keep pending-flow writes ordered when callbacks and user actions overlap. */
function updateFlowStorage(operation: () => Promise<void>) {
  const next = storageQueue.then(operation, operation);
  storageQueue = next.catch(() => {});
  return next;
}

/** Bind the next PKCE callback to an expiring request from this device and identity. */
export async function beginAuthFlow(kind: FlowKind) {
  if (!supabase) throw new Error("Authentication is not configured.");
  ensureSecureAuthCrypto();
  if (activeCodeExchange)
    throw new Error("Sign-in is finishing. Please wait a moment.");
  const version = ++flowVersion;
  pendingExchange = null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  await updateFlowStorage(async () => {
    if (version !== flowVersion)
      throw new Error("This sign-in request was cancelled.");
    await secureSessionStorage.setItem(
      FLOW_KEY,
      JSON.stringify({
        kind,
        createdAt: Date.now(),
        userId: data.session?.user.id ?? null,
      } satisfies PendingFlow),
    );
  });
}

/** Invalidate pending callbacks; callers changing identity also await the active exchange. */
export async function cancelAuthFlow() {
  ++flowVersion;
  pendingExchange = null;
  await updateFlowStorage(() => secureSessionStorage.removeItem(FLOW_KEY));
}

/** Remove only the rejected invitation session, never a different signed-in identity. */
async function discardInvitationSession(session: Session | null) {
  if (!session || !supabase) return;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== session.user.id) return;
  const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
  if (signOutError) throw signOutError;
}

/** Verify a deliberately entered email/code while signed out, without accepting URL tokens. */
export async function verifyInvitationCode(
  email: string,
  token: string,
): Promise<Session> {
  if (!supabase) throw new Error("Authentication is not configured.");
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedToken = token.trim();
  if (
    normalizedEmail.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
    !/^\d{6}$/.test(normalizedToken)
  ) {
    throw new Error("Enter your invited email address and six-digit invitation code.");
  }
  if (activeCodeExchange)
    throw new Error("Sign-in is finishing. Please wait a moment.");

  const authClient = supabase;
  const version = ++flowVersion;
  pendingExchange = null;
  const verification = (async () => {
    await updateFlowStorage(() => secureSessionStorage.removeItem(FLOW_KEY));
    const { data: current, error: sessionError } = await authClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (version !== flowVersion)
      throw new Error("This invitation request was cancelled.");
    if (current.session)
      throw new Error("Sign out before verifying an invitation for another account.");

    const intent = await beginInvitationPasswordSetup(normalizedEmail);
    let verifiedSession: Session | null = null;
    try {
      if (version !== flowVersion)
        throw new Error("This invitation request was cancelled.");
      const { data, error } = await authClient.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedToken,
        type: "invite",
      });
      verifiedSession = data.session;
      // The SDK persists a session before resolving. A cancelled or mismatched
      // result must therefore be removed, rather than merely ignored by the UI.
      if (version !== flowVersion)
        throw new Error("This invitation request was cancelled.");
      if (error)
        throw new Error("That invitation code is invalid or has expired. Ask the homeowner for a new invitation.");
      if (
        !verifiedSession ||
        verifiedSession.user.email?.trim().toLowerCase() !== normalizedEmail ||
        data.user?.id !== verifiedSession.user.id
      ) throw new Error("Unable to verify this invitation for your email address.");
      await bindInvitationPasswordSetup(intent, verifiedSession.user.id);
      if (version !== flowVersion)
        throw new Error("This invitation request was cancelled.");
      return verifiedSession;
    } catch (error) {
      await discardInvitationSession(verifiedSession);
      await discardInvitationPasswordIntent(intent);
      throw error;
    }
  })();
  // Register before the first asynchronous continuation so OAuth, password
  // entry, sign-out, and duplicate submissions share the same exchange lock.
  activeCodeExchange = verification;
  try {
    return await verification;
  } finally {
    if (activeCodeExchange === verification) activeCodeExchange = null;
  }
}

/** Only an expiring local request plus the SDK's stored PKCE verifier can sign in. */
export async function completeAuthCallback(
  url: string,
  onRecovery?: () => void,
): Promise<Session | null> {
  const params = getAuthRedirectParams(url);
  const code = params?.get("code");
  if (
    !supabase ||
    !params ||
    !code ||
    code.length > 2048 ||
    params.has("access_token") ||
    params.has("refresh_token") ||
    new URL(url).hash ||
    params.has("error")
  )
    return null;
  // Linking and the browser can deliver the same callback concurrently.
  if (pendingExchange?.code === code) return pendingExchange.promise;
  if (pendingExchange) return null;
  const version = flowVersion;
  const promise = (async () => {
    await storageQueue;
    const saved = await secureSessionStorage.getItem(FLOW_KEY);
    if (!saved || version !== flowVersion) return null;
    let flow: PendingFlow;
    try {
      flow = JSON.parse(saved);
    } catch {
      return null;
    }
    const age = Date.now() - flow.createdAt;
    if (
      !["oauth", "recovery", "signup"].includes(flow.kind) ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > MAX_FLOW_AGE_MS
    ) {
      await updateFlowStorage(async () => {
        if (version === flowVersion)
          await secureSessionStorage.removeItem(FLOW_KEY);
      });
      return null;
    }
    const { data: current, error: sessionError } =
      await supabase!.auth.getSession();
    if (
      sessionError ||
      version !== flowVersion ||
      (current.session?.user.id ?? null) !== flow.userId
    )
      return null;
    await updateFlowStorage(async () => {
      if (version === flowVersion)
        await secureSessionStorage.removeItem(FLOW_KEY);
    });
    if (version !== flowVersion) return null;
    if (flow.kind === "recovery") onRecovery?.();
    const exchange = supabase!.auth.exchangeCodeForSession(code);
    activeCodeExchange = exchange;
    try {
      const { data, error } = await exchange;
      return error || version !== flowVersion ? null : data.session;
    } finally {
      if (activeCodeExchange === exchange) activeCodeExchange = null;
    }
  })().catch(() => null);
  pendingExchange = { code, promise };
  const session = await promise;
  // Keep successful delivery deduplicated until the next locally started flow.
  if (!session && pendingExchange?.promise === promise) pendingExchange = null;
  return session;
}
