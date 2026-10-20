import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState, SettingValue } from '../../../packages/home-scene/src/simulationTypes';
import {
  DRYER_DRYNESS_OPTIONS, DRYER_HEAT_OPTIONS, LAUNDRY_CYCLE_OPTIONS, WASHER_SPIN_OPTIONS, WASHER_TEMPERATURE_OPTIONS,
  laundryControllerActionId, readLaundryControllerState, readLaundryInstallation,
  type LaundryControllerKey, type LaundryControllerState,
} from '../../../packages/home-scene/src/laundryController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { LaundryControllerArtwork } from './LaundryControllerArtwork';
import { laundryControllerMaterials, laundryControllerStyles as styles } from './LaundryControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; motionAllowed: boolean; onMore: () => void;
}
type LaundryChoice = 'cycle' | 'washTemp' | 'spinSpeedRpm' | 'heatLevel' | 'drynessLevel';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface ChoiceDefinition {
  title: string; caption: string; value: SettingValue | null; display: string;
  options: ReadonlyArray<{ readonly label: string; readonly value: SettingValue }>;
}

/** Project a selected machine's existing preference catalog without adding a second state store. */
function readChoice(choice: LaundryChoice, laundry: LaundryControllerState): ChoiceDefinition {
  switch (choice) {
    case 'cycle': return { title: 'Cycle', caption: 'PROGRAM', value: laundry.cycle, display: laundry.cycle, options: LAUNDRY_CYCLE_OPTIONS[laundry.kind] };
    case 'washTemp': return { title: 'Wash temperature', caption: 'TEMPERATURE', value: laundry.washTemp, display: laundry.washTemp ?? 'Unavailable', options: WASHER_TEMPERATURE_OPTIONS };
    case 'spinSpeedRpm': return { title: 'Spin setting', caption: 'SPIN SETTING', value: laundry.spinSpeedRpm, display: laundry.spinSpeedRpm === null ? 'Unavailable' : `${laundry.spinSpeedRpm} rpm`, options: WASHER_SPIN_OPTIONS };
    case 'heatLevel': return { title: 'Heat level', caption: 'HEAT', value: laundry.heatLevel, display: laundry.heatLevel ?? 'Unavailable', options: DRYER_HEAT_OPTIONS };
    case 'drynessLevel': return { title: 'Dryness level', caption: 'DRYNESS', value: laundry.drynessLevel, display: laundry.drynessLevel ?? 'Unavailable', options: DRYER_DRYNESS_OPTIONS };
  }
}

/** Buttons retain a tactile edge and a minimum 44-point accessible target. */
function LaundryKey({ label, text, icon, disabled = false, active = false, onPress, style }: {
  label: string; text?: string; icon: IconName; disabled?: boolean; active?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, active && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    <Ionicons accessible={false} name={icon} size={20} color={active ? theme.colors.accentText : theme.colors.text} />
    {text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Configuration buttons open bounded pickers while preserving the selected machine's activity. */
function LaundryChoiceButton({ choice, disabled, full = false, largeText, onPress }: {
  choice: ChoiceDefinition; disabled: boolean; full?: boolean; largeText: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${choice.title}: ${choice.display}. Choose setting`}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, styles.choice, full && styles.choiceFull, largeText && styles.keyLarge, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    <Text style={styles.caption}>{choice.caption}</Text>
    <View style={styles.choiceValue}><Text style={styles.choiceLabel}>{choice.display}</Text>
      <Ionicons accessible={false} name="chevron-down" size={13} color={theme.colors.accentText} />
    </View>
  </Pressable>;
}

/** Selected washer/dryer controls share guarded saved state; progress and time remain explicit samples. */
export function LaundryController({ device, state, client, disabled, compact, fontScale, motionAllowed, onMore }: Props) {
  const [choosing, setChoosing] = useState<LaundryChoice | null>(null);
  const laundry = readLaundryControllerState(device, state);
  const largeText = fontScale > 1.15;
  if (!laundry) return null;
  const kind = laundry.kind;
  const running = laundry.activity === 'running';
  const machine = laundry.kind === 'washer' ? 'Washer' : 'Dryer';
  const primary = running ? 'Pause' : laundry.activity === 'paused' ? 'Resume' : 'Start';
  const configuration: LaundryChoice[] = laundry.kind === 'washer' ? ['washTemp', 'spinSpeedRpm'] : ['heatLevel', 'drynessLevel'];
  const picker = choosing ? readChoice(choosing, laundry) : null;

  /** Delegate explicit commands to the existing guarded client, never to the other stacked machine. */
  function run(action: LaundryControllerKey): void {
    if (!disabled) client.runAction(device.id, laundryControllerActionId(kind, action));
  }

  /** Only the selected preference changes; stored activity and samples survive the edit. */
  function choose(value: SettingValue): void {
    if (disabled || !choosing) return;
    client.setSetting(device.id, choosing, value);
    setChoosing(null);
  }

  return <ScrollView testID="laundry-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    {picker ? <View testID="laundry-choice-picker" style={styles.picker}>
      <View style={styles.header}><Text accessibilityRole="header" style={styles.pickerHeading}>{picker.title}</Text>
        <LaundryKey label="Back to laundry controller" icon="close" onPress={() => setChoosing(null)} style={styles.keyCircle} />
      </View>
      <Text style={styles.feedback}>Saved preference · Activity stays unchanged</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={`${machine} ${picker.title.toLowerCase()}`} style={styles.pickerOptions}>
        {picker.options.map((option) => <Pressable key={String(option.value)} accessibilityRole="radio" accessibilityLabel={`${picker.title}: ${option.label}`}
          aria-checked={picker.value === option.value} accessibilityState={{ checked: picker.value === option.value, disabled }} disabled={disabled}
          onPress={() => choose(option.value)}
          style={({ pressed }) => [styles.pickerChoice, picker.value === option.value && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
          <Text style={styles.pickerLabel}>{option.label}{picker.value === option.value ? ' ✓' : ''}</Text>
        </Pressable>)}
      </View>
    </View> : <LinearGradient testID="laundry-tactile-controller" colors={laundryControllerMaterials.edge} style={[styles.shell, compact && styles.shellCompact]}>
      <LinearGradient colors={laundryControllerMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.header}>
          <View style={styles.emblem}><Ionicons accessible={false} name={laundry.kind === 'washer' ? 'water-outline' : 'sunny-outline'} size={22} color={theme.colors.accentText} /></View>
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>{machine.toUpperCase()}</Text></View>
          <LaundryKey label={`More ${laundry.kind} controls`} icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <View style={styles.hero}>
          <LaundryControllerArtwork kind={laundry.kind} running={running} installation={readLaundryInstallation(device)} compact={compact} motionAllowed={motionAllowed} />
          <Text accessibilityLiveRegion="polite" style={styles.status}>{laundry.status}</Text>
          <View style={[styles.samples, largeText && styles.samplesLarge]}>
            <Text style={styles.sample}>Progress sample: {laundry.progressPercent === null ? 'Unavailable' : `${laundry.progressPercent}%`}</Text>
            <Text style={styles.sample}>Time sample: {laundry.remainingMin === null ? 'Unavailable' : `${laundry.remainingMin} min`}</Text>
          </View>
        </View>
        <View style={[styles.row, largeText && styles.rowLarge]}>
          <LaundryKey label={`${primary} ${laundry.kind} preview`} text={primary} icon={running ? 'pause' : 'play'} active={running} disabled={disabled}
            onPress={() => run(running ? 'pause' : 'start')} style={[styles.keyWide, styles.keyHorizontal, largeText && styles.keyLarge]} />
          <LaundryKey label={`Stop ${laundry.kind} preview`} text="Stop" icon="stop" disabled={disabled || laundry.activity === 'idle' || laundry.activity === 'stopped'}
            onPress={() => run('stop')} style={[styles.keyWide, styles.keyHorizontal, largeText && styles.keyLarge]} />
        </View>
        <LaundryChoiceButton choice={readChoice('cycle', laundry)} full disabled={disabled} largeText={false} onPress={() => setChoosing('cycle')} />
        <View style={[styles.row, largeText && styles.rowLarge]}>
          {configuration.map((choice) => <LaundryChoiceButton key={choice} choice={readChoice(choice, laundry)} disabled={disabled} largeText={largeText} onPress={() => setChoosing(choice)} />)}
        </View>
        {laundry.lintFilterOk === false && <Text style={styles.care}>Lint sample · Clean filter</Text>}
        <Text style={styles.feedback}>Local cycle preview · Samples do not count down</Text>
        {disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
      </LinearGradient>
    </LinearGradient>}
  </ScrollView>;
}
