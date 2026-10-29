import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { MICROWAVE_MODES, MICROWAVE_POWER_BOUNDS, MICROWAVE_PREVIEW_NOTE, MICROWAVE_QUICK_TIMES, readMicrowaveControllerState } from '../../../packages/home-scene/src/microwaveController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { MicrowaveControllerArtwork } from './MicrowaveControllerArtwork';
import { microwaveControllerMaterials, microwaveControllerStyles as styles } from './MicrowaveControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; onMore: () => void;
}
interface KeyProps {
  label: string; text?: string; icon?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean; selected?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}

/** Give every physical-looking key an independent accessible action and a full touch target. */
function MicrowaveKey({ label, text, icon, disabled = false, selected, onPress, style }: KeyProps) {
  const choice = selected !== undefined;
  return <Pressable accessibilityRole={choice ? 'radio' : 'button'} accessibilityLabel={label} aria-checked={selected}
    accessibilityState={choice ? { checked: selected, disabled } : { disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, selected && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={18} color={theme.colors.accentText} />}{text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Present the existing fixed-duration preview without a countdown, heat claim or autonomous completion. */
export function MicrowaveController({ device, state, client, disabled, compact, fontScale, onMore }: Props) {
  const microwave = readMicrowaveControllerState(device, state);
  const [viewportHeight, setViewportHeight] = useState(0);
  const compactLayout = compact || (viewportHeight > 0 && viewportHeight < 590);
  const largeText = fontScale > 1.15;
  /** Fit the illustration to actual remaining sheet height while protecting controls. */
  function measureViewport(event: LayoutChangeEvent) {
    const height = event.nativeEvent.layout.height;
    setViewportHeight((current) => current === height ? current : height);
  }
  /** Guard presentation callbacks; the canonical client also rechecks permissions and current values. */
  function run(action: string) { if (!disabled) client.runAction(device.id, action); }
  if (!microwave) return null;
  return <ScrollView onLayout={measureViewport} testID="microwave-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent} bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="microwave-tactile-controller" colors={microwaveControllerMaterials.edge} style={styles.shell}><LinearGradient colors={microwaveControllerMaterials.body} style={[styles.body, compactLayout && styles.bodyCompact]}>
      <View style={styles.header}>
        <View style={styles.mark}><Ionicons accessible={false} name="scan-outline" size={24} color={theme.colors.accentText} /></View>
        <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>MICROWAVE</Text></View>
        <MicrowaveKey label="More microwave controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
      </View>
      <MicrowaveControllerArtwork on={microwave.on} compact={compactLayout} />
      <View style={[styles.readout, largeText && styles.readoutLarge]}>
        <View><Text style={styles.caption}>SET DURATION</Text><Text accessibilityLabel={microwave.seconds === null ? 'Microwave duration unavailable' : `Saved microwave duration: ${microwave.seconds} seconds`} style={styles.duration}>{microwave.duration}</Text></View>
        <View style={styles.readoutNote}><Text accessibilityLiveRegion="polite" style={styles.status}>{microwave.status}</Text><Text style={styles.note}>No countdown in this preview</Text></View>
      </View>
      <View style={styles.section}><Text style={styles.caption}>MODE PREFERENCE</Text><View accessibilityRole="radiogroup" accessibilityLabel="Microwave mode preference" style={[styles.row, largeText && styles.rowLarge]}>
        {MICROWAVE_MODES.map((mode) => <MicrowaveKey key={mode} label={`Microwave mode: ${mode}`} text={mode} selected={microwave.mode === mode} disabled={disabled}
          onPress={() => { if (!disabled) client.setSetting(device.id, 'microwaveMode', mode); }} style={[styles.keyWide, largeText && styles.keyLarge]} />)}
      </View></View>
      <View style={[styles.power, largeText && styles.powerLarge]}><View style={styles.powerLabel}><Text style={styles.caption}>POWER LEVEL</Text><Text style={styles.note}>Saved preference</Text></View><View style={styles.stepper}>
        <MicrowaveKey label="Decrease microwave power" icon="remove" disabled={disabled || microwave.power === null || microwave.power <= MICROWAVE_POWER_BOUNDS.min} onPress={() => run('microwave-power-down')} style={styles.keyStep} />
        <Text accessibilityLabel={microwave.power === null ? 'Microwave power unavailable' : `Saved microwave power: ${microwave.power} of 10`} style={styles.powerValue}>{microwave.power ?? '—'}<Text style={styles.powerUnit}>/10</Text></Text>
        <MicrowaveKey label="Increase microwave power" icon="add" disabled={disabled || microwave.power === null || microwave.power >= MICROWAVE_POWER_BOUNDS.max} onPress={() => run('microwave-power-up')} style={styles.keyStep} />
      </View></View>
      <View style={styles.section}><Text style={styles.caption}>{microwave.on ? 'ADD PREVIEW TIME' : 'ADD TIME & START PREVIEW'}</Text><View style={[styles.row, largeText && styles.rowLarge]}>
        {MICROWAVE_QUICK_TIMES.map((seconds) => <MicrowaveKey key={seconds} label={`Add ${seconds} seconds and start microwave preview`} text={`+${seconds < 60 ? `${seconds}s` : `${seconds / 60} min`}`} disabled={disabled || microwave.seconds === null || microwave.seconds >= 900}
          onPress={() => run(`microwave-add-${seconds}`)} style={[styles.keyWide, largeText && styles.keyLarge]} />)}
      </View></View>
      <View style={[styles.row, largeText && styles.rowLarge]}>
        <MicrowaveKey label="Start 1 minute microwave preview" text="Start 1 min" icon="play-outline" disabled={disabled} style={[styles.keyWide, styles.primary, largeText && styles.keyLarge]} onPress={() => run('microwave-start')} />
        <MicrowaveKey label="Stop and clear microwave preview" text="Stop & clear" icon="stop-outline" disabled={disabled} style={[styles.keyWide, styles.action, largeText && styles.keyLarge]} onPress={() => run('microwave-stop')} />
      </View>
      <Text style={styles.feedback}>{MICROWAVE_PREVIEW_NOTE}</Text>{disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
    </LinearGradient></LinearGradient>
  </ScrollView>;
}
