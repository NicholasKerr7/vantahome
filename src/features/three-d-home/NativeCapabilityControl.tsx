import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import { formatCapabilityValue, readDeviceSetting, type DeviceCapability } from '../../../packages/home-scene/src/deviceCapabilities';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import LabSlider from '../renderer-lab/LabSlider';
import SwitchMark from '../../components/SwitchMark';
import { switchKeyboard } from '../../components/switchKeyboard';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { controlStyles as styles } from './deviceControlsStyles';

export type EnumCapability = Extract<DeviceCapability, { type: 'enum' }>;
interface Props {
  capability: DeviceCapability; device: DeviceDefinition; state: DeviceState;
  client: SimulationDeviceControls; disabled: boolean; compact: boolean; singleColumn?: boolean;
  onOptions: (capability: EnumCapability) => void;
}

/** Render one shared catalog capability with native semantics and a bounded touch target. */
export function NativeCapabilityControl({ capability, device, state, client, disabled, compact, singleColumn = false, onOptions }: Props) {
  if (capability.type === 'action') return <Pressable accessibilityRole="button" disabled={disabled}
    accessibilityState={{ disabled }} onPress={() => client.runAction(device.id, capability.id)}
    style={({ pressed }) => [styles.action, singleColumn && styles.actionWide, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text style={styles.actionText}>{capability.label}</Text>
  </Pressable>;
  const value = readDeviceSetting(device, state, capability.field);
  const formatted = formatCapabilityValue(capability, value);
  // Larger text gets separate label/value lines; switches keep their familiar side-by-side target.
  const stacked = singleColumn && capability.type !== 'toggle';
  if (capability.type === 'enum') return <Pressable accessibilityRole="button" disabled={disabled}
    accessibilityLabel={`${capability.label}: ${formatted}. Choose option`} onPress={() => onOptions(capability)}
    style={({ pressed }) => [styles.field, compact && styles.fieldCompact, disabled && styles.disabled, pressed && styles.pressed]}>
    <View style={[styles.row, stacked && styles.stackedField]}><Text style={[styles.label, !stacked && styles.grow]}>{capability.label}</Text><Text style={styles.value}>{formatted} ›</Text></View>
  </Pressable>;
  if (capability.type === 'toggle') {
    /** Toggle only from an explicit press; one semantic row supports touch and assistive input. */
    const toggle = () => client.setSetting(device.id, capability.field, !Boolean(value));
    return <Pressable accessibilityRole="switch" accessibilityLabel={capability.label} disabled={disabled}
      accessibilityState={{ checked: Boolean(value), disabled }} aria-checked={Boolean(value)}
      onPress={toggle} {...switchKeyboard(toggle, disabled)}
      style={({ pressed }) => [styles.field, compact && styles.fieldCompact, disabled && styles.disabled, pressed && styles.pressed]}>
      <View style={styles.row}><Text style={[styles.label, styles.grow]}>{capability.label}</Text><SwitchMark checked={Boolean(value)} /></View>
    </Pressable>;
  }
  return <View style={[styles.field, compact && styles.fieldCompact]}>
    <View style={[styles.row, stacked && styles.stackedField]}>
      <Text style={[styles.label, !stacked && styles.grow]}>{capability.label}</Text>
      <Text style={styles.value}>{formatted}</Text>
    </View>
    {capability.type === 'range' && <LabSlider label={capability.label} min={capability.min} max={capability.max}
      step={capability.step ?? 1} value={Number(value)} valueText={formatted} disabled={disabled}
      onValueChange={(next) => client.setSetting(device.id, capability.field, next)} />}
  </View>;
}
