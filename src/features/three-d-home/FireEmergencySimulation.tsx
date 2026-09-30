import React, { useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { getFireIncident } from '../../../packages/home-scene/src/fireSafetySimulation';
import Pressable from '../../components/Pressable';
import { fireEmergencyStyles as styles } from './fireEmergencyStyles';

interface FireSimulationActions {
  acknowledgeFire: () => void;
  clearFireSources: () => void;
  resetFire: () => void;
}

interface Props {
  incident: ReturnType<typeof getFireIncident>;
  actions: FireSimulationActions;
  supportSummary: string;
}

/** Keep a latched simulated incident visible until its cleared sources are explicitly reset. */
export function FireEmergencySimulation({ incident, actions, supportSummary }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (!incident.active) return null;
  const visible = !incident.acknowledged || expanded;
  const sourceStatus = incident.activeSources.length ? 'Simulated smoke or CO is active' : 'Sources cleared · reset available';
  const rooms = [...new Set(incident.sources.map((source) => source.roomName))].join(', ');

  /** Acknowledge only; active sources and the persistent banner remain untouched. */
  function acknowledge() {
    actions.acknowledgeFire();
    setExpanded(false);
  }

  /** A reset is a separate deliberate action after the shared core permits it. */
  function reset() {
    if (!incident.canReset) return;
    actions.resetFire();
    setExpanded(false);
  }

  return <>
    {!visible ? <SafeAreaView edges={['top', 'left', 'right']} pointerEvents="box-none" style={styles.bannerLayer}>
      <View style={styles.banner} accessibilityLiveRegion="polite" testID="fire-simulation-banner">
        <View style={styles.bannerRow}>
          <View style={styles.bannerCopy}><Text style={styles.bannerTitle}>Emergency simulation</Text><Text style={styles.bannerDetail}>{sourceStatus}</Text><Text style={styles.bannerDetail} numberOfLines={2}>{rooms}</Text></View>
          <Pressable style={styles.reviewButton} accessibilityLabel="Review emergency simulation" onPress={() => setExpanded(true)}><Text style={styles.buttonText}>Review</Text></Pressable>
        </View>
        <Text style={styles.disclaimer}>No emergency services contacted</Text>
      </View>
    </SafeAreaView> : null}
    <Modal visible={visible} transparent animationType="none" presentationStyle="overFullScreen" onRequestClose={acknowledge}>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal testID="fire-simulation-panel">
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false} alwaysBounceVertical={false} overScrollMode="never" keyboardShouldPersistTaps="handled">
            <View style={styles.heading}>
              <Text style={styles.eyebrow}>SIMULATED SAFETY EVENT</Text>
              <Text style={styles.title} accessibilityRole="header">Emergency simulation</Text>
              <Text style={styles.disclaimer}>No emergency services contacted</Text>
              <Text style={styles.detail}>This incident changes only your local home preview.</Text>
            </View>
            <View style={styles.status} accessibilityLiveRegion="polite">
              <Text style={styles.statusHeading}>{sourceStatus}</Text>
              <Text style={styles.detail}>{incident.acknowledged ? 'Acknowledged. The incident stays visible until you clear its sources and reset it.' : 'Acknowledging keeps the incident visible in a banner. It does not clear any source.'}</Text>
            </View>
            <View style={styles.sourceList}>
              {incident.sources.map((source) => <View key={source.id} style={styles.source}>
                <Text style={styles.sourceRoom}>{source.roomName}</Text>
                <Text style={styles.sourceDetail}>{source.name} · {[source.smokeDetected ? 'simulated smoke' : '', source.coDetected ? 'simulated CO' : ''].filter(Boolean).join(' and ') || 'source cleared'}</Text>
              </View>)}
            </View>
            <Text style={styles.detail}>{supportSummary}</Text>
            <View style={styles.actions}>
              <Pressable style={[styles.button, styles.primary]} onPress={acknowledge}><Text style={[styles.buttonText, styles.primaryText]}>{incident.acknowledged ? 'Keep in banner' : 'Acknowledge simulation'}</Text></Pressable>
              <Pressable style={[styles.button, !incident.activeSources.length && styles.disabled]} disabled={!incident.activeSources.length} accessibilityState={{ disabled: !incident.activeSources.length }} onPress={() => actions.clearFireSources()}><Text style={styles.buttonText}>Clear simulated sources</Text></Pressable>
              <Pressable style={[styles.button, !incident.canReset && styles.disabled]} disabled={!incident.canReset} accessibilityState={{ disabled: !incident.canReset }} onPress={reset}><Text style={styles.buttonText}>Reset simulation incident</Text></Pressable>
              {!incident.canReset ? <Text style={styles.sourceDetail}>Clear all simulated smoke and CO sources before resetting.</Text> : null}
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  </>;
}
