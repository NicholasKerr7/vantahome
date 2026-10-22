import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useHomeStore, type HomeState, type Scene } from '../../store/useHomeStore';
import { useSimulationControls } from '../three-d-home/useSimulationControls';
import type { ControlSnapshot } from '../three-d-home/simulationControlClient';
import { MAX_CONCIERGE_CONTEXT_AGE_MS, parseConciergeResponse, type ConciergeResponse } from '../../../shared/home-concierge/contract';
import { assistantAuthorizationFingerprint, assistantContextIsCurrent, assistantSceneDraft, buildAssistantContext, type AssistantContext, type AssistantScopeOptions } from './assistantContext';
import { conciergeAvailability, ConciergeServiceError, requestConcierge } from './conciergeService';
import { clearAssistantDraft, stageAssistantDraft } from './assistantDraftHandoff';

export type ConciergeStatus = 'checking' | 'ready' | 'unavailable' | 'asking' | 'error';
type Answer = { response: ConciergeResponse; context: AssistantContext };
export type AssistantPreview = {
  draft: Omit<Scene, 'id'>;
  context: AssistantContext;
  capturedContext: AssistantContext;
  snapshot: ControlSnapshot;
  response: ConciergeResponse;
  expiresAt: number;
};

/** Copy only admitted comfort readings into a detached, read-only-purpose rendering sandbox. */
function scopedPreviewSnapshot(snapshot: ControlSnapshot, context: AssistantContext, state: HomeState): ControlSnapshot {
  const deviceIds = context.devices.map((device) => device.modelDeviceId);
  const modelRoomIds = new Map(state.rooms.map((room) => [room.id, room.modelRoomId]));
  const roomIds = [...new Set(context.devices.map((device) =>
    modelRoomIds.get(device.roomId)).filter((id): id is string => Boolean(id)))];
  return {
    ready: snapshot.ready, status: snapshot.status,
    state: { ...snapshot.state, deviceStates: Object.fromEntries(deviceIds.map((id) => {
      const reading = snapshot.state.deviceStates[id];
      return [id, { ...reading, ...(reading.settings ? { settings: { ...reading.settings } } : {}) }];
    })) },
    access: { fullHome: false, propertyOverview: false, interiorLayout: false, roomIds, deviceIds,
      controllableDeviceIds: [], editableDeviceIds: [] },
  };
}

/** Compare admitted device identities and grants without treating ordinary readings as a scope change. */
function deviceScopeFingerprint(context: AssistantContext): string {
  return JSON.stringify(context.devices.map((device) => [device.id, device.controllable]));
}

/** Own one private, short-lived question at a time; no conversation, command or provider key is persisted. */
export function useHomeConcierge({ roomId = null }: AssistantScopeOptions = {}) {
  const simulation = useSimulationControls();
  const selectFingerprint = useCallback((state: HomeState) => assistantAuthorizationFingerprint(state, roomId), [roomId]);
  const fingerprint = useHomeStore(selectFingerprint);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<ConciergeStatus>('checking');
  const [available, setAvailable] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const work = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const context = buildAssistantContext(useHomeStore.getState(), simulation, Date.now(), { roomId });
  const contextRef = useRef(context);
  contextRef.current = context;
  const active = useRef(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const visibleAnswer = answer && active.current && context.available
    && answer.context.fingerprint === context.fingerprint
    && deviceScopeFingerprint(answer.context) === deviceScopeFingerprint(context)
    && assistantContextIsCurrent(answer.context, useHomeStore.getState())
    && parseConciergeResponse(answer.response, context.devices, context.canDraft) ? answer : null;
  const answerRef = useRef(visibleAnswer);
  answerRef.current = visibleAnswer;
  // Readings can update without invalidation; a narrowed snapshot grant must cancel pending work.
  const deviceScope = deviceScopeFingerprint(context);

  /** Invalidate before aborting so even an already-resolved promise cannot repaint the panel. */
  const cancel = useCallback(() => {
    const previous = work.current;
    work.current = null;
    previous?.abort();
    if (mounted.current) setStatus(available ? 'ready' : 'unavailable');
  }, [available]);

  /** Forget the last answer on demand; there is no transcript or background memory. */
  const clear = useCallback(() => { answerRef.current = null; setAnswer(null); setError(null); }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; work.current?.abort(); work.current = null; };
  }, []);

  useEffect(() => {
    const abort = () => { answerRef.current = null; work.current?.abort(); work.current = null; setAnswer(null); setAvailable(false); setStatus('unavailable'); };
    const unsubscribe = useHomeStore.subscribe((state) => {
      if (assistantAuthorizationFingerprint(state, roomId) !== fingerprint) abort();
    });
    let previousState = AppState.currentState;
    const background = AppState.addEventListener('change', (next) => {
      active.current = next === 'active';
      if (next !== 'active') abort();
      else if (previousState !== 'active') setRevision((value) => value + 1);
      previousState = next;
    });
    return () => { unsubscribe(); background.remove(); };
  }, [fingerprint, roomId]);

  useEffect(() => { clearAssistantDraft(); }, [fingerprint]);

  useEffect(() => {
    work.current?.abort();
    const controller = new AbortController();
    work.current = controller;
    answerRef.current = null; setAnswer(null); setError(null); setAvailable(false);
    const state = useHomeStore.getState();
    if (!active.current || !context.available || !state.authenticatedUserId || !state.activeHomeId) {
      setStatus('unavailable'); work.current = null; return;
    }
    setStatus('checking');
    const isCurrent = () => mounted.current && work.current === controller && !controller.signal.aborted
      && active.current && contextRef.current.fingerprint === fingerprint
      && assistantAuthorizationFingerprint(useHomeStore.getState(), roomId) === fingerprint
      && assistantContextIsCurrent(contextRef.current, useHomeStore.getState());
    void conciergeAvailability({ userId: state.authenticatedUserId, homeId: state.activeHomeId, isCurrent }, controller.signal)
      .then((configured) => { if (isCurrent()) { setAvailable(configured); setStatus(configured ? 'ready' : 'unavailable'); } })
      .catch((failure: unknown) => { if (isCurrent()) { setStatus('error'); setError(failure instanceof ConciergeServiceError ? failure.message : 'The assistant could not connect. Try again.'); } })
      .finally(() => { if (work.current === controller) work.current = null; });
    return () => { controller.abort(); if (work.current === controller) work.current = null; };
  }, [fingerprint, roomId, context.available, deviceScope, revision]);

  useEffect(() => {
    const deadline = context.expiresAt;
    if (deadline === null) return;
    const timeout = setTimeout(() => { cancel(); clear(); setRevision((value) => value + 1); }, Math.max(0, deadline - Date.now() + 1));
    return () => clearTimeout(timeout);
  }, [context.expiresAt, cancel, clear]);

  useEffect(() => {
    if (!answer) return;
    const timeout = setTimeout(() => {
      answerRef.current = null; setAnswer(null); setError('That snapshot is out of date. Send your question again for a fresh answer.'); setStatus('error');
    }, Math.max(0, answer.context.capturedAt + MAX_CONCIERGE_CONTEXT_AGE_MS - Date.now() + 1));
    return () => clearTimeout(timeout);
  }, [answer]);

  /** Ask only after explicit Send, with a fresh permitted simulation snapshot and no automatic retries. */
  const ask = useCallback(async (question: string): Promise<void> => {
    const state = useHomeStore.getState();
    const captured = buildAssistantContext(state, simulation.client.getSnapshot(), Date.now(), { roomId });
    if (!mounted.current || !active.current || contextRef.current.fingerprint !== fingerprint
      || captured.fingerprint !== fingerprint || !available || work.current || !captured.available
      || !captured.requestContext || !state.authenticatedUserId || !state.activeHomeId) return;
    if (!question.trim() || question.length > 600) { setError('Use a question of up to 600 characters.'); return; }
    const controller = new AbortController();
    work.current = controller;
    answerRef.current = null; setStatus('asking'); setError(null); setAnswer(null);
    const isCurrent = () => {
      const currentState = useHomeStore.getState();
      const current = buildAssistantContext(currentState, simulation.client.getSnapshot(), Date.now(), { roomId });
      return mounted.current && work.current === controller && !controller.signal.aborted
        && active.current && contextRef.current.fingerprint === captured.fingerprint
        && assistantContextIsCurrent(captured, currentState) && current.available
        && deviceScopeFingerprint(current) === deviceScopeFingerprint(captured);
    };
    try {
      const result = await requestConcierge({ userId: state.authenticatedUserId, homeId: state.activeHomeId, isCurrent }, question.trim(), captured.requestContext, controller.signal);
      if (!isCurrent()) return;
      const parsed = parseConciergeResponse(result, captured.devices, captured.canDraft);
      if (!parsed) throw new ConciergeServiceError('invalid');
      setAnswer({ response: parsed, context: captured }); setStatus('ready');
    } catch (failure) {
      if (isCurrent()) { setStatus('error'); setError(failure instanceof ConciergeServiceError ? failure.message : 'That answer could not be verified. Try again.'); }
    } finally { if (work.current === controller) work.current = null; }
  }, [available, simulation.client, fingerprint, roomId]);

  /** Recheck scope, target conflicts and the original deadline without consuming a review handoff. */
  const preparePreview = useCallback((): AssistantPreview | null => {
    if (!mounted.current || !active.current || !visibleAnswer || answerRef.current !== visibleAnswer
      || contextRef.current.fingerprint !== visibleAnswer.context.fingerprint) return null;
    const state = useHomeStore.getState();
    const snapshot = simulation.client.getSnapshot();
    const now = Date.now();
    const draft = assistantSceneDraft(visibleAnswer.response, visibleAnswer.context, state, snapshot, now);
    if (!draft) { setError('This suggestion changed or is no longer current. Ask for a fresh scene.'); return null; }
    const freshContext = buildAssistantContext(state, snapshot, now, { roomId });
    return { draft, context: freshContext, capturedContext: visibleAnswer.context,
      snapshot: scopedPreviewSnapshot(snapshot, freshContext, state), response: visibleAnswer.response,
      expiresAt: Math.min(visibleAnswer.context.capturedAt + MAX_CONCIERGE_CONTEXT_AGE_MS, visibleAnswer.context.expiresAt ?? Infinity) };
  }, [visibleAnswer, simulation.client, roomId]);

  /** Revalidate model proposals against today's bindings and grants before opening the ordinary scene editor. */
  const prepareReview = useCallback((): string | null => {
    const preview = preparePreview();
    if (!preview) return null;
    try { return stageAssistantDraft(preview.draft, preview.expiresAt); }
    catch { setError('This suggestion is no longer available. Ask for a fresh scene.'); return null; }
  }, [preparePreview]);

  /** Restore an unavailable local snapshot before retrying the server configuration check. */
  const retryAvailability = useCallback(() => {
    if (!simulation.ready) simulation.reconnect();
    setRevision((value) => value + 1);
  }, [simulation.ready, simulation.reconnect]);

  return { context, availableRooms: context.availableRooms, roomId, scopeLabel: context.scopeLabel,
    proposalDevices: visibleAnswer?.context.devices ?? [],
    status, response: visibleAnswer?.response ?? null, error, ask, cancel, clear,
    canAsk: active.current && available && context.available && status !== 'asking' && status !== 'checking',
    canReview: Boolean(visibleAnswer?.response.scene && context.canDraft
      && assistantSceneDraft(visibleAnswer.response, visibleAnswer.context, useHomeStore.getState(), simulation)),
    preparePreview, prepareReview, retryAvailability };
}
