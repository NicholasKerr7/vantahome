import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ENERGY_DEMO_DESCRIPTION, ENERGY_SHARED_PAUSED_DESCRIPTION, formatFlowPower, generatorPhaseLabel, storageFlowLabel, gridFlowLabel, type EnergyFlow } from '../../../packages/home-scene/src/energyFlowPresentation';
import { describeEnergyFlow, sourceFlowDirection, type EnergySourceId } from '../../../packages/home-scene/src/energyFlowInsights';
import type { EnergyRuntime } from '../../../packages/home-scene/src/energySimulation';
import { EnergyFlowArtwork } from './EnergyFlowArtwork';
import { energyFlowStyles as styles } from './EnergyFlowStyles';
import { theme } from '../../theme/theme';

interface Props {
  flow: EnergyFlow | null; runtime?: EnergyRuntime | null; sharedPaused: boolean; pauseReason?: string; canManage: boolean; gridAvailable?: boolean | null;
  compact?: boolean; motionAllowed?: boolean; onEnabledChange: (enabled: boolean) => void;
}
type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface SourceProps {
  label: string; detail: string; value?: number; icon: IconName; active: boolean; selected: boolean; onPress: () => void;
}

/** Inspect a source without sending a device command; words supplement the illuminated connection. */
function Source({ label, detail, value, icon, active, selected, onPress }: SourceProps) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${formatFlowPower(value)}. ${detail}. Show source details`}
    accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [styles.source, active && styles.sourceActive, selected && styles.sourceSelected, pressed && styles.pressed]}>
    <Ionicons accessible={false} name={icon} size={17} color={active ? theme.colors.accentText : theme.colors.subtext} />
    <View style={styles.sourceCopy}><View style={styles.sourceTop}><Text style={styles.sourceLabel}>{label}</Text><Text style={styles.power}>{formatFlowPower(value)}</Text></View>
      <Text style={styles.detail}>{detail}</Text></View>
  </Pressable>;
}

/** Explain current power through one bounded diagram and read-only source inspection. */
export function EnergyFlowPanel({ flow, runtime, sharedPaused, pauseReason = ENERGY_SHARED_PAUSED_DESCRIPTION, canManage, onEnabledChange, gridAvailable, compact = false, motionAllowed = true }: Props) {
  const [selected, setSelected] = useState<EnergySourceId | null>(null);
  const enabled = runtime?.enabled === true;
  const insight = !flow && !runtime && canManage && !sharedPaused
    ? { title: 'Ready when you are', body: 'Start the simulation to see solar, storage and backup serve the property.', tone: 'calm', waitingNames: [] }
    : describeEnergyFlow(flow, runtime, selected);
  const action = enabled ? 'Pause energy simulation' : runtime && runtime.elapsedSeconds > 0 ? 'Resume energy simulation' : 'Start energy simulation';
  /** Tapping the highlighted source returns to the whole-property explanation. */
  function inspect(source: EnergySourceId): void { setSelected((current) => current === source ? null : source); }
  return <View accessibilityLabel="Property power flow simulation" style={styles.panel}>
    <View style={styles.heading}><Text style={styles.eyebrow}>PROPERTY POWER FLOW</Text><Text style={styles.title}>{sharedPaused ? 'Power flow paused' : runtime && !enabled ? 'Simulation paused' : flow?.sourceLabel ?? 'Your home, connected'}</Text></View>
    <View style={styles.stage}>
      <EnergyFlowArtwork flow={flow} selected={selected} compact={compact} motionAllowed={enabled && motionAllowed && !sharedPaused} />
      <View accessible accessibilityLabel={`Home supply: ${formatFlowPower(flow?.homeKw)}. ${flow ? `${Math.round(flow.batteryPercent)} percent stored` : 'Simulation estimates unavailable'}`} style={styles.home}>
        <View style={styles.homeReading}><Text style={styles.homeLabel}>HOME SUPPLY</Text><Text style={styles.homePower}>{formatFlowPower(flow?.homeKw)}</Text></View>
        <Text style={styles.homeDetail}>{flow ? `${Math.round(flow.batteryPercent)}% stored` : 'Simulation estimates'}</Text>
      </View>
    </View>
    <View style={styles.sourceRow}>
      <Source label="Solar" detail="Production" value={flow?.solarKw} icon="sunny-outline" active={sourceFlowDirection(flow, 'solar') !== 'idle'} selected={selected === 'solar'} onPress={() => inspect('solar')} />
      <Source label="JPS" detail={gridFlowLabel(flow, gridAvailable)} value={flow?.gridKw} icon="flash-outline" active={sourceFlowDirection(flow, 'grid') !== 'idle'} selected={selected === 'grid'} onPress={() => inspect('grid')} />
    </View>
    <View style={styles.sourceRow}>
      <Source label="Storage" detail={storageFlowLabel(flow)} value={flow?.batteryKw} icon="battery-charging-outline" active={sourceFlowDirection(flow, 'battery') !== 'idle'} selected={selected === 'battery'} onPress={() => inspect('battery')} />
      <Source label="Generator" detail={runtime && flow ? generatorPhaseLabel(runtime) : 'Backup'} value={flow?.generatorKw} icon="power-outline" active={sourceFlowDirection(flow, 'generator') !== 'idle'} selected={selected === 'generator'} onPress={() => inspect('generator')} />
    </View>
    <View style={[styles.insight, !sharedPaused && insight.tone === 'attention' && styles.insightAttention]}>
      <Text style={styles.insightTitle}>{sharedPaused ? 'Power flow is paused' : insight.title}</Text>
      <Text style={styles.insightBody} accessibilityLabel={insight.waitingNames.length ? `Waiting: ${insight.waitingNames.join(', ')}. ${insight.body}` : undefined}>{sharedPaused ? pauseReason : insight.body}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={action} accessibilityState={{ disabled: !canManage || sharedPaused }} disabled={!canManage || sharedPaused}
      onPress={() => onEnabledChange(!enabled)} style={({ pressed }) => [styles.action, (!canManage || sharedPaused) && styles.disabled, pressed && styles.pressed]}>
      <Text style={styles.actionLabel}>{action}</Text>
    </Pressable>
    <Text style={styles.disclosure}>{ENERGY_DEMO_DESCRIPTION}</Text>
  </View>;
}
