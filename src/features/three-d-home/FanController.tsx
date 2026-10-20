import React from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import {
  FAN_DIRECTION_OPTIONS, FAN_SPEED_BOUNDS, FAN_SPEED_PRESETS, fanControllerActionId, readFanControllerState,
} from '../../../packages/home-scene/src/fanController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { FanControllerArtwork } from './FanControllerArtwork';
import { fanControllerMaterials, fanControllerStyles as styles } from './FanControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; motionAllowed: boolean; onMore: () => void;
}
type FanAction = Parameters<typeof fanControllerActionId>[0];
type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface KeyProps {
  label: string; text?: string; detail?: string; icon?: IconName; disabled?: boolean; active?: boolean;
  role?: 'button' | 'switch' | 'radio'; onPress: () => void; style?: StyleProp<ViewStyle>;
}

/** Tactile keys expose accepted switch/radio values and retain full touch targets at every size. */
function FanKey({ label, text, detail, icon, disabled = false, active = false, role = 'button', onPress, style }: KeyProps) {
  const choice = role !== 'button';
  return <Pressable accessibilityRole={role} accessibilityLabel={label}
    aria-checked={choice ? active : undefined} accessibilityState={choice ? { disabled, checked: active } : { disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, active && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={20} color={active ? theme.colors.accentText : theme.colors.text} />}
    {text && <Text style={styles.keyLabel}>{text}</Text>}
    {detail && <Text style={styles.keyDetail}>{detail}</Text>}
  </Pressable>;
}

/** Saved speed remains distinct from effective Sleep-limited output; only power toggles power. */
export function FanController({ device, state, client, disabled, compact, fontScale, motionAllowed, onMore }: Props) {
  const fan = readFanControllerState(device, state);
  const largeText = fontScale > 1.15;
  if (!fan) return null;

  /** Resolve relative steps against canonical state so rapid presses cannot overwrite one another. */
  function run(action: FanAction): void { if (!disabled) client.runAction(device.id, fanControllerActionId(action)); }

  /** Save only the selected setting, preserving power, direction, Sleep and other unrelated fields. */
  function choose(field: 'speed' | 'fanDirection' | 'fanSleepMode', value: string | number | boolean): void {
    if (!disabled) client.setSetting(device.id, field, value);
  }

  const speedReading = <View style={[styles.reading, largeText && styles.readingLarge]}>
    <Text style={styles.caption}>SAVED SPEED</Text><Text accessibilityLabel={`Saved fan speed: ${fan.speed}%`}
      accessibilityLiveRegion="polite" style={styles.speedValue}>{fan.speed}%</Text>
  </View>;

  return <ScrollView testID="fan-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="fan-tactile-controller" colors={fanControllerMaterials.edge} style={[styles.shell, compact && styles.shellCompact]}>
      <LinearGradient colors={fanControllerMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.header}>
          <FanKey label="Fan power" icon="power" role="switch" active={fan.on} disabled={disabled}
            onPress={() => { if (!disabled) client.toggle(device.id); }} style={styles.keyCircle} />
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>AIRFLOW</Text></View>
          <FanKey label="More fan controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <View style={styles.hero}>
          <FanControllerArtwork velocity={fan.velocity} compact={compact} motionAllowed={motionAllowed} />
          <Text accessibilityLiveRegion="polite" style={styles.status}>{fan.status} · {fan.effectiveSpeed}% effective</Text>
        </View>
        <View role="group" accessibilityLabel="Fan speed, steps of 10 percent" style={[styles.speed, largeText && styles.speedLarge]}>
          {largeText && speedReading}
          <FanKey label="Decrease fan speed" icon="remove" disabled={disabled || fan.speed <= FAN_SPEED_BOUNDS.min}
            onPress={() => run('speedDown')} style={styles.keyCircle} />
          {!largeText && speedReading}
          <FanKey label="Increase fan speed" icon="add" disabled={disabled || fan.speed >= FAN_SPEED_BOUNDS.max}
            onPress={() => run('speedUp')} style={styles.keyCircle} />
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Fan speed presets" style={[styles.row, largeText && styles.rowLarge]}>
          {FAN_SPEED_PRESETS.map((preset) => <FanKey key={preset.value} label={`${preset.label} fan speed: ${preset.value}%`}
            text={preset.label} detail={`${preset.value}%`} role="radio" active={fan.speed === preset.value} disabled={disabled}
            onPress={() => choose('speed', preset.value)} style={[styles.keyWide, largeText && styles.keyLarge]} />)}
        </View>
        <View style={styles.section}>
          <Text style={styles.caption}>DIRECTION</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Fan direction" style={[styles.row, largeText && styles.rowLarge]}>
            {FAN_DIRECTION_OPTIONS.map((option) => <FanKey key={option.value} label={`Fan direction: ${option.label}`} text={option.label}
              role="radio" active={fan.direction === option.value} disabled={disabled} onPress={() => choose('fanDirection', option.value)}
              style={[styles.keyWide, largeText && styles.keyLarge]} />)}
          </View>
        </View>
        <Pressable accessibilityRole="switch" accessibilityLabel="Fan Sleep speed limit" aria-checked={fan.sleep}
          accessibilityState={{ checked: fan.sleep, disabled }} disabled={disabled} onPress={() => choose('fanSleepMode', !fan.sleep)}
          style={({ pressed }) => [styles.key, styles.sleep, fan.sleep && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
          <Ionicons accessible={false} name="moon-outline" size={18} color={theme.colors.accentText} />
          <Text style={styles.sleepLabel}>Sleep</Text><Text style={styles.sleepValue}>{fan.sleep ? 'On · Max 35%' : 'Off'}</Text>
        </Pressable>
        <Text style={styles.feedback}>Local airflow preview · Simulation{'\n'}{fan.sleep ? 'Sleep limits output; saved speed is retained' : 'Your speed is remembered while off'}</Text>
        {disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
      </LinearGradient>
    </LinearGradient>
  </ScrollView>;
}
