import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CinematicSurface from '../../components/CinematicSurface';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';
import CinematicCardArtwork from '../cinematic-artwork/CinematicCardArtwork';
import { sceneArtwork } from '../cinematic-artwork/artwork';
import HomeVoicePanel from '../home-voice/HomeVoicePanel';
import VoiceSignal from '../home-voice/VoiceSignal';
import { useVoiceRecognition } from '../home-voice/useVoiceRecognition';
import { useHomeConcierge } from './useHomeConcierge';
import { assistantStyles as styles } from './assistantStyles';

type Props = { onClose: () => void; onReviewScene: (token: string) => void };
type AssistantMode = 'ask' | 'controls';
const PROMPTS = [
  { label: 'Home brief', icon: 'home-outline', question: 'Give me a concise brief of my permitted home simulation settings.' },
  { label: 'Set a mood', icon: 'sparkles-outline', question: 'Draft a calm evening scene using the lights and comfort devices I can control.' },
  { label: 'Save energy', icon: 'leaf-outline', question: 'Which of my current simulation settings could I adjust to use less energy? Do not estimate bills or savings.' },
] as const;

/** Keep AI advice and explicit local commands distinct within the existing home assistant entry. */
export default function HomeAssistantPanel({ onClose, onReviewScene }: Props) {
  const assistant = useHomeConcierge();
  const { context, status, response, error, canAsk, canReview } = assistant;
  const [mode, setMode] = useState<AssistantMode>('ask');
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const { height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableHeight = height - insets.top - insets.bottom - 28;
  const compact = availableHeight < 690 || fontScale > 1.15;
  const largeText = fontScale > 1.15;
  const typing = inputFocused || input.length > 0;
  const sizing = useMemo(() => StyleSheet.create({ card: { height: Math.max(220, Math.min(680, availableHeight)) } }), [availableHeight]);
  const asking = status === 'asking';
  /** Dictation prepares a question only; an explicit Send is required before cloud processing. */
  const receiveDictation = useCallback((phrase: string) => setInput(phrase.slice(0, 600)), []);
  const speech = useVoiceRecognition(receiveDictation);
  const previousScope = useRef(context.fingerprint);
  useEffect(() => {
    // Unsent questions can contain private room names; do not carry them into another grant or home.
    if (previousScope.current !== context.fingerprint) {
      previousScope.current = context.fingerprint;
      speech.cancel(); Keyboard.dismiss(); setInput(''); setInputFocused(false);
    }
  }, [context.fingerprint, speech.cancel]);
  useEffect(() => { if (!context.available) speech.cancel(); }, [context.available, speech.cancel]);
  useEffect(() => {
    // A blur may precede a Review tap. Wait for keyboard dismissal to avoid moving that target mid-press.
    const subscription = Keyboard.addListener('keyboardDidHide', () => setInputFocused(false));
    return () => subscription.remove();
  }, []);

  /** Retire pending AI and microphone work before leaving this panel. */
  const close = () => { speech.cancel(); assistant.cancel(); assistant.clear(); Keyboard.dismiss(); onClose(); };
  /** Restore mode navigation explicitly when the user finishes composing, including web previews. */
  const finishTyping = () => { Keyboard.dismiss(); setInputFocused(false); };
  /** Switching modes discards advice so no delayed response can reappear beside direct controls. */
  const changeMode = (next: AssistantMode) => {
    if (next === mode) return;
    speech.cancel(); assistant.cancel(); assistant.clear(); Keyboard.dismiss(); setInput(''); setInputFocused(false); setMode(next);
  };
  /** Send one consented question without clearing it on a connection failure. */
  const send = () => {
    if (!canAsk || asking || speech.listening || !input.trim()) return;
    Keyboard.dismiss(); setInputFocused(false); void assistant.ask(input.trim());
  };
  /** Review consumes a fresh scoped token; this action never saves or runs device changes. */
  const review = () => {
    const token = assistant.prepareReview();
    if (!token) return;
    speech.cancel(); Keyboard.dismiss(); onReviewScene(token);
  };

  return <CinematicSurface style={[styles.card, sizing.card, compact && styles.compact]}>
    <View accessibilityViewIsModal style={[styles.panelBody, compact && styles.compactBody]}>
    <View style={styles.header}>
      {inputFocused && <Pressable accessibilityLabel="Finish typing" onPress={finishTyping} style={styles.inputAction}><Ionicons name="chevron-back" size={22} color={theme.colors.accentText} /></Pressable>}
      {!largeText && !inputFocused && <View style={styles.brand}><Ionicons name="sparkles-outline" size={23} color={theme.colors.text} /></View>}
      <View style={styles.headerCopy}><Text accessibilityRole={inputFocused ? 'header' : undefined} style={styles.eyebrow}>VANTA ASSISTANT</Text>{!inputFocused && <Text accessibilityRole="header" style={[styles.title, largeText && styles.accessibleTitle]}>{largeText ? 'Your home' : 'Home intelligence'}</Text>}</View>
      <Pressable accessibilityLabel="Close home assistant" onPress={close} style={styles.done}><Text style={styles.doneText}>Done</Text></Pressable>
    </View>
    {!inputFocused && <View accessibilityRole="tablist" style={styles.tabs}>
      <Pressable accessibilityRole="tab" accessibilityLabel="Ask assistant" accessibilityState={{ selected: mode === 'ask' }} onPress={() => changeMode('ask')} style={[styles.tab, mode === 'ask' && styles.selectedTab]}>
        <Ionicons name="sparkles-outline" size={17} color={theme.colors.text} /><Text style={[styles.tabText, mode === 'ask' && styles.selectedTabText]}>Ask</Text>
      </Pressable>
      <Pressable accessibilityRole="tab" accessibilityLabel="Direct voice controls" accessibilityState={{ selected: mode === 'controls' }} onPress={() => changeMode('controls')} style={[styles.tab, mode === 'controls' && styles.selectedTab]}>
        <Ionicons name="mic-outline" size={18} color={theme.colors.text} /><Text style={[styles.tabText, mode === 'controls' && styles.selectedTabText]}>Controls</Text>
      </Pressable>
    </View>}
    {mode === 'controls' ? <ScrollView style={styles.controls} contentContainerStyle={styles.controlsContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">
      <HomeVoicePanel embedded onClose={close} />
    </ScrollView> : <>
      <ScrollView testID="assistant-content" style={styles.content} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">
        {!response && canAsk && !compact && !typing && <View style={styles.hero}>
          <View style={styles.heroCopy}><Text style={styles.heroTitle}>{'A little insight.\nA better atmosphere.'}</Text><Text style={styles.detail}>Understand your home, then shape how it feels.</Text></View>
          <VoiceSignal listening={speech.listening} />
        </View>}
        {context.available && !response && <View testID="assistant-local-brief" style={styles.snapshot}>
          <View style={styles.snapshotHeading}><Ionicons name="phone-portrait-outline" size={13} color={theme.colors.accentText} /><Text style={styles.snapshotLabel}>On-device snapshot · Simulation</Text></View>
          <View style={styles.metrics}>
            <View style={styles.metric}><Text style={styles.metricValue}>{context.brief.roomCount}</Text><Text style={styles.metricLabel}>rooms in view</Text></View>
            <View style={styles.metric}><Text style={styles.metricValue}>{context.brief.lightsOnCount}</Text><Text style={styles.metricLabel}>lights on</Text></View>
            <View style={styles.metric}><Text style={styles.metricValue}>{context.brief.climateOnCount}</Text><Text style={styles.metricLabel}>climate on</Text></View>
          </View>
        </View>}
        {!response && canAsk && !typing && <View style={styles.prompts}>{PROMPTS.filter((prompt) => context.canDraft || prompt.label !== 'Set a mood').map((prompt) => <Pressable key={prompt.label} accessibilityLabel={prompt.label} accessibilityHint="Fills a question for you to review and send" disabled={!context.available || asking} onPress={() => setInput(prompt.question)} style={[styles.prompt, (!context.available || asking) && styles.disabled]}>
          <Ionicons name={prompt.icon} size={18} color={theme.colors.accentText} /><Text style={styles.promptLabel}>{prompt.label}</Text>
        </Pressable>)}</View>}
        {status === 'checking' && <View style={styles.notice} accessibilityLiveRegion="polite"><View style={styles.noticeHeader}><ActivityIndicator color={theme.colors.accent} /><Text style={styles.noticeTitle}>Connecting your assistant</Text></View><Text style={styles.detail}>Your local controls stay available.</Text></View>}
        {status === 'unavailable' && <View style={styles.notice} accessibilityLiveRegion="polite"><View style={styles.noticeHeader}><Ionicons name="cloud-offline-outline" size={20} color={theme.colors.accentText} /><Text style={styles.noticeTitle}>{context.available ? 'AI is not connected yet' : 'Home information unavailable'}</Text></View><Text style={styles.detail}>{context.available ? error || 'Your on-device brief and direct Controls are available. Cloud answers need the secure assistant connection.' : context.reason || 'Reopen the assistant after your home access and simulation are ready.'}</Text><Pressable accessibilityLabel="Check assistant connection" onPress={assistant.retryAvailability} style={styles.inlineAction}><Text style={styles.inlineActionText}>Check connection</Text></Pressable></View>}
        {!context.available && status !== 'unavailable' && <View style={styles.notice}><Text style={styles.noticeTitle}>Home information unavailable</Text><Text style={styles.detail}>{context.reason || 'Reopen the assistant after your home access and simulation are ready.'}</Text></View>}
        {asking && <View style={styles.notice} accessibilityLiveRegion="polite"><View style={styles.noticeHeader}><ActivityIndicator color={theme.colors.accent} /><Text style={styles.noticeTitle}>Considering your home</Text></View><Text style={styles.detail}>Using only your permitted simulation settings.</Text><Pressable accessibilityLabel="Cancel assistant request" onPress={assistant.cancel} style={styles.inlineAction}><Text style={styles.inlineActionText}>Cancel</Text></Pressable></View>}
        {(status === 'error' || (error && status !== 'unavailable' && !asking)) && <View style={styles.notice} accessibilityRole="alert"><Text style={styles.noticeTitle}>Let’s try that again</Text><Text style={styles.detail}>{error || 'The answer could not be completed. Your question is still here.'}</Text>{!canAsk && <Pressable accessibilityLabel="Check assistant connection" onPress={assistant.retryAvailability} style={styles.inlineAction}><Text style={styles.inlineActionText}>Check connection</Text></Pressable>}</View>}
        {response && !asking && <View testID="assistant-response" style={styles.response}>
          <View style={styles.responseHeading}><Ionicons name="sparkles-outline" size={17} color={theme.colors.accentText} /><Text accessibilityRole="header" style={styles.responseTitle}>{response.title}</Text></View>
          <Text style={styles.answer}>{response.answer}</Text>
          <Text style={styles.answerSource}>AI suggestion · Based on your permitted simulation snapshot</Text>
          {response.scene && <View style={[styles.draft, compact && styles.draftCompact]}>
            <CinematicCardArtwork artwork={sceneArtwork({ name: response.scene.name })} variant="scene-backdrop" />
            <View style={styles.draftCopy}><Text style={styles.draftLabel}>SCENE DRAFT</Text><Text style={styles.draftTitle}>{response.scene.name}</Text><Text style={styles.draftSummary}>{response.scene.actions.length} device {response.scene.actions.length === 1 ? 'change' : 'changes'} · Nothing has run</Text></View>
          </View>}
          {response.scene && <><Text style={styles.detail}>{response.scene.explanation}</Text><Pressable accessibilityLabel="Review suggested scene" disabled={!canReview} accessibilityState={{ disabled: !canReview }} onPress={review} style={[styles.review, !canReview && styles.disabled]}><Text style={styles.reviewText}>Review scene</Text><Ionicons name="arrow-forward" size={18} color={theme.colors.bg0} /></Pressable><Text style={styles.detail}>Adjust and save in the scene editor. Running it is a separate action.</Text></>}
        </View>}
      </ScrollView>
      <View style={styles.composer}>
        {speech.error && <Text accessibilityRole="alert" style={styles.detail}>{speech.error}</Text>}
        {speech.listening && <Text accessibilityLiveRegion="polite" style={styles.detail}>Listening… Your words fill the question. Tap Send when ready.</Text>}
        <View style={styles.inputRow}>
          <TextInput accessibilityLabel="Question for Vanta assistant" value={input} onChangeText={setInput} onFocus={() => setInputFocused(true)} placeholder="Ask about your home…" placeholderTextColor={theme.colors.muted} maxLength={600} editable={!asking && !speech.listening} returnKeyType="send" onSubmitEditing={send} style={styles.input} />
          {Platform.OS !== 'web' && <Pressable accessibilityLabel={speech.listening ? 'Finish assistant dictation' : 'Dictate assistant question'} accessibilityState={{ disabled: asking || !context.available, busy: speech.listening }} disabled={asking || !context.available} onPress={() => { Keyboard.dismiss(); if (speech.listening) speech.stop(); else void speech.start(); }} style={[styles.inputAction, speech.listening && styles.listening, (asking || !context.available) && styles.disabled]}><Ionicons name={speech.listening ? 'stop-outline' : 'mic-outline'} size={20} color={theme.colors.accentText} /></Pressable>}
          <Pressable accessibilityLabel="Send assistant question" accessibilityState={{ disabled: !canAsk || asking || speech.listening || !input.trim() }} disabled={!canAsk || asking || speech.listening || !input.trim()} onPress={send} style={[styles.inputAction, styles.send, (!canAsk || asking || speech.listening || !input.trim()) && styles.disabled]}><Ionicons name="arrow-up" size={22} color={theme.colors.bg0} /></Pressable>
        </View>
        <Text style={styles.consent}>Send shares your question, room/device names and permitted simulation settings with OpenAI. Camera feeds and account details are not added.{Platform.OS !== 'web' ? ' Dictation uses your phone’s speech service.' : ''}</Text>
      </View>
    </>}
    </View>
  </CinematicSurface>;
}
