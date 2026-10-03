import { secureSessionStorage } from "./secureSessionStorage";
import { supabase } from "./supabaseClient";

const PENDING_KEY = "vantahome.auth.invitation-password.pending";
const USER_KEY_PREFIX = "vantahome.auth.invitation-password.user.";
const PENDING_MAX_AGE_MS = 60 * 60 * 1000;
const BOUND_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SETUP_TIMEOUT_MS = 5_000;
let requestSequence = 0;

export type InvitationPasswordIntent = {
  requestId: string;
  email: string;
  userId: string | null;
  createdAt: number;
};

/** Keep setup records scoped to a single Auth user without unsafe storage-key characters. */
function userSetupKey(userId: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(userId))
    throw new Error("Unable to identify the account awaiting password setup.");
  return `${USER_KEY_PREFIX}${userId}`;
}

/** Reject damaged storage rather than silently skipping an unfinished enrollment step. */
function parseIntent(value: string | null): InvitationPasswordIntent | null {
  if (!value) return null;
  let parsed: Partial<InvitationPasswordIntent>;
  try { parsed = JSON.parse(value); } catch {
    throw new Error("Unable to read invitation password setup.");
  }
  if (
    !parsed || typeof parsed !== "object" ||
    typeof parsed.requestId !== "string" || !parsed.requestId ||
    typeof parsed.email !== "string" || parsed.email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.email) ||
    (parsed.userId !== null && typeof parsed.userId !== "string") ||
    typeof parsed.createdAt !== "number" || !Number.isFinite(parsed.createdAt)
  ) throw new Error("Unable to read invitation password setup.");
  return parsed as InvitationPasswordIntent;
}

/** A recent email-only intent bridges the SDK's SIGNED_IN event before user binding finishes. */
function isFresh(intent: InvitationPasswordIntent, maxAge: number) {
  const age = Date.now() - intent.createdAt;
  return age >= 0 && age <= maxAge;
}

/** Bound setup work so an unavailable secure store cannot leave startup or saving stuck. */
async function withSetupTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Invitation setup check timed out. Please try again.")), SETUP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Check the live server identity before interpreting local enrollment continuity state. */
async function verifiedAccountEmail(userId: string) {
  if (!supabase) throw new Error("Authentication is not configured.");
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (
    data.user?.id !== userId || !data.user.email ||
    !data.user.email_confirmed_at
  ) throw new Error("Your account changed. Please sign in again.");
  return data.user.email.trim().toLowerCase();
}

/** Persist email-only intent before the SDK can publish or save its verified session. */
export async function beginInvitationPasswordSetup(email: string): Promise<InvitationPasswordIntent> {
  const createdAt = Date.now();
  const intent: InvitationPasswordIntent = {
    requestId: `${createdAt}:${++requestSequence}`,
    email,
    userId: null,
    createdAt,
  };
  await secureSessionStorage.setItem(PENDING_KEY, JSON.stringify(intent));
  return intent;
}

/** Remove only this request's unbound intent; another account's saved setup stays intact. */
export async function discardInvitationPasswordIntent(intent: InvitationPasswordIntent) {
  const saved = parseIntent(await secureSessionStorage.getItem(PENDING_KEY));
  if (saved?.requestId === intent.requestId)
    await secureSessionStorage.removeItem(PENDING_KEY);
}

/** Bind successful verification before removing the short-lived pre-verification intent. */
export async function bindInvitationPasswordSetup(intent: InvitationPasswordIntent, userId: string) {
  await secureSessionStorage.setItem(userSetupKey(userId), JSON.stringify({ ...intent, userId }));
  await discardInvitationPasswordIntent(intent);
}

/** Resume unfinished enrollment only for a fresh marker matching the current verified account. */
export async function needsInvitationPasswordSetup(userId: string): Promise<boolean> {
  return withSetupTimeout((async () => {
    const [bound, pending] = await Promise.all([
      secureSessionStorage.getItem(userSetupKey(userId)).then(parseIntent),
      secureSessionStorage.getItem(PENDING_KEY).then(parseIntent),
    ]);
    const candidates = [
      bound?.userId === userId && isFresh(bound, BOUND_MAX_AGE_MS) ? bound : null,
      pending?.userId === null && isFresh(pending, PENDING_MAX_AGE_MS) ? pending : null,
    ].filter((intent): intent is InvitationPasswordIntent => Boolean(intent));
    if (candidates.length === 0) return false;
    const email = await verifiedAccountEmail(userId);
    return candidates.some((intent) => intent.email === email);
  })());
}

/** Clear only the verified account's setup after its password update has succeeded. */
export async function completeInvitationPasswordSetup(userId: string): Promise<void> {
  return withSetupTimeout((async () => {
    const email = await verifiedAccountEmail(userId);
    const key = userSetupKey(userId);
    const pendingValue = await secureSessionStorage.getItem(PENDING_KEY);
    let pending: InvitationPasswordIntent | null = null;
    let corruptPending = false;
    try {
      pending = parseIntent(pendingValue);
    } catch {
      // A successful, verified password update must be able to repair the
      // damaged global intent that originally sent this account to setup.
      corruptPending = true;
    }
    await secureSessionStorage.removeItem(key);
    if (corruptPending) {
      // Never delete a newer, valid invitation that replaced the damaged value.
      if (await secureSessionStorage.getItem(PENDING_KEY) === pendingValue)
        await secureSessionStorage.removeItem(PENDING_KEY);
    } else if (pending?.userId === null && pending.email === email) {
      await discardInvitationPasswordIntent(pending);
    }
  })());
}
