import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { readSmokeControllerState, smokeSampleLabel, SMOKE_PREVIEW_NOTE } from '../../../packages/home-scene/src/smokeController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { SmokeControllerArtwork } from './SmokeControllerArtwork';
import { smokeControllerMaterials, smokeControllerStyles as styles } from './SmokeControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; scenariosAllowed: boolean; compact: boolean; fontScale: number; onMore: () => void;
}
interface KeyProps {
  label: string; text?: string; icon?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}

/** Preserve full-size accessible targets for explicit sample and incident commands. */
function SmokeKey({ label, text, icon, disabled = false, onPress, style }: KeyProps) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={18} color={theme.colors.accentText} />}{text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Present the selected sensor while leaving whole-incident reset and gate release to existing controls. */
export function SmokeController({ device, state, client, disabled, scenariosAllowed, compact, fontScale, onMore }: Props) {
  const detector = readSmokeControllerState(device, state);
  const [viewportHeight, setViewportHeight] = useState(0);
  const compactLayout = compact || (viewportHeight > 0 && viewportHeight < 640);
  const artworkSize = compact ? 'compact' : viewportHeight === 0 || viewportHeight >= 640 ? 'full' : viewportHeight >= 590 ? 'medium' : 'compact';
  const largeText = fontScale > 1.15;
  /** Shrink decorative geometry before control targets when actual sheet space is constrained. */
  function measureViewport(event: LayoutChangeEvent) {
    const height = event.nativeEvent.layout.height;
    setViewportHeight((current) => current === height ? current : height);
  }
  /** The client rechecks grants and rejects unauthorized collateral changes before publishing. */
  function run(action: string) {
    if (disabled || ((action === 'test-alarm' || action === 'simulate-co') && !scenariosAllowed)) return;
    client.runAction(device.id, `smoke-${action}`);
  }
  if (!detector) return null;
  const active = detector.incidentActive === true || detector.smokeDetected === true || detector.coDetected === true;
  const detail = active ? `${detector.silenced === null ? 'Silence unavailable' : detector.silenced ? 'Preview silenced' : 'Preview not silenced'} · ${detector.acknowledged === null ? 'Acknowledgment unavailable' : detector.acknowledged ? 'Acknowledged' : 'Not acknowledged'}`
    : detector.sampleChecked === null ? 'Sample check unavailable' : detector.sampleChecked ? 'Sample checked · no physical test' : 'Sample check not run';
  return <ScrollView onLayout={measureViewport} testID="smoke-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent} bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="smoke-tactile-controller" colors={smokeControllerMaterials.edge} style={styles.shell}><LinearGradient colors={smokeControllerMaterials.body} style={[styles.body, compactLayout && styles.bodyCompact]}>
      <View style={styles.header}>
        <View style={styles.mark}><Ionicons accessible={false} name="shield-checkmark-outline" size={24} color={theme.colors.accentText} /></View>
        <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>SMOKE + CO</Text></View>
        <SmokeKey label="More smoke detector controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
      </View>
      <SmokeControllerArtwork tone={detector.tone} size={artworkSize} />
      <View style={[styles.readout, detector.tone === 'alarm' && styles.readoutAlarm, detector.tone === 'warning' && styles.readoutWarning]}>
        <Text style={styles.caption}>SENSOR PREVIEW</Text>
        <Text accessibilityLiveRegion="polite" style={[styles.status, detector.tone === 'alarm' && styles.alarm]}>{detector.status}</Text>
        <Text style={styles.note}>{detail}</Text>
      </View>
      <View style={[styles.row, largeText && styles.rowLarge]}>
        <View style={styles.sample}><Text style={styles.caption}>SMOKE SAMPLE</Text><Text accessibilityLabel={`Smoke sample: ${smokeSampleLabel(detector.smokeDetected)}`} style={styles.sampleValue}>{smokeSampleLabel(detector.smokeDetected)}</Text></View>
        <View style={styles.sample}><Text style={styles.caption}>CO SAMPLE</Text><Text accessibilityLabel={`CO sample: ${smokeSampleLabel(detector.coDetected)}`} style={styles.sampleValue}>{smokeSampleLabel(detector.coDetected)}</Text></View>
      </View>
      <View style={[styles.meta, largeText && styles.rowLarge]}><Text style={styles.note}>Sample battery {detector.batteryPercent ?? '—'}%</Text><Text style={styles.note}>Condition {detector.sensorStatus ?? 'Unavailable'}</Text></View>
      <View style={[styles.row, largeText && styles.rowLarge]}>
        <SmokeKey label="Check sample" text="Check sample" disabled={disabled} style={[styles.keyWide, styles.primary, largeText && styles.keyLarge]} onPress={() => { if (!disabled) client.toggle(device.id); }} />
        <SmokeKey label="Silence preview" text="Silence preview" disabled={disabled || !active || detector.silenced !== false} style={[styles.keyWide, largeText && styles.keyLarge]} onPress={() => run('silence')} />
      </View>
      <View style={[styles.row, largeText && styles.rowLarge]}>
        <SmokeKey label="Simulate smoke" text="Simulate smoke" disabled={disabled || !scenariosAllowed || detector.smokeDetected !== false} style={[styles.keyWide, largeText && styles.keyLarge]} onPress={() => run('test-alarm')} />
        <SmokeKey label="Simulate CO" text="Simulate CO" disabled={disabled || !scenariosAllowed || detector.coDetected !== false} style={[styles.keyWide, largeText && styles.keyLarge]} onPress={() => run('simulate-co')} />
      </View>
      <View style={[styles.row, largeText && styles.rowLarge]}>
        <SmokeKey label="Acknowledge sensor" text="Acknowledge sensor" disabled={disabled || !active || detector.acknowledged !== false} style={[styles.keyWide, largeText && styles.keyLarge]} onPress={() => run('acknowledge')} />
        <SmokeKey label="Clear this sensor" text="Clear this sensor" disabled={disabled || (detector.smokeDetected !== true && detector.coDetected !== true)} style={[styles.keyWide, largeText && styles.keyLarge]} onPress={() => run('clear-alarm')} />
      </View>
      <Text style={styles.feedback}>{scenariosAllowed ? 'Scenarios affect preview lights and gate. Clear sources, then reset under More.' : 'Alarm scenarios require access to the affected lights and gate. Incident controls remain under More.'}</Text>
      <Text style={styles.feedback}>{SMOKE_PREVIEW_NOTE}</Text>{disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
    </LinearGradient></LinearGradient>
  </ScrollView>;
}
