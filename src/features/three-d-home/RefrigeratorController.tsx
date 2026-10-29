import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { climateTemperatureStepLabel, formatClimateTemperature, type ClimateTemperatureUnit } from '../../../packages/home-scene/src/climateController';
import { REFRIGERATOR_MODES, REFRIGERATOR_PREFERENCE_NOTE, REFRIGERATOR_TARGET_BOUNDS, readRefrigeratorControllerState, refrigeratorControllerActionId } from '../../../packages/home-scene/src/refrigeratorController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { RefrigeratorControllerArtwork } from './RefrigeratorControllerArtwork';
import { refrigeratorControllerMaterials, refrigeratorControllerStyles as styles } from './RefrigeratorControllerStyles';
import { switchKeyboard } from '../../components/switchKeyboard';
import { useHomeStore } from '../../store/useHomeStore';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; onMore: () => void;
}
type RefrigeratorAction = Parameters<typeof refrigeratorControllerActionId>[0];
type PreferenceField = 'fridgeMode' | 'fridgeQuickCool' | 'fridgeQuickFreeze';
interface KeyProps {
  label: string; text?: string; hint?: string; icon?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean; selected?: boolean; active?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}

/** Raised keys preserve 44-point targets while radio choices announce the accepted saved preference. */
function RefrigeratorKey({ label, text, hint, icon, disabled = false, selected, active = false, onPress, style }: KeyProps) {
  const choice = selected !== undefined;
  return <Pressable accessibilityRole={choice ? 'radio' : 'button'} accessibilityLabel={label} accessibilityHint={hint} aria-checked={selected}
    accessibilityState={choice ? { checked: selected, disabled } : { disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, (selected || active) && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={20} color={theme.colors.accentText} />}
    {text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Each compartment keeps its saved target separate from an actual measured temperature. */
function CompartmentTarget({ compartment, value, unit, disabled, largeText, run }: {
  compartment: 'fridge' | 'freezer'; value: number | null; unit: ClimateTemperatureUnit;
  disabled: boolean; largeText: boolean; run: (action: RefrigeratorAction) => void;
}) {
  const bounds = REFRIGERATOR_TARGET_BOUNDS[compartment];
  const label = compartment === 'fridge' ? 'Fridge' : 'Freezer';
  const reading = value === null ? '—' : formatClimateTemperature(value, unit);
  return <View style={[styles.target, largeText && styles.targetLarge]}>
    <Text style={styles.targetLabel}>{label.toUpperCase()} TARGET</Text>
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel={value === null ? `${label} target unavailable` : `${label} target ${reading} degrees ${unit === 'C' ? 'Celsius' : 'Fahrenheit'}`} style={styles.targetDisplay}>
      <Text style={styles.targetValue}>{reading}</Text><Text style={styles.targetUnit}>°{unit}</Text>
    </View>
    <View style={styles.targetControls}>
      <RefrigeratorKey label={`Decrease ${compartment} target temperature`} hint={`Adjusts by ${climateTemperatureStepLabel(unit)}`} icon="remove"
        disabled={disabled || value === null || value <= bounds.min} onPress={() => run(compartment === 'fridge' ? 'fridgeDown' : 'freezerDown')} style={styles.keyStep} />
      <RefrigeratorKey label={`Increase ${compartment} target temperature`} hint={`Adjusts by ${climateTemperatureStepLabel(unit)}`} icon="add"
        disabled={disabled || value === null || value >= bounds.max} onPress={() => run(compartment === 'fridge' ? 'fridgeUp' : 'freezerUp')} style={styles.keyStep} />
    </View>
  </View>;
}

/** Keep optional quick modes explicitly labeled as saved preferences, including unknown persisted values. */
function CoolingPreference({ label, checked, disabled, largeText, onPress }: {
  label: string; checked: boolean | null; disabled: boolean; largeText: boolean; onPress: () => void;
}) {
  const valueLabel = checked === null ? '—' : checked ? 'On' : 'Off';
  return <Pressable accessibilityRole="switch" accessibilityLabel={`${label} preference`} aria-checked={checked === true}
    accessibilityValue={{ text: checked === null ? 'Unavailable' : valueLabel }} accessibilityState={{ checked: checked === true, disabled }}
    disabled={disabled} onPress={onPress} {...switchKeyboard(onPress, disabled)}
    style={({ pressed }) => [styles.key, styles.preference, largeText && styles.preferenceLarge, checked === true && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    <Text style={styles.keyLabel}>{label}</Text><Text style={styles.preferenceValue}>{valueLabel}</Text>
  </Pressable>;
}

/** Present the shared refrigerator contract through guarded commands without local optimistic settings. */
export function RefrigeratorController({ device, state, client, disabled, compact, fontScale, onMore }: Props) {
  const unit = useHomeStore((home) => home.profile.tempUnit ?? 'C');
  const refrigerator = readRefrigeratorControllerState(device, state);
  const [viewportHeight, setViewportHeight] = useState(0);
  const compactLayout = compact || (viewportHeight > 0 && viewportHeight < 600);
  const largeText = fontScale > 1.15;

  /** Account for real header and safe-area consumption instead of guessing from screen dimensions. */
  function measureViewport(event: LayoutChangeEvent): void {
    const height = event.nativeEvent.layout.height;
    setViewportHeight((current) => current === height ? current : height);
  }
  /** Relative actions resolve against current canonical state so rapid taps cannot overwrite each other. */
  function run(action: RefrigeratorAction): void { if (!disabled) client.runAction(device.id, refrigeratorControllerActionId(action)); }
  /** Each preference updates one field and never starts cooling or changes compartment targets. */
  function choose(field: PreferenceField, value: string | boolean): void { if (!disabled) client.setSetting(device.id, field, value); }
  if (!refrigerator) return null;

  return <ScrollView onLayout={measureViewport} testID="refrigerator-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="refrigerator-tactile-controller" colors={refrigeratorControllerMaterials.edge} style={styles.shell}>
      <LinearGradient colors={refrigeratorControllerMaterials.body} style={[styles.body, compactLayout && styles.bodyCompact]}>
        <View style={styles.header}>
          <RefrigeratorKey label={refrigerator.on ? 'Turn refrigerator off' : 'Turn refrigerator on'} icon="power" active={refrigerator.on} disabled={disabled}
            onPress={() => { if (!disabled) client.toggle(device.id); }} style={styles.keyCircle} />
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>REFRIGERATOR</Text></View>
          <RefrigeratorKey label="More refrigerator controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <View style={styles.hero}>
          <RefrigeratorControllerArtwork on={refrigerator.on} compact={compactLayout} />
          <Text accessibilityLiveRegion="polite" style={styles.status}>{refrigerator.status}</Text>
        </View>
        <View style={[styles.targets, largeText && styles.targetsLarge]}>
          <CompartmentTarget compartment="fridge" value={refrigerator.tempC} unit={unit} disabled={disabled} largeText={largeText} run={run} />
          <CompartmentTarget compartment="freezer" value={refrigerator.freezerTempC} unit={unit} disabled={disabled} largeText={largeText} run={run} />
        </View>
        <View style={styles.section}>
          <Text style={styles.caption}>MODE PREFERENCE</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Refrigerator mode preference" style={[styles.row, largeText && styles.rowLarge]}>
            {REFRIGERATOR_MODES.map((mode) => <RefrigeratorKey key={mode.value} label={`Refrigerator mode: ${mode.label}`} text={mode.label} selected={refrigerator.mode === mode.value}
              disabled={disabled} onPress={() => choose('fridgeMode', mode.value)} style={[styles.keyWide, largeText && styles.keyLarge]} />)}
          </View>
        </View>
        <View style={[styles.row, largeText && styles.rowLarge]}>
          <CoolingPreference label="Quick cool" checked={refrigerator.quickCool} disabled={disabled} largeText={largeText} onPress={() => choose('fridgeQuickCool', refrigerator.quickCool !== true)} />
          <CoolingPreference label="Quick freeze" checked={refrigerator.quickFreeze} disabled={disabled} largeText={largeText} onPress={() => choose('fridgeQuickFreeze', refrigerator.quickFreeze !== true)} />
        </View>
        <Text style={styles.feedback}>{REFRIGERATOR_PREFERENCE_NOTE}</Text>
        {disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
      </LinearGradient>
    </LinearGradient>
  </ScrollView>;
}
