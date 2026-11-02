import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModalCard from '../../components/ModalCard';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';
import { useHomeStore } from '../../store/useHomeStore';
import { LightingConsole } from './LightingConsole';
import type { LightingConsoleActions } from './lightingConsoleModel';
import type { LightingConnectionProfile, LightingConnectionScenario } from './lightingConnectionRehearsal';
import { canPrepareLightingConnection, lightingPreparationIdentity } from './lightingPreparationAccess';
import { useLightingConnectionRehearsal } from './useLightingConnectionRehearsal';
import { lightingConnectionPreviewStyles as styles } from './LightingConnectionPreviewStyles';

const PROFILES: readonly { value: LightingConnectionProfile; label: string }[] = [
  { value: 'switch', label: 'Power only' }, { value: 'dimmer', label: 'Dimmable' }, { value: 'color', label: 'Full color' },
];
const SCENARIOS: readonly { value: LightingConnectionScenario; label: string }[] = [
  { value: 'normal', label: 'Normal' }, { value: 'delayed', label: 'Slow reply' },
  { value: 'offline', label: 'Offline' }, { value: 'failure', label: 'Command fails' }, { value: 'stale', label: 'Stale state' },
];
const PHASE_LABELS = { idle: 'Ready to try', sending: 'Sending sample command', awaiting: 'Waiting for a sample report', confirmed: 'Sample state confirmed', failed: 'Sample command failed', interrupted: 'Preview interrupted' } as const;

/** Keep preparation visible only within its current authorized integration scope. */
export function LightingConnectionPreview({ onClose }: { onClose: () => void }) {
  const allowed = useHomeStore(canPrepareLightingConnection);
  const identity = useHomeStore(lightingPreparationIdentity);
  // Dismiss the entry as well as its session so restored permissions cannot reopen an old preview.
  useEffect(() => { if (!allowed) onClose(); }, [allowed, onClose]);
  return allowed ? <LightingConnectionSession key={identity} identity={identity} onClose={onClose} /> : null;
}

/** Exercise capability-dependent presentation without creating or modifying a household device. */
function LightingConnectionSession({ identity, onClose }: { identity: string; onClose: () => void }) {
  const { snapshot, run } = useLightingConnectionRehearsal(identity);
  const [settings, setSettings] = useState(false);
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableHeight = Math.max(240, height - insets.top - insets.bottom - 36);
  const sizing = useMemo(() => StyleSheet.create({ card: { height: Math.min(availableHeight, 850) } }), [availableHeight]);
  const compact = width < 390 || availableHeight < 760 || fontScale > 1.15;
  const actions: LightingConsoleActions = {
    toggle: () => run((connection) => connection.actions.toggle()),
    adjustBrightness: (direction) => run((connection) => connection.actions.adjustBrightness(direction)),
    setMode: (mode) => run((connection) => connection.actions.setMode(mode)),
    setTemperature: (kelvin) => run((connection) => connection.actions.setTemperature(kelvin)),
    setColor: (color) => run((connection) => connection.actions.setColor(color)),
  };
  const profile = PROFILES.find((item) => item.value === snapshot.profile)!;

  return <ModalCard visible onRequestClose={onClose} animationType="none" colors={[theme.colors.bg0, theme.colors.card]}
    cardStyle={[styles.card, sizing.card]} backdropAccessibilityLabel="Close lighting rehearsal">
    <View style={styles.header}>
      <View style={styles.heading}><Text style={styles.eyebrow}>HOME HUB / SIMULATION</Text><Text accessibilityRole="header" style={styles.title}>Try a sample light</Text></View>
      <Pressable accessibilityLabel="Close sample light" onPress={onClose} style={styles.iconButton}><Ionicons name="close" size={22} color={theme.colors.text} /></Pressable>
    </View>
    <View style={styles.status} accessibilityLiveRegion="polite" testID="lighting-connection-status">
      <Text style={styles.statusTitle}>{snapshot.scenario === 'offline' ? 'Sample device offline' : snapshot.scenario === 'stale' ? 'Sample state unavailable' : PHASE_LABELS[snapshot.phase]}</Text>
      <Text style={styles.detail}>{snapshot.detail}</Text>
    </View>
    <View style={styles.body}>
      {settings ? <>
        <ScrollView style={styles.settingsScroll} contentContainerStyle={styles.settingsContent} bounces={false} overScrollMode="never" showsVerticalScrollIndicator={false}>
          <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="Sample light type"><Text style={styles.groupTitle}>LIGHT TYPE</Text>
            <View style={styles.choices}>{PROFILES.map((item) => <Pressable key={item.value} accessibilityRole="radio" accessibilityLabel={item.label}
              accessibilityState={{ checked: snapshot.profile === item.value }} onPress={() => run((connection) => connection.setProfile(item.value))}
              style={[styles.choice, snapshot.profile === item.value && styles.choiceSelected]}><Text style={[styles.choiceLabel, snapshot.profile === item.value && styles.choiceLabelSelected]}>{item.label}</Text></Pressable>)}</View>
          </View>
          <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="Sample connection condition"><Text style={styles.groupTitle}>CONNECTION CONDITION</Text>
            <View style={styles.choices}>{SCENARIOS.map((item) => <Pressable key={item.value} accessibilityRole="radio" accessibilityLabel={item.label}
              accessibilityState={{ checked: snapshot.scenario === item.value }} onPress={() => run((connection) => connection.setScenario(item.value))}
              style={[styles.choice, snapshot.scenario === item.value && styles.choiceSelected]}><Text style={[styles.choiceLabel, snapshot.scenario === item.value && styles.choiceLabelSelected]}>{item.label}</Text></Pressable>)}</View>
          </View>
          <Text style={styles.detail}>Controls follow the selected light’s features. A sent command stays pending until a matching sample report arrives. Changing the light type or condition cancels any pending command.</Text>
          <Text style={styles.detail}>The first real-device pilot will support power only. Dimming and color are preparation examples, not connected hardware features.</Text>
        </ScrollView>
        <Pressable accessibilityLabel="Back to sample light" style={styles.returnButton} onPress={() => setSettings(false)}><Text style={styles.returnLabel}>Back to sample light</Text></Pressable>
      </> : <LightingConsole model={snapshot.model} actions={actions} disabled={!snapshot.canControl} compact={compact} fontScale={fontScale} onMore={() => setSettings(true)} />}
    </View>
    <Text style={styles.footer}>{profile.label} sample · No hub connected · Your home stays unchanged</Text>
  </ModalCard>;
}
