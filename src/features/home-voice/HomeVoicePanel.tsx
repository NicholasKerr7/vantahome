import React, { useCallback, useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme/theme';
import { useSimulationControls } from '../three-d-home/useSimulationControls';
import { parseHomeVoiceCommand } from './voiceCommandParser';
import { executeVoiceCommand, type VoiceCommandOutcome } from './executeVoiceCommand';
import { useVoiceRecognition } from './useVoiceRecognition';
import CinematicSurface from '../../components/CinematicSurface';
import VoiceSignal from './VoiceSignal';
import { homeVoiceStyles as styles } from './homeVoiceStyles';

/** Explain a verified local result without claiming that a safety-held command completed. */
function commandFeedback(outcome: VoiceCommandOutcome, description: string): string {
  if (outcome.status === 'reconnecting') return 'Controls are reconnecting. Close and reopen voice control.';
  if (outcome.status === 'completed') return `${description}. Simulation updated.`;
  if (outcome.status === 'pending') return 'Command started. Check device controls for movement progress.';
  const summary = `${outcome.completedCount} of ${outcome.requestedCount} devices match your command.`;
  if (!outcome.fireHeldLightCount) return `${summary} Review the device controls and try again.`;
  const lights = outcome.fireHeldLightCount === 1 ? '1 light remains' : `${outcome.fireHeldLightCount} lights remain`;
  return `${summary} ${lights} on at full brightness until the fire preview is cleared and reset.`;
}

/** A tap-to-speak simulation surface shared by the 3D home and its full device controls. */
export default function HomeVoicePanel({ onClose }: { onClose: () => void }) {
  const { client, ready, status } = useSimulationControls();
  const { height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = height - insets.top - insets.bottom < 700 || fontScale > 1.15;
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  // Keep the Run button stationary between input blur and the completing press.
  const typing = inputFocused || input.length > 0;
  const [feedback, setFeedback] = useState('Try “turn on kitchen lights” or “open primary suite blinds”.');
  /** Validate one phrase before entering the renderer-independent local control client. */
  const runCommand = useCallback((phrase: string) => {
    const result = parseHomeVoiceCommand(phrase);
    if ('error' in result) { setFeedback(result.error); return; }
    const outcome = executeVoiceCommand(client, result.command);
    setFeedback(commandFeedback(outcome, result.description));
    if (outcome.status !== 'reconnecting') setInput('');
    Keyboard.dismiss();
  }, [client]);
  const { listening, error, start, stop, cancel } = useVoiceRecognition(runCommand);
  useEffect(() => { if (!ready) cancel(); }, [ready, cancel]);
  const message = status === 'disconnected' ? 'Your account or connection changed. Close and reopen voice control.'
    : status === 'error' ? 'Changes are in this session, but could not be saved on this device.' : error ?? feedback;
  return <CinematicSurface style={[styles.card, compact && styles.compact]}>
    <View accessibilityViewIsModal style={styles.body}>
    <View style={styles.row}>
      <View style={styles.grow}><Text style={styles.eyebrow}>YOUR HOME · SIMULATION</Text><Text accessibilityRole="header" style={styles.title}>Voice control</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close voice control" onPress={() => { cancel(); onClose(); }} style={styles.button}><Text style={styles.label}>Done</Text></Pressable>
    </View>
    {!typing && !compact && <VoiceSignal listening={listening} />}
    {!typing && <Text style={styles.detail}>{compact ? 'Speak or type a room or device command.' : 'Control the house by room or device name. Voice and touch share the same saved simulation.'}</Text>}
    {Platform.OS !== 'web' && !typing && <Pressable accessibilityRole="button" accessibilityLabel={listening ? 'Finish speaking' : 'Start speaking'}
      accessibilityState={{ disabled: !ready, busy: listening }} disabled={!ready}
      onPress={() => { Keyboard.dismiss(); if (listening) stop(); else void start(); }}
      style={({ pressed }) => [styles.microphone, !ready && styles.disabled, pressed && styles.pressed]}>
      <Ionicons name={listening ? 'stop-circle-outline' : 'mic-outline'} size={24} color={theme.colors.bg0} />
      <Text style={styles.microphoneText}>{listening ? 'Listening · Tap to finish' : 'Tap to speak'}</Text>
    </Pressable>}
    <View style={styles.row}>
      <TextInput accessibilityLabel="Home voice command" placeholder="Type a command" placeholderTextColor={theme.colors.muted}
        value={input} onChangeText={setInput} onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)} maxLength={240} editable={ready && !listening} returnKeyType="send"
        onSubmitEditing={() => { if (input.trim() && ready && !listening) runCommand(input); }} style={styles.input} />
      <Pressable accessibilityRole="button" accessibilityLabel="Run typed command" disabled={!ready || listening || !input.trim()}
        onPress={() => runCommand(input)} style={[styles.button, (!ready || listening || !input.trim()) && styles.disabled]}><Text style={styles.label}>Run</Text></Pressable>
    </View>
    <View style={styles.feedback}><Text accessibilityLiveRegion="polite" style={styles.feedbackText}>{listening ? 'Say one command. Listening stops automatically after 10 seconds.' : message}</Text></View>
    {!typing && <Text style={styles.detail}>{Platform.OS === 'web' ? 'Type to try voice commands in this preview.' : compact ? 'The microphone listens only after you tap.' : 'The microphone listens only after you tap. Your phone’s speech service may require a network connection.'}</Text>}
    </View>
  </CinematicSurface>;
}
