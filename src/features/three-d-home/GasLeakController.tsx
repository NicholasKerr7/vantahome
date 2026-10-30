import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { GAS_LEAK_PREVIEW_NOTE, gasLeakStatus, gasLeakTestStatus, gasLeakTone, getGasLeakSnapshot } from '../../../packages/home-scene/src/gasLeakController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { GasLeakControllerArtwork } from './GasLeakControllerArtwork';
import { gasLeakControllerMaterials, gasLeakControllerStyles as styles } from './GasLeakControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; onMore: () => void;
}
interface KeyProps {
  label: string; text?: string; icon?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean; checked?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}

/** Keep command keys and saved alert switches accessible with full-size touch targets. */
function GasLeakKey({ label, text, icon, disabled = false, checked, onPress, style }: KeyProps) {
  return <Pressable accessibilityRole={checked === undefined ? 'button' : 'switch'} accessibilityLabel={label} aria-checked={checked}
    accessibilityState={{ disabled, ...(checked === undefined ? {} : { checked }) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, checked && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={18} color={theme.colors.accentText} />}{text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Present the alarm preview independently from test results and saved alert preferences. */
export function GasLeakController({ device, state, client, disabled, compact, fontScale, onMore }: Props) {
  const detector = getGasLeakSnapshot(state);
  const tone = gasLeakTone(detector);
  const [viewportHeight, setViewportHeight] = useState(0);
  const compactLayout = compact || (viewportHeight > 0 && viewportHeight < 610);
  const largeText = fontScale > 1.15;
  /** Fit decorative geometry to the available sheet while preserving control targets. */
  function measureViewport(event: LayoutChangeEvent) {
    const height = event.nativeEvent.layout.height;
    setViewportHeight((current) => current === height ? current : height);
  }
  /** Delegate to the canonical client for current permissions and linked valve effects. */
  function run(action: string) { if (!disabled) client.runAction(device.id, `gas-leak-${action}`); }
  return <ScrollView onLayout={measureViewport} testID="gas-leak-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent} bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="gas-leak-tactile-controller" colors={gasLeakControllerMaterials.edge} style={styles.shell}><LinearGradient colors={gasLeakControllerMaterials.body} style={[styles.body, compactLayout && styles.bodyCompact]}>
      <View style={styles.header}>
        <View style={styles.mark}><Ionicons accessible={false} name="shield-outline" size={24} color={theme.colors.accentText} /></View>
        <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>GAS SENTINEL</Text></View>
        <GasLeakKey label="More gas detector controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
      </View>
      <GasLeakControllerArtwork detector={detector} compact={compactLayout} />
      <View style={[styles.readout, tone === 'alarm' && styles.readoutAlarm]}>
        <Text style={styles.caption}>SAMPLE CONCENTRATION</Text>
        <Text accessibilityLabel={`Sample gas concentration: ${detector.concentration ?? 'unavailable'} percent LEL`} style={styles.quantity}>{detector.concentration ?? '—'}<Text style={styles.unit}> % LEL</Text></Text>
        <Text accessibilityLiveRegion="polite" style={[styles.status, tone === 'alarm' && styles.alarm]}>{gasLeakStatus(detector)}</Text>
      </View>
      <View style={[styles.row, largeText && styles.rowLarge]}>
        <View style={styles.metric}><Text style={styles.caption}>Sample battery</Text><Text accessibilityLabel={`Sample detector battery: ${detector.batteryPercent ?? 'unavailable'} percent`} style={styles.metricValue}>{detector.batteryPercent ?? '—'}<Text style={styles.unit}>%</Text></Text></View>
        <View style={styles.metric}><Text style={styles.caption}>Preview self-tests</Text><Text accessibilityLabel={`Preview test count: ${detector.testCount ?? 'unavailable'}`} style={styles.metricValue}>{detector.testCount ?? '—'}</Text><Text style={styles.note}>{gasLeakTestStatus(detector)}</Text></View>
      </View>
      <View style={[styles.row, largeText && styles.rowLarge]}>
        <GasLeakKey label="Run preview self-test" text="Run preview self-test" disabled={disabled || detector.testCount === null} style={[styles.keyWide, styles.primary, largeText && styles.keyLarge]} onPress={() => run('self-test')} />
        <GasLeakKey label="Silence preview alarm" text="Silence preview alarm" disabled={disabled || detector.leakDetected !== true || detector.alarmSilenced !== false} style={[styles.keyWide, largeText && styles.keyLarge]} onPress={() => run('silence')} />
      </View>
      <View style={[styles.row, largeText && styles.rowLarge]}>
        <GasLeakKey label="Simulate gas leak" text="Simulate gas leak" disabled={disabled || detector.leakDetected !== false} style={[styles.keyWide, largeText && styles.keyLarge]} onPress={() => run('simulate-leak')} />
        <GasLeakKey label="Clear leak scenario" text="Clear leak scenario" disabled={disabled || detector.leakDetected !== true} style={[styles.keyWide, largeText && styles.keyLarge]} onPress={() => run('clear-leak')} />
      </View>
      <View style={[styles.row, largeText && styles.rowLarge]}>
        {([['Leak alerts', 'gasLeakAlerts', detector.leakAlerts], ['Preview auto-shutoff', 'gasAutoShutoff', detector.autoShutoff]] as const).map(([label, field, enabled]) => <GasLeakKey key={field} label={`${label}${enabled === null ? ' unavailable' : ''}`} text={`${label} · ${enabled === null ? '—' : enabled ? 'On' : 'Off'}`} checked={enabled === true} disabled={disabled || enabled === null} style={[styles.keyWide, largeText && styles.keyLarge]} onPress={() => { if (!disabled && enabled !== null) client.setSetting(device.id, field, !enabled); }} />)}
      </View>
      <Text style={styles.feedback}>Silencing or testing does not clear a leak preview.</Text>
      <Text style={styles.feedback}>{GAS_LEAK_PREVIEW_NOTE}</Text>{disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
    </LinearGradient></LinearGradient>
  </ScrollView>;
}
