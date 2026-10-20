import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import {
  DISHWASHER_CYCLE_OPTIONS, DISHWASHER_TEMPERATURE_OPTIONS, dishwasherControllerActionId, readDishwasherControllerState,
} from '../../../packages/home-scene/src/dishwasherController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { DishwasherControllerArtwork } from './DishwasherControllerArtwork';
import { dishwasherControllerMaterials, dishwasherControllerStyles as styles } from './DishwasherControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; motionAllowed: boolean; onMore: () => void;
}
type DishwasherChoice = 'cycle' | 'washTemp';
type DishwasherAction = Parameters<typeof dishwasherControllerActionId>[0];
type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Tactile keys retain readable labels and a minimum 44-point accessible target. */
function DishwasherKey({ label, text, icon, disabled = false, active = false, onPress, style }: {
  label: string; text?: string; icon: IconName; disabled?: boolean; active?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, active && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    <Ionicons accessible={false} name={icon} size={20} color={active ? theme.colors.accentText : theme.colors.text} />
    {text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Saved program and temperature preferences remain distinct from explicit cycle commands. */
function DishwasherChoiceButton({ title, caption, value, disabled, full = false, largeText, onPress }: {
  title: string; caption: string; value: string; disabled: boolean; full?: boolean; largeText: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${value}. Choose setting`}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, styles.choice, full && styles.choiceFull, largeText && styles.keyLarge, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    <Text style={styles.caption}>{caption}</Text>
    <View style={styles.choiceValue}><Text style={styles.choiceLabel}>{value}</Text>
      <Ionicons accessible={false} name="chevron-down" size={13} color={theme.colors.accentText} />
    </View>
  </Pressable>;
}

/** One guarded dishwasher state drives the cutaway preview, controls and explicit fixed samples. */
export function DishwasherController({ device, state, client, disabled, compact, fontScale, motionAllowed, onMore }: Props) {
  const [choosing, setChoosing] = useState<DishwasherChoice | null>(null);
  const dishwasher = readDishwasherControllerState(device, state);
  const largeText = fontScale > 1.15;
  if (!dishwasher) return null;
  const running = dishwasher.activity === 'running';
  const primary = running ? 'Pause' : dishwasher.activity === 'paused' ? 'Resume' : 'Start';
  const title = choosing === 'cycle' ? 'Cycle' : 'Wash temperature';
  const options = choosing === 'cycle' ? DISHWASHER_CYCLE_OPTIONS : DISHWASHER_TEMPERATURE_OPTIONS;
  const selected = choosing === 'cycle' ? dishwasher.cycle : dishwasher.washTemp;

  /** Commands always use the existing guarded client and wait for its accepted snapshot. */
  function run(action: DishwasherAction): void {
    if (!disabled) client.runAction(device.id, dishwasherControllerActionId(action));
  }

  /** Apply the selected preference without starting a paused or stopped preview. */
  function choose(value: string): void {
    if (disabled || !choosing) return;
    client.setSetting(device.id, choosing, value);
    setChoosing(null);
  }

  return <ScrollView testID="dishwasher-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    {choosing ? <View testID="dishwasher-choice-picker" style={styles.picker}>
      <View style={styles.header}><Text accessibilityRole="header" style={styles.pickerHeading}>{title}</Text>
        <DishwasherKey label="Back to dishwasher controller" icon="close" onPress={() => setChoosing(null)} style={styles.keyCircle} />
      </View>
      <Text style={styles.feedback}>Saved preference · Activity stays unchanged</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={`Dishwasher ${title.toLowerCase()}`} style={styles.pickerOptions}>
        {options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`${title}: ${option.label}`}
          aria-checked={selected === option.value} accessibilityState={{ checked: selected === option.value, disabled }} disabled={disabled}
          onPress={() => choose(option.value)}
          style={({ pressed }) => [styles.pickerChoice, selected === option.value && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
          <Text style={styles.pickerLabel}>{option.label}{selected === option.value ? ' ✓' : ''}</Text>
        </Pressable>)}
      </View>
    </View> : <LinearGradient testID="dishwasher-tactile-controller" colors={dishwasherControllerMaterials.edge} style={[styles.shell, compact && styles.shellCompact]}>
      <LinearGradient colors={dishwasherControllerMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.header}>
          <View style={styles.emblem}><Ionicons accessible={false} name="sparkles-outline" size={22} color={theme.colors.accentText} /></View>
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>DISHWASH</Text></View>
          <DishwasherKey label="More dishwasher controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <View style={styles.hero}>
          <DishwasherControllerArtwork running={running} compact={compact} motionAllowed={motionAllowed} />
          <Text accessibilityLiveRegion="polite" style={styles.status}>{dishwasher.status}</Text>
          <View style={[styles.samples, largeText && styles.samplesLarge]}>
            <Text style={styles.sample}>Progress sample: {dishwasher.progressPercent === null ? 'Unavailable' : `${dishwasher.progressPercent}%`}</Text>
            <Text style={styles.sample}>Time sample: {dishwasher.remainingMin === null ? 'Unavailable' : `${dishwasher.remainingMin} min`}</Text>
          </View>
        </View>
        <View style={[styles.row, largeText && styles.rowLarge]}>
          <DishwasherKey label={`${primary} dishwasher preview`} text={primary} icon={running ? 'pause' : 'play'} active={running} disabled={disabled}
            onPress={() => run(running ? 'pause' : 'start')} style={[styles.keyWide, styles.keyHorizontal, largeText && styles.keyLarge]} />
          <DishwasherKey label="Stop dishwasher preview" text="Stop" icon="stop" disabled={disabled || dishwasher.activity === 'idle' || dishwasher.activity === 'stopped'}
            onPress={() => run('stop')} style={[styles.keyWide, styles.keyHorizontal, largeText && styles.keyLarge]} />
        </View>
        <DishwasherChoiceButton title="Cycle" caption="PROGRAM" value={dishwasher.cycle} full disabled={disabled} largeText={false} onPress={() => setChoosing('cycle')} />
        <View style={[styles.row, largeText && styles.rowLarge]}>
          <DishwasherChoiceButton title="Wash temperature" caption="TEMPERATURE" value={dishwasher.washTemp} disabled={disabled} largeText={largeText} onPress={() => setChoosing('washTemp')} />
          <Pressable accessibilityRole="switch" accessibilityLabel="Dishwasher Dry Boost preference" aria-checked={dishwasher.extraDry}
            accessibilityState={{ checked: dishwasher.extraDry, disabled }} disabled={disabled}
            onPress={() => { if (!disabled) client.setSetting(device.id, 'extraSpin', !dishwasher.extraDry); }}
            style={({ pressed }) => [styles.key, styles.choice, largeText && styles.keyLarge, dishwasher.extraDry && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
            <Text style={styles.caption}>DRY BOOST</Text><View style={styles.choiceValue}>
              <Ionicons accessible={false} name="sunny-outline" size={16} color={theme.colors.accentText} />
              <Text style={styles.choiceLabel}>{dishwasher.extraDry ? 'On' : 'Off'}</Text>
            </View>
          </Pressable>
        </View>
        <Text style={styles.feedback}>Local wash preview · Samples do not count down</Text>
        {disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
      </LinearGradient>
    </LinearGradient>}
  </ScrollView>;
}
