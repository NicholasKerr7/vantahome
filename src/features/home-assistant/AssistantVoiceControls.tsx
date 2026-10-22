import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';
import type { useForegroundAssistantVoice } from '../home-voice/useForegroundAssistantVoice';
import { assistantStyles as styles } from './assistantStyles';

export type AssistantVoiceController = ReturnType<typeof useForegroundAssistantVoice>;

const STATUS = {
  off: 'Speak naturally. Review every scene.', listening: 'Listening for “Vanta”…', capturing: 'Listening to your request…',
  waiting: 'Listening paused', speaking: 'Vanta is speaking…',
};

/** Explain the foreground speech session before the user enables the microphone. */
export default function AssistantVoiceControls({ voice, available, compact = false, onStop }: { voice: AssistantVoiceController; available: boolean; compact?: boolean; onStop?: () => void }) {
  if (!voice.supported) return null;
  const active = voice.enabled || voice.phase === 'speaking';
  return <View style={styles.voiceControls}>
    <View style={styles.voiceControlRow}>
      <Ionicons name={voice.enabled ? 'radio-outline' : 'mic-outline'} size={23} color={theme.colors.accentText} />
      <View style={styles.voiceControlCopy}><Text style={styles.voiceTitle}>Hey VantaHome</Text>
        <Text accessibilityLiveRegion="polite" style={styles.detail}>{STATUS[voice.phase]}</Text></View>
      <Pressable accessibilityLabel={active ? (voice.enabled ? 'Stop hands-free listening' : 'Stop spoken reply') : 'Enable hands-free listening'}
        disabled={!active && !available} accessibilityState={{ disabled: !active && !available }}
        onPress={() => { if (active) { onStop?.(); voice.stop(); } else void voice.start(); }}
        style={[styles.voiceButton, !active && !available && styles.disabled]}><Text style={styles.inlineActionText}>{active ? 'Stop' : 'Enable'}</Text></Pressable>
    </View>
    {!compact && <Text style={styles.consent}>Say “Hey VantaHome” or “Vanta”, then your request. Listens on Home for up to 5 minutes and stops when you leave or lock your phone. Your phone’s speech service may process audio. After the wake phrase, your request is sent to OpenAI with the selected room’s permitted settings. Replies use a synthetic device voice.</Text>}
    {voice.error && <Text accessibilityRole="alert" style={styles.detail}>{voice.error}</Text>}
  </View>;
}
