import { secureSessionStorage } from './secureSessionStorage';
import { supabase } from './supabaseClient';

const PENDING_KEY = 'vantahome.auth.password-recovery.pending';
const USER_KEY_PREFIX = 'vantahome.auth.password-recovery.user.';
const READ_TIMEOUT_MS = 5_000;
let sequence = 0;
let writes = Promise.resolve();

export type PasswordRecoveryIntent = { requestId: string; email: string; userId: string | null; createdAt: number };

/** Keep persisted continuity separate for each authenticated account. */
function userKey(userId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(userId)) throw new Error('Unable to identify password recovery.');
  return `${USER_KEY_PREFIX}${userId}`;
}

/** Treat damaged continuity as unavailable instead of silently bypassing credential setup. */
function parse(value: string | null): PasswordRecoveryIntent | null {
  if (value === null) return null;
  try {
    const item: unknown = JSON.parse(value);
    if (!item || typeof item !== 'object') throw new Error();
    const record = item as Record<string, unknown>;
    if (typeof record.requestId !== 'string' || !record.requestId || record.requestId.length > 100
      || typeof record.email !== 'string' || record.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)
      || (record.userId !== null && (typeof record.userId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(record.userId)))
      || typeof record.createdAt !== 'number' || !Number.isFinite(record.createdAt)) throw new Error();
    return record as PasswordRecoveryIntent;
  } catch { throw new Error('Saved password recovery is unavailable. Return to sign in or try again.'); }
}

/** Serialize conditional cleanup so an old callback cannot erase newer recovery intent. */
function update(operation: () => Promise<void>): Promise<void> {
  const next = writes.then(operation, operation);
  writes = next.catch(() => undefined);
  return next;
}

/** Persist only completion intent; never store passwords, links, codes or tokens. */
export async function beginPasswordRecoverySetup(email: string, userId: string | null): Promise<PasswordRecoveryIntent> {
  const intent = { requestId: `${Date.now()}:${++sequence}`, email: email.trim().toLowerCase(), userId, createdAt: Date.now() };
  parse(JSON.stringify(intent));
  await update(() => secureSessionStorage.setItem(PENDING_KEY, JSON.stringify(intent)));
  return intent;
}

/** Remove only the callback's matching pending record. */
export async function discardPasswordRecoveryIntent(intent: PasswordRecoveryIntent): Promise<void> {
  await update(async () => {
    const pending = parse(await secureSessionStorage.getItem(PENDING_KEY));
    if (pending?.requestId === intent.requestId) await secureSessionStorage.removeItem(PENDING_KEY);
  });
}

/** Bind verified callback output to its original email and optional signed-in account. */
export async function bindPasswordRecoverySetup(intent: PasswordRecoveryIntent, user: { id: string; email?: string }): Promise<void> {
  if ((intent.userId && intent.userId !== user.id) || user.email?.trim().toLowerCase() !== intent.email) {
    throw new Error('This recovery belongs to a different account.');
  }
  await update(async () => {
    const pending = parse(await secureSessionStorage.getItem(PENDING_KEY));
    if (pending?.requestId !== intent.requestId) throw new Error('This recovery request was replaced.');
    await secureSessionStorage.setItem(userKey(user.id), JSON.stringify({ ...intent, userId: user.id }));
    await secureSessionStorage.removeItem(PENDING_KEY);
  });
}

/** Keep callback-started work until completion; an unbound record still requires the verified email. */
export async function needsPasswordRecoverySetup(userId: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([(async () => {
      await writes;
      const [bound, pending] = await Promise.all([
        secureSessionStorage.getItem(userKey(userId)).then(parse),
        secureSessionStorage.getItem(PENDING_KEY).then(parse),
      ]);
      if (bound && bound.userId !== userId) throw new Error('Saved recovery does not match this account.');
      const candidates = [
        bound?.userId === userId ? bound : null,
        pending && (pending.userId === null || pending.userId === userId) ? pending : null,
      ].filter((intent): intent is PasswordRecoveryIntent => Boolean(intent));
      if (!candidates.length) return false;
      if (!supabase) throw new Error('Authentication is unavailable.');
      const { data, error } = await supabase.auth.getUser();
      if (error || data.user?.id !== userId || !data.user.email_confirmed_at || !data.user.email) {
        throw new Error('Password recovery could not verify your account.');
      }
      return Boolean(bound?.userId === userId)
        || candidates.some(intent => intent.email === data.user!.email!.trim().toLowerCase());
    })(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Password recovery check timed out. Please try again.')), READ_TIMEOUT_MS);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export type PasswordRecoveryCompletion = Readonly<{ userId: string; email: string; bound: string | null; pending: string | null }>;

/** Capture only this account's reviewed records before a password update or local sign-out. */
export async function capturePasswordRecoverySetup(userId: string, verifiedEmail: string): Promise<PasswordRecoveryCompletion> {
  await writes;
  const [boundValue, pendingValue] = await Promise.all([
    secureSessionStorage.getItem(userKey(userId)), secureSessionStorage.getItem(PENDING_KEY),
  ]);
  const bound = parse(boundValue);
  const pending = parse(pendingValue);
  const email = verifiedEmail.trim().toLowerCase();
  if (bound && bound.userId !== userId) throw new Error('Saved recovery does not match this account.');
  return {
    userId,
    email,
    bound: boundValue,
    pending: pending && (!pending.userId || pending.userId === userId) && pending.email === email ? pendingValue : null,
  };
}

/** Clear only records reviewed before a confirmed update/sign-out; newer requests always survive. */
export async function completePasswordRecoverySetup(completion: PasswordRecoveryCompletion): Promise<boolean> {
  let completed = false;
  await update(async () => {
    const key = userKey(completion.userId);
    const [boundValue, pendingValue] = await Promise.all([secureSessionStorage.getItem(key), secureSessionStorage.getItem(PENDING_KEY)]);
    const bound = parse(boundValue);
    const pending = parse(pendingValue);
    const reviewedIds = [parse(completion.bound)?.requestId, parse(completion.pending)?.requestId].filter(Boolean);
    const ownPending = pending && (!pending.userId || pending.userId === completion.userId) && pending.email === completion.email;
    if ((bound && !reviewedIds.includes(bound.requestId)) || (ownPending && !reviewedIds.includes(pending.requestId))) return;
    if (bound && reviewedIds.includes(bound.requestId)) {
      await secureSessionStorage.removeItem(key);
    }
    if (ownPending && reviewedIds.includes(pending.requestId)) {
      await secureSessionStorage.removeItem(PENDING_KEY);
    }
    completed = true;
  });
  return completed;
}
