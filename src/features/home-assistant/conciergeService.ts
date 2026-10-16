import { supabase } from '../../services/supabaseClient';
import type { ConciergeContext } from '../../../shared/home-concierge/contract';

type RequestScope = { userId: string; homeId: string; isCurrent: () => boolean };
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_RESPONSE_BYTES = 24_000;

/** Bound authentication and transport even when a platform promise does not itself support cancellation. */
function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new ConciergeServiceError('network')); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    // The operation has already started, so observe rejection even when cancellation happened synchronously.
    operation.then((result) => { cleanup(); resolve(result); }, (error: unknown) => { cleanup(); reject(error); });
    signal.addEventListener('abort', abort);
    if (signal.aborted) { abort(); return; }
  });
}

/** Surface useful recovery without forwarding provider errors, prompts, or credentials. */
export class ConciergeServiceError extends Error {
  constructor(public readonly code: 'unavailable' | 'access' | 'limited' | 'network' | 'invalid') {
    super({ unavailable: 'AI is not connected yet. Your on-device brief and Controls are available.',
      access: 'Your home access changed. Reopen the assistant to continue.',
      limited: 'The assistant has reached its request limit. Please try again later.',
      network: 'The assistant could not connect. Check your connection and try again.',
      invalid: 'That answer could not be verified. Please try again.' }[code]);
    this.name = 'ConciergeServiceError';
  }
}

/** Bind a request to one captured account and cancel both auth waits and network work on scope loss. */
async function callConcierge(scope: RequestScope, payload: object, signal: AbortSignal): Promise<unknown> {
  if (!supabase) throw new ConciergeServiceError('unavailable');
  if (signal.aborted || !scope.isCurrent()) throw new ConciergeServiceError('access');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort);
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, REQUEST_TIMEOUT_MS);
  try {
    const { data, error } = await abortable(supabase.auth.getSession(), controller.signal);
    if (signal.aborted || !scope.isCurrent()) throw new ConciergeServiceError('access');
    if (controller.signal.aborted) throw new ConciergeServiceError('network');
    if (error || !data.session?.access_token || data.session.user.id !== scope.userId) throw new ConciergeServiceError('access');
    const { data: result, error: requestError } = await abortable(supabase.functions.invoke('home-concierge', {
      body: { ...payload, homeId: scope.homeId },
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      signal: controller.signal,
    }), controller.signal);
    if (signal.aborted || !scope.isCurrent()) throw new ConciergeServiceError('access');
    if (controller.signal.aborted) throw new ConciergeServiceError('network');
    if (requestError) {
      const status = typeof Response !== 'undefined' && requestError.context instanceof Response ? requestError.context.status : 0;
      throw new ConciergeServiceError(status === 429 ? 'limited' : status === 401 || status === 403 ? 'access'
        : status === 503 || status === 404 ? 'unavailable' : 'network');
    }
    // The server already bounds output. This additional boundary rejects malformed proxy/client responses.
    if (JSON.stringify(result)?.length > MAX_RESPONSE_BYTES) throw new ConciergeServiceError('invalid');
    return result;
  } catch (error) {
    if (error instanceof ConciergeServiceError) throw error;
    throw new ConciergeServiceError('network');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

/** Check configuration without sending a question or device state to the model provider. */
export async function conciergeAvailability(scope: RequestScope, signal: AbortSignal): Promise<boolean> {
  const result = await callConcierge(scope, { operation: 'availability' }, signal);
  if (!result || typeof result !== 'object' || !('available' in result) || typeof result.available !== 'boolean') {
    throw new ConciergeServiceError('invalid');
  }
  return result.available;
}

/** Send only the bounded consented question and permitted simulation values; the caller validates the answer. */
export function requestConcierge(scope: RequestScope, question: string, context: ConciergeContext, signal: AbortSignal): Promise<unknown> {
  return callConcierge(scope, { operation: 'ask', question, context }, signal);
}
