import React from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { IRRIGATION_DURATION_BOUNDS, IRRIGATION_DURATION_PRESETS, IRRIGATION_ZONES, irrigationControllerActionId, readIrrigationControllerState } from '../../../packages/home-scene/src/irrigationController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { IrrigationControllerArtwork } from './IrrigationControllerArtwork';
import { irrigationControllerMaterials, irrigationControllerStyles as styles } from './IrrigationControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; motionAllowed: boolean; onMore: () => void;
}
interface KeyProps {
  label: string; text?: string; icon?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean; selected?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}

/** Give saved choices accessible radio state and preserve minimum touch targets in every layout. */
function IrrigationKey({ label, text, icon, disabled = false, selected, onPress, style }: KeyProps) {
  const choice = selected !== undefined;
  return <Pressable accessibilityRole={choice ? 'radio' : 'button'} accessibilityLabel={label}
    aria-checked={selected} accessibilityState={choice ? { checked: selected, disabled } : { disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, selected && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={20} color={theme.colors.accentText} />}
    {text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Control only the selected sprinkler; saved preferences never create a timer or change preview power. */
export function IrrigationController({ device, state, client, disabled, compact, fontScale, motionAllowed, onMore }: Props) {
  const irrigation = readIrrigationControllerState(device, state);
  const largeText = fontScale > 1.15;
  if (!irrigation) return null;
  /** Resolve each duration step in the current guarded canonical state. */
  function step(key: 'durationUp' | 'durationDown') { if (!disabled) client.runAction(device.id, irrigationControllerActionId(key)); }
  /** Save one validated preference without changing power or any other setting. */
  function choose(field: 'durationMin' | 'zone', value: number | string) { if (!disabled) client.setSetting(device.id, field, value); }
  const reading = <View style={[styles.reading, largeText && styles.readingLarge]}>
    <Text style={styles.caption}>DURATION PREFERENCE</Text>
    <Text accessibilityLabel={irrigation.durationMin === null ? 'Saved irrigation duration unavailable' : `Saved irrigation duration: ${irrigation.durationMin} minutes`} style={styles.value}>{irrigation.durationMin ?? '—'} min</Text>
  </View>;
  return <ScrollView testID="irrigation-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="irrigation-tactile-controller" colors={irrigationControllerMaterials.edge} style={styles.shell}>
      <LinearGradient colors={irrigationControllerMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.header}>
          <View style={styles.mark}><Ionicons accessible={false} name="leaf-outline" size={24} color={theme.colors.accentText} /></View>
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>IRRIGATION</Text></View>
          <IrrigationKey label="More irrigation controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <View style={styles.hero}><IrrigationControllerArtwork on={irrigation.on} compact={compact} motionAllowed={motionAllowed} />
          <Text accessibilityLiveRegion="polite" style={styles.status}>{irrigation.status}</Text>
        </View>
        <View style={styles.section}><Text style={styles.caption}>ZONE PREFERENCE</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Irrigation zone preference" style={[styles.row, largeText && styles.rowLarge]}>
            {IRRIGATION_ZONES.map((zone) => <IrrigationKey key={zone.value} label={`Zone preference: ${zone.label}`} text={zone.label} selected={irrigation.zone === zone.value}
              disabled={disabled} onPress={() => choose('zone', zone.value)} style={[styles.keyWide, largeText && styles.keyLarge]} />)}
          </View>
        </View>
        <View role="group" accessibilityLabel="Saved duration, steps of 5 minutes" style={[styles.duration, largeText && styles.durationLarge]}>
          {largeText && reading}
          <IrrigationKey label="Decrease irrigation duration" icon="remove" disabled={disabled || irrigation.durationMin === null || irrigation.durationMin <= IRRIGATION_DURATION_BOUNDS.min} onPress={() => step('durationDown')} style={styles.keyCircle} />
          {!largeText && reading}
          <IrrigationKey label="Increase irrigation duration" icon="add" disabled={disabled || irrigation.durationMin === null || irrigation.durationMin >= IRRIGATION_DURATION_BOUNDS.max} onPress={() => step('durationUp')} style={styles.keyCircle} />
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Irrigation duration presets" style={[styles.row, largeText && styles.rowLarge]}>
          {IRRIGATION_DURATION_PRESETS.map((preset) => <IrrigationKey key={preset.value} label={`Save irrigation duration ${preset.label}`} text={preset.label} selected={irrigation.durationMin === preset.value}
            disabled={disabled} onPress={() => choose('durationMin', preset.value)} style={[styles.keyWide, largeText && styles.keyLarge]} />)}
        </View>
        <IrrigationKey label={irrigation.on ? 'Stop irrigation simulation' : 'Start irrigation simulation'} text={irrigation.on ? 'Stop simulation' : 'Start simulation'} icon={irrigation.on ? 'power' : 'water-outline'} disabled={disabled}
          onPress={() => { if (!disabled) client.toggle(device.id); }} style={styles.keyPrimary} />
        <Text style={styles.feedback}>Simulation · Zone and duration save only.{ '\n' }Stop ends the preview.</Text>
      </LinearGradient>
    </LinearGradient>
  </ScrollView>;
}
