import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantVoiceController } from './AssistantVoiceControls';
import type { useHomeConcierge } from './useHomeConcierge';

/** A short-lived question bound to the foreground session and room that heard it. */
export type AssistantVoiceRequest = {
  id: number;
  question: string;
  sessionToken: number;
  roomId: string | null;
  expiresAt: number;
};

type Props = {
  request?: AssistantVoiceRequest | null;
  voice?: AssistantVoiceController;
  assistant: ReturnType<typeof useHomeConcierge>;
  roomId: string | null;
  previewing: boolean;
  onConsumed?: () => void;
  onPrepared: (question: string) => void;
};

/** Bind automatic submission and narration to one consented request; manual actions can retire it. */
export function useAssistantVoiceRequests({ request, voice, assistant, roomId, previewing, onConsumed, onPrepared }: Props) {
  const consumed = useRef(0);
  const pending = useRef<{ id: number; token: number; fingerprint: string } | null>(null);
  const [completed, setCompleted] = useState<number | null>(null);
  const { context, status, response, error, canAsk, ask } = assistant;

  /** Cancel queued and in-flight automatic speech without affecting explicit manual Hear actions. */
  const discard = useCallback(() => {
    pending.current = null;
    if (request && consumed.current < request.id) {
      consumed.current = request.id;
      onConsumed?.();
    }
  }, [request, onConsumed]);

  useEffect(() => {
    if (!request || consumed.current >= request.id) return;
    consumed.current = request.id;
    onConsumed?.();
    if (!voice?.isSessionCurrent(request.sessionToken) || request.roomId !== roomId
      || request.expiresAt <= Date.now() || previewing) return;
    if (!canAsk) {
      voice.speak(context.reason || error || 'The assistant is still connecting. Please try your question again shortly.');
      return;
    }
    pending.current = { id: request.id, token: request.sessionToken, fingerprint: context.fingerprint };
    onPrepared(request.question);
    // Consent to the wake session permits Ask only. It does not create, save or execute scenes.
    void ask(request.question).finally(() => {
      if (pending.current?.id === request.id) setCompleted(request.id);
    });
  }, [request, voice?.isSessionCurrent, voice?.speak, roomId, previewing, canAsk, context.reason, context.fingerprint, error, ask, onConsumed, onPrepared]);

  useEffect(() => {
    const current = pending.current;
    if (!current || completed !== current.id || status === 'asking') return;
    pending.current = null;
    if (!voice?.isSessionCurrent(current.token) || current.fingerprint !== context.fingerprint || !context.available || previewing) return;
    voice.speak(response
      ? `${response.answer}${response.scene ? ' Nothing has changed. Preview and review the scene, then save it. Run scene is a separate action.' : ''}`
      : error || 'I could not complete that request. Your controls are available.');
  }, [completed, status, response, error, context.fingerprint, context.available, previewing, voice?.isSessionCurrent, voice?.speak]);

  useEffect(() => {
    // A permission change, hidden preview or unmount retires late async completion callbacks.
    return () => { pending.current = null; };
  }, [context.fingerprint, previewing]);
  return discard;
}
