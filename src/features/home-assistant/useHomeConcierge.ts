import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useHomeStore } from '../../store/useHomeStore';
import { useSimulationControls } from '../three-d-home/useSimulationControls';
import { MAX_CONCIERGE_CONTEXT_AGE_MS, parseConciergeResponse, type ConciergeResponse } from '../../../shared/home-concierge/contract';
import { assistantAuthorizationFingerprint, assistantContextIsCurrent, assistantSceneDraft, buildAssistantContext, type AssistantContext } from './assistantContext';
import { conciergeAvailability, ConciergeServiceError, requestConcierge } from './conciergeService';
import { stageAssistantDraft } from './assistantDraftHandoff';

export type ConciergeStatus = 'checking' | 'ready' | 'unavailable' | 'asking' | 'error';
type Answer = { response: ConciergeResponse; context: AssistantContext };

/** Own one private, short-lived question at a time; no conversation, command or provider key is persisted. */
export function useHomeConcierge() {
  const simulation = useSimulationControls();
  const fingerprint = useHomeStore(assistantAuthorizationFingerprint);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<ConciergeStatus>('checking');
  const [available, setAvailable] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const work = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const context = buildAssistantContext(useHomeStore.getState(), simulation);
  const contextRef = useRef(context);
  contextRef.current = context;

  /** Invalidate before aborting so even an already-resolved promise cannot repaint the panel. */
  const cancel = useCallback(() => {
    const previous = work.current;
    work.current = null;
    previous?.abort();
    if (mounted.current) setStatus(available ? 'ready' : 'unavailable');
  }, [available]);

  /** Forget the last answer on demand; there is no transcript or background memory. */
  const clear = useCallback(() => { setAnswer(null); setError(null); }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; work.current?.abort(); work.current = null; };
  }, []);

  useEffect(() => {
    const abort = () => { work.current?.abort(); work.current = null; setAnswer(null); setAvailable(false); setStatus('unavailable'); };
    const unsubscribe = useHomeStore.subscribe((state) => {
      if (assistantAuthorizationFingerprint(state) !== fingerprint) abort();
    });
    let previousState = AppState.currentState;
    const background = AppState.addEventListener('change', (next) => {
      if (next !== 'active') abort();
      else if (previousState !== 'active') setRevision((value) => value + 1);
      previousState = next;
    });
    return () => { unsubscribe(); background.remove(); };
  }, [fingerprint]);

  useEffect(() => {
    work.current?.abort();
    const controller = new AbortController();
    work.current = controller;
    setAnswer(null); setError(null); setAvailable(false);
    const state = useHomeStore.getState();
    if (!context.available || !state.authenticatedUserId || !state.activeHomeId) {
      setStatus('unavailable'); work.current = null; return;
    }
    setStatus('checking');
    const isCurrent = () => mounted.current && work.current === controller && !controller.signal.aborted
      && assistantAuthorizationFingerprint(useHomeStore.getState()) === fingerprint
      && assistantContextIsCurrent(contextRef.current, useHomeStore.getState());
    void conciergeAvailability({ userId: state.authenticatedUserId, homeId: state.activeHomeId, isCurrent }, controller.signal)
      .then((configured) => { if (isCurrent()) { setAvailable(configured); setStatus(configured ? 'ready' : 'unavailable'); } })
      .catch((failure: unknown) => { if (isCurrent()) { setStatus('error'); setError(failure instanceof ConciergeServiceError ? failure.message : 'The assistant could not connect. Try again.'); } })
      .finally(() => { if (work.current === controller) work.current = null; });
    return () => { controller.abort(); if (work.current === controller) work.current = null; };
  }, [fingerprint, context.available, revision]);

  useEffect(() => {
    const deadline = context.expiresAt;
    if (deadline === null) return;
    const timeout = setTimeout(() => { cancel(); clear(); setRevision((value) => value + 1); }, Math.max(0, deadline - Date.now() + 1));
    return () => clearTimeout(timeout);
  }, [context.expiresAt, cancel, clear]);

  useEffect(() => {
    if (!answer) return;
    const timeout = setTimeout(() => {
      setAnswer(null); setError('That snapshot is out of date. Send your question again for a fresh answer.'); setStatus('error');
    }, Math.max(0, answer.context.capturedAt + MAX_CONCIERGE_CONTEXT_AGE_MS - Date.now() + 1));
    return () => clearTimeout(timeout);
  }, [answer]);

  /** Ask only after explicit Send, with a fresh permitted simulation snapshot and no automatic retries. */
  const ask = useCallback(async (question: string): Promise<void> => {
    const state = useHomeStore.getState();
    const captured = buildAssistantContext(state, simulation.client.getSnapshot());
    if (!available || work.current || !captured.available || !captured.requestContext || !state.authenticatedUserId || !state.activeHomeId) return;
    if (!question.trim() || question.length > 600) { setError('Use a question of up to 600 characters.'); return; }
    const controller = new AbortController();
    work.current = controller;
    setStatus('asking'); setError(null); setAnswer(null);
    const isCurrent = () => mounted.current && work.current === controller && !controller.signal.aborted
      && assistantContextIsCurrent(captured, useHomeStore.getState());
    try {
      const result = await requestConcierge({ userId: state.authenticatedUserId, homeId: state.activeHomeId, isCurrent }, question.trim(), captured.requestContext, controller.signal);
      if (!isCurrent()) return;
      const parsed = parseConciergeResponse(result, captured.devices, captured.canDraft);
      if (!parsed) throw new ConciergeServiceError('invalid');
      setAnswer({ response: parsed, context: captured }); setStatus('ready');
    } catch (failure) {
      if (isCurrent()) { setStatus('error'); setError(failure instanceof ConciergeServiceError ? failure.message : 'That answer could not be verified. Try again.'); }
    } finally { if (work.current === controller) work.current = null; }
  }, [available, simulation.client]);

  /** Revalidate model proposals against today's bindings and grants before opening the ordinary scene editor. */
  const prepareReview = useCallback((): string | null => {
    if (!answer) return null;
    const draft = assistantSceneDraft(answer.response, answer.context, useHomeStore.getState(), simulation.client.getSnapshot());
    if (!draft) { setError('This suggestion is no longer current. Ask for a fresh scene.'); return null; }
    try { return stageAssistantDraft(draft, Math.min(answer.context.capturedAt + MAX_CONCIERGE_CONTEXT_AGE_MS, answer.context.expiresAt ?? Infinity)); }
    catch { setError('This suggestion is no longer available. Ask for a fresh scene.'); return null; }
  }, [answer, simulation.client]);

  return { context, status, response: answer?.response ?? null, error, ask, cancel, clear,
    canAsk: available && context.available && status !== 'asking' && status !== 'checking',
    canReview: Boolean(answer?.response.scene && context.canDraft && assistantContextIsCurrent(answer.context, useHomeStore.getState())),
    prepareReview, retryAvailability: () => setRevision((value) => value + 1) };
}
