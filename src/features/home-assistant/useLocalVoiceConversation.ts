import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConciergeResponse } from '../../../shared/home-concierge/contract';
import { useHomeStore } from '../../store/useHomeStore';
import { executeVoiceCommand } from '../home-voice/executeVoiceCommand';
import { voiceCommandFeedback } from '../home-voice/voiceCommandFeedback';
import type { SimulationControlClient } from '../three-d-home/simulationControlClient';
import { buildAssistantContext, type AssistantContext } from './assistantContext';
import { localVoiceReply } from './localAssistantVoice';
import { currentVoiceClarification, hasVoiceFollowUp, isVoiceFollowUp, rememberVoiceCommand, resolveVoiceConversation,
  type VoiceConversationMemory } from './voiceConversation';

type Options = {
  client: SimulationControlClient;
  context: AssistantContext;
  roomId: string | null;
  isCurrent: (context: AssistantContext) => boolean;
  onReply: (response: ConciergeResponse, context: AssistantContext) => void;
};

/** Keep only short-lived permitted targets and unresolved choices; never persist audio or conversation. */
export function useLocalVoiceConversation(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const mounted = useRef(true);
  const memory = useRef<VoiceConversationMemory | null>(null);
  const [visibleMemory, setVisibleMemory] = useState<VoiceConversationMemory | null>(null);

  /** Retire references synchronously, before React commits a permission or consent transition. */
  const reset = useCallback(() => {
    memory.current = null;
    if (mounted.current) setVisibleMemory(null);
  }, []);

  /** Read authoritative registry and simulation state again for every request or follow-up predicate. */
  const capture = useCallback(() => {
    const current = latest.current;
    return buildAssistantContext(useHomeStore.getState(), current.client.getSnapshot(), Date.now(), { roomId: current.roomId });
  }, []);

  /** An eight-second microphone window can admit only a currently understood follow-up, never a new intent. */
  const acceptsFollowUp = useCallback((question: string): boolean => {
    const context = capture();
    return mounted.current && latest.current.isCurrent(context)
      && isVoiceFollowUp(question, memory.current, context);
  }, [capture]);

  /** Arm listening only when there is a valid continuation; status and cancellation replies stay wake-only. */
  const readFollowUp = useCallback((): ((question: string) => boolean) | null => {
    const context = capture();
    return mounted.current && latest.current.isCurrent(context) && hasVoiceFollowUp(memory.current, context)
      ? acceptsFollowUp : null;
  }, [capture, acceptsFollowUp]);

  /** Resolve locally with fresh grants, and remember targets only after the reducer confirms completion. */
  const respond = useCallback((question: string, consentCurrent: () => boolean): ConciergeResponse | null => {
    const captured = capture();
    const current = () => mounted.current && consentCurrent() && latest.current.isCurrent(captured);
    if (!current()) { reset(); return localVoiceReply('Your home access or listening session changed. Please try again.'); }
    const result = resolveVoiceConversation(question, captured, memory.current);
    memory.current = result.memory;
    if (result.resolution.kind === 'cloud') { reset(); return null; }
    let reply: ConciergeResponse;
    if (result.resolution.kind === 'command') {
      if (!current()) { reset(); return localVoiceReply('Your access changed. Nothing changed.'); }
      const outcome = executeVoiceCommand(latest.current.client, result.resolution.command);
      reply = localVoiceReply(voiceCommandFeedback(outcome, result.resolution.description), result.resolution.deviceIds, 'Your request');
      const fresh = capture();
      memory.current = outcome.status === 'completed' && current() && latest.current.isCurrent(fresh)
        ? rememberVoiceCommand(fresh, result.resolution) : null;
    } else reply = result.resolution.response;
    if (!current()) { reset(); return localVoiceReply('Your home access changed. Reopen the assistant.'); }
    const fresh = capture();
    if (fresh.available && latest.current.isCurrent(fresh)) {
      setVisibleMemory(memory.current);
      latest.current.onReply(reply, fresh);
    } else reset();
    return reply;
  }, [capture, reset]);

  useEffect(() => { reset(); }, [options.context.fingerprint, reset]);
  useEffect(() => {
    if (!visibleMemory) return;
    const timer = setTimeout(reset, Math.max(0, visibleMemory.expiresAt - Date.now() + 1));
    return () => clearTimeout(timer);
  }, [visibleMemory, reset]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; memory.current = null; };
  }, []);

  return { respond, reset, acceptsFollowUp, readFollowUp,
    clarification: currentVoiceClarification(visibleMemory, options.context),
  };
}
