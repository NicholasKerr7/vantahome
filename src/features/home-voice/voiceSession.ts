type VoiceOwner = { token: symbol; interrupt: () => void };
let owner: VoiceOwner | null = null;
let pending: Promise<unknown> = Promise.resolve();

/** Serialize the single native recognizer's startup and teardown across every voice surface. */
export function queueVoiceOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = pending.then(operation);
  pending = next.catch(() => undefined);
  return next;
}

/** A new explicit microphone/speech action invalidates the previous owner's callbacks synchronously. */
export function claimVoiceSession(interrupt: () => void): symbol {
  owner?.interrupt();
  const token = Symbol('voice-session');
  owner = { token, interrupt };
  return token;
}

/** Stale hooks must never stop, receive audio from, or destroy another surface's recognizer. */
export function ownsVoiceSession(token: symbol | null): boolean {
  return token !== null && owner?.token === token;
}

/** Release ownership before asynchronous cleanup; already-queued cleanup precedes the next start. */
export function releaseVoiceSession(token: symbol | null): boolean {
  if (!ownsVoiceSession(token)) return false;
  owner = null;
  return true;
}
