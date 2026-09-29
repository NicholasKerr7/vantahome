import React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import { formatCapabilityValue, readDeviceSetting, type DeviceCapability } from '../../../packages/home-scene/src/deviceCapabilities';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import LabSlider from '../renderer-lab/LabSlider';
import { labColors } from '../renderer-lab/styles';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { controlStyles as styles } from './deviceControlsStyles';

export type EnumCapability = Extract<DeviceCapability, { type: 'enum' }>;
interface Props {
  capability: DeviceCapability; device: DeviceDefinition; state: DeviceState;
  client: SimulationDeviceControls; disabled: boolean; compact: boolean;
  onOptions: (capability: EnumCapability) => void;
}

/** Render one shared catalog capability with native semantics and a bounded touch target. */
export function NativeCapabilityControl({ capability, device, state, client, disabled, compact, onOptions }: Props) {
  if (capability.type === 'action') return <Pressable accessibilityRole="button" disabled={disabled}
    accessibilityState={{ disabled }} onPress={() => client.runAction(device.id, capability.id)}
    style={({ pressed }) => [styles.action, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text style={styles.actionText}>{capability.label}</Text>
  </Pressable>;
  const value = readDeviceSetting(device, state, capability.field);
  const formatted = formatCapabilityValue(capability, value);
  if (capability.type === 'enum') return <Pressable accessibilityRole="button" disabled={disabled}
    accessibilityLabel={`${capability.label}: ${formatted}. Choose option`} onPress={() => onOptions(capability)}
    style={({ pressed }) => [styles.field, compact && styles.fieldCompact, disabled && styles.disabled, pressed && styles.pressed]}>
    <View style={styles.row}><Text style={[styles.label, styles.grow]}>{capability.label}</Text><Text style={styles.value}>{formatted} ›</Text></View>
  </Pressable>;
  return <View style={[styles.field, compact && styles.fieldCompact]}>
    <View style={styles.row}>
      <Text style={[styles.label, styles.grow]}>{capability.label}</Text>
      {capability.type === 'toggle' ? <Switch accessibilityLabel={capability.label} disabled={disabled} value={Boolean(value)}
        trackColor={{ false: labColors.stroke, true: labColors.sage }} thumbColor={labColors.text}
        onValueChange={(next) => client.setSetting(device.id, capability.field, next)} />
        : <Text style={styles.value}>{formatted}</Text>}
    </View>
    {capability.type === 'range' && <LabSlider label={capability.label} min={capability.min} max={capability.max}
      step={capability.step ?? 1} value={Number(value)} valueText={formatted} disabled={disabled}
      onValueChange={(next) => client.setSetting(device.id, capability.field, next)} />}
  </View>;
}
