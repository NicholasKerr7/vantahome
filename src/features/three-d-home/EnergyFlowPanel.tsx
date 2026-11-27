import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ENERGY_DEMO_DESCRIPTION, ENERGY_SHARED_PAUSED_DESCRIPTION, energyFlowSummary, formatFlowPower, generatorPhaseLabel, storageFlowLabel, gridFlowLabel, type EnergyFlow } from '../../../packages/home-scene/src/energyFlowPresentation';
import type { EnergyRuntime } from '../../../packages/home-scene/src/energySimulation';
import { theme } from '../../theme/theme';

interface Props {
  flow: EnergyFlow | null; runtime?: EnergyRuntime | null; sharedPaused: boolean; pauseReason?: string; canManage: boolean; gridAvailable?: boolean | null;
  onEnabledChange: (enabled: boolean) => void;
}
type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Source cards use explicit flow text so color is never the sole explanation. */
function Source({ label, detail, value, icon, active }: { label: string; detail: string; value?: number; icon: IconName; active: boolean }) {
  return <View style={[styles.source, active && styles.sourceActive]}>
    <Ionicons accessible={false} name={icon} size={18} color={theme.colors.accentText} />
    <View style={styles.sourceCopy}><Text style={styles.sourceLabel}>{label}</Text><Text style={styles.detail}>{detail}</Text></View>
    <Text style={styles.power}>{formatFlowPower(value)}</Text>
  </View>;
}

/** A compact power-flow view uses shared simulation values without a renderer or animation clock. */
export function EnergyFlowPanel({ flow, runtime, sharedPaused, pauseReason = ENERGY_SHARED_PAUSED_DESCRIPTION, canManage, onEnabledChange, gridAvailable }: Props) {
  const enabled = runtime?.enabled === true;
  const action = enabled ? 'Pause energy simulation' : runtime && runtime.elapsedSeconds > 0 ? 'Resume energy simulation' : 'Start energy simulation';
  return <View accessibilityLabel="Property power flow simulation" style={styles.panel}>
    <View style={styles.heading}><Text style={styles.eyebrow}>PROPERTY POWER FLOW</Text><Text style={styles.title}>{sharedPaused ? 'Power flow paused' : flow?.sourceLabel ?? 'Your home, connected'}</Text></View>
    <View style={styles.network}>
      <View style={styles.sources}>
        <Source label="Solar" detail="Production" value={flow?.solarKw} icon="sunny-outline" active={Boolean(flow && flow.solarKw > 0)} />
        <Source label="Storage" detail={storageFlowLabel(flow)} value={flow?.batteryKw} icon="battery-charging-outline" active={Boolean(flow && Math.abs(flow.batteryKw) > 0.01)} />
        <Source label="JPS" detail={gridFlowLabel(flow, gridAvailable)} value={flow?.gridKw} icon="flash-outline" active={Boolean(flow && flow.gridKw > 0)} />
        <Source label="Generator" detail={runtime && flow ? generatorPhaseLabel(runtime) : 'Backup'} value={flow?.generatorKw} icon="power-outline" active={Boolean(flow && flow.generatorKw > 0)} />
      </View>
      <View style={[styles.home, flow && flow.homeKw > 0 ? styles.homeActive : undefined]}>
        <Ionicons accessible={false} name="home-outline" size={26} color={theme.colors.accentText} />
        <Text style={styles.homeLabel}>HOME SUPPLY</Text><Text style={styles.homePower}>{formatFlowPower(flow?.homeKw)}</Text>
        <Text style={styles.homeDetail}>{flow ? `${Math.round(flow.batteryPercent)}% stored` : 'Simulation estimates'}</Text>
      </View>
    </View>
    <Text style={styles.status}>{sharedPaused ? pauseReason : energyFlowSummary(flow, runtime ?? undefined)}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={action} accessibilityState={{ disabled: !canManage || sharedPaused }} disabled={!canManage || sharedPaused}
      onPress={() => onEnabledChange(!enabled)} style={({ pressed }) => [styles.action, (!canManage || sharedPaused) && styles.disabled, pressed && styles.pressed]}>
      <Text style={styles.actionLabel}>{action}</Text>
    </Pressable>
    <Text style={styles.disclosure}>{ENERGY_DEMO_DESCRIPTION}</Text>
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: 8 },
  heading: { gap: 4, paddingVertical: 2 },
  eyebrow: { color: theme.colors.accentText, fontSize: 8, letterSpacing: 1.4, textAlign: 'center' },
  title: { color: theme.colors.text, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  network: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  sources: { flex: 1, minWidth: 0, gap: 5 },
  source: { flexDirection: 'row', alignItems: 'center', minHeight: 43, gap: 5, padding: 6, borderRadius: 10, borderWidth: 1, borderColor: '#52405F', backgroundColor: '#181020' },
  sourceActive: { borderColor: '#9D73C1', backgroundColor: '#2B1C3B' },
  sourceCopy: { flex: 1, minWidth: 0, gap: 2 },
  sourceLabel: { color: theme.colors.text, fontSize: 10, fontWeight: '500' },
  detail: { color: theme.colors.subtext, fontSize: 8 },
  power: { color: theme.colors.text, fontSize: 10, fontVariant: ['tabular-nums'] },
  home: { width: 94, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 6, borderRadius: 22, borderWidth: 1, borderColor: '#604675', backgroundColor: '#22162F' },
  homeActive: { borderColor: '#B585DC', backgroundColor: '#352047' },
  homeLabel: { color: theme.colors.accentText, fontSize: 7, letterSpacing: 0.7, textAlign: 'center' },
  homePower: { color: theme.colors.text, fontSize: 17, fontWeight: '300', fontVariant: ['tabular-nums'], textAlign: 'center' },
  homeDetail: { color: theme.colors.subtext, fontSize: 9, textAlign: 'center' },
  status: { color: theme.colors.text, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  action: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 12, borderWidth: 1, borderColor: '#A27CC0', backgroundColor: '#55356D' },
  actionLabel: { color: theme.colors.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  disclosure: { color: theme.colors.subtext, fontSize: 9, lineHeight: 13, textAlign: 'center' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
});
