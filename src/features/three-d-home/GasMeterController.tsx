import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { canSampleGas, formatGasSample, GAS_METER_PREVIEW_NOTE, gasMeterStatus, getGasMeterSnapshot } from '../../../packages/home-scene/src/gasMeterController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { GasMeterControllerArtwork } from './GasMeterControllerArtwork';
import { gasMeterControllerMaterials, gasMeterControllerStyles as styles } from './GasMeterControllerStyles';
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
function GasMeterKey({ label, text, icon, disabled = false, checked, onPress, style }: KeyProps) {
  return <Pressable accessibilityRole={checked === undefined ? 'button' : 'switch'} accessibilityLabel={label} aria-checked={checked}
    accessibilityState={{ disabled, ...(checked === undefined ? {} : { checked }) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, checked && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={18} color={theme.colors.accentText} />}{text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Mirror the canonical gas scenario without pretending a valve command is physical protection. */
export function GasMeterController({ device, state, client, disabled, compact, fontScale, onMore }: Props) {
  const meter = getGasMeterSnapshot(state);
  const [viewportHeight, setViewportHeight] = useState(0);
  const compactLayout = compact || (viewportHeight > 0 && viewportHeight < 565);
  const largeText = fontScale > 1.15;
  /** Shrink decorative geometry first when app chrome leaves a short controller viewport. */
  function measureViewport(event: LayoutChangeEvent) {
    const height = event.nativeEvent.layout.height;
    setViewportHeight((current) => current === height ? current : height);
  }
  /** Delegate to the canonical client, which rechecks access and linked scenario state. */
  function run(action: string) { if (!disabled) client.runAction(device.id, `gas-meter-${action}`); }
  return <ScrollView onLayout={measureViewport} testID="gas-meter-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent} bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="gas-meter-tactile-controller" colors={gasMeterControllerMaterials.edge} style={styles.shell}><LinearGradient colors={gasMeterControllerMaterials.body} style={[styles.body, compactLayout && styles.bodyCompact]}>
      <View style={styles.header}>
        <View style={styles.mark}><Ionicons accessible={false} name="flame-outline" size={24} color={theme.colors.accentText} /></View>
        <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>GAS SUPPLY</Text></View>
        <GasMeterKey label="More gas meter controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
      </View>
      <GasMeterControllerArtwork meter={meter} compact={compactLayout} />
      <View style={[styles.readout, largeText && styles.readoutLarge]}>
        <View><Text style={styles.caption}>DEMO LPG REMAINING</Text><Text accessibilityLabel={`Demo gas remaining: ${formatGasSample(meter.remainingKg)} kg`} style={styles.quantity}>{formatGasSample(meter.remainingKg)}<Text style={styles.unit}> kg</Text></Text></View>
        <View style={styles.capacity}><Text style={styles.percent}>{meter.remainingPercent ?? '—'}%</Text><Text style={styles.note}>of 12.5 kg supply</Text></View>
      </View>
      <Text accessibilityLiveRegion="polite" style={[styles.status, meter.interlocked === true && styles.alarm]}>{gasMeterStatus(meter)}</Text>
      <View style={[styles.row, largeText && styles.rowLarge]}>
        {([['Today', meter.todayKg, 'kg'], ['This month', meter.monthKg, 'kg'], ['Last sample flow', meter.flowKgH, 'kg/h']] as const).map(([label, value, unit]) => <View key={label} style={styles.metric}><Text style={styles.caption}>{label}</Text><Text accessibilityLabel={`${label} sample: ${formatGasSample(value)} ${unit}`} style={styles.metricValue}>{formatGasSample(value)}<Text style={styles.unit}> {unit}</Text></Text></View>)}
      </View>
      <View style={[styles.row, largeText && styles.rowLarge]}>
        <GasMeterKey label="Open preview valve" text="Open preview valve" disabled={disabled || meter.valveOpen !== false || meter.interlocked !== false} style={[styles.keyWide, largeText && styles.keyLarge]} onPress={() => run('open-valve')} />
        <GasMeterKey label="Close preview valve" text="Close preview valve" disabled={disabled || meter.valveOpen !== true} style={[styles.keyWide, largeText && styles.keyLarge]} onPress={() => run('close-valve')} />
      </View>
      <View style={[styles.row, largeText && styles.rowLarge]}>
        <GasMeterKey label="Simulate 30m usage" text="Simulate 30m usage" disabled={disabled || !canSampleGas(meter)} style={[styles.keyWide, styles.primary, largeText && styles.keyLarge]} onPress={() => run('use-sample')} />
        <GasMeterKey label="Refill demo supply" text="Refill demo supply" disabled={disabled} style={[styles.keyWide, largeText && styles.keyLarge]} onPress={() => run('refill')} />
      </View>
      <View style={[styles.row, largeText && styles.rowLarge]}>
        {([['Usage alerts', 'gasUsageAlerts', meter.usageAlerts], ['Refill alerts', 'gasRefillAlerts', meter.refillAlerts]] as const).map(([label, field, enabled]) => <GasMeterKey key={field} label={`${label}${enabled === null ? ' unavailable' : ''}`} text={`${label} · ${enabled === null ? '—' : enabled ? 'On' : 'Off'}`} checked={enabled === true} disabled={disabled || enabled === null} style={[styles.keyWide, largeText && styles.keyLarge]} onPress={() => { if (!disabled && enabled !== null) client.setSetting(device.id, field, !enabled); }} />)}
      </View>
      <Text style={styles.feedback}>{GAS_METER_PREVIEW_NOTE}</Text>{disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
    </LinearGradient></LinearGradient>
  </ScrollView>;
}
