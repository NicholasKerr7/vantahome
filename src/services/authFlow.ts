import type { Session } from "@supabase/supabase-js";
import { getAuthRedirectParams } from "../config/authRedirects";
import { secureSessionStorage } from "./secureSessionStorage";
import { supabase } from "./supabaseClient";
import { ensureSecureAuthCrypto } from "./authCrypto";

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

function updateFlowStorage(operation: () => Promise<void>) {
  const next = storageQueue.then(operation, operation);
  storageQueue = next.catch(() => {});
  return next;
}

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

export async function cancelAuthFlow() {
  ++flowVersion;
  pendingExchange = null;
  await updateFlowStorage(() => secureSessionStorage.removeItem(FLOW_KEY));
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
