import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import {
  CLIMATE_MODE_OPTIONS, CLIMATE_PRESET_OPTIONS, CLIMATE_SWING_OPTIONS,
  climateActionId, climatePresetCommand, climateTemperatureStepLabel, formatClimateTemperature, readClimateControllerState,
  type ClimateMode, type ClimatePreset, type ClimateSwing, type ClimateTemperatureUnit,
} from '../../../packages/home-scene/src/climateController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { climateControllerMaterials, climateControllerStyles as styles } from './ClimateControllerStyles';
import { theme } from '../../theme/theme';
import { useHomeStore } from '../../store/useHomeStore';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; onMore: () => void;
}
type ClimateState = ReturnType<typeof readClimateControllerState>;
type ClimateKey = Parameters<typeof climateActionId>[0];
type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface KeyProps {
  label: string; icon?: IconName; text?: string; disabled?: boolean; active?: boolean;
  choice?: boolean; hint?: string; onPress: () => void; style?: StyleProp<ViewStyle>;
}
const MODE_ICONS: Record<ClimateMode, IconName> = { cold: 'snow-outline', fan: 'leaf-outline', dry: 'water-outline' };

/** Raised keys retain their full target size and expose selected choices to assistive technology. */
function ClimateKey({ label, icon, text, disabled = false, active = false, choice = false, hint, onPress, style }: KeyProps) {
  return <Pressable accessibilityRole={choice ? 'radio' : 'button'} accessibilityLabel={label}
    accessibilityHint={hint} accessibilityState={choice ? { disabled, checked: active } : { disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, active && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={20} color={active ? theme.colors.accentText : theme.colors.text} />}
    {text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** The static ring converts the saved target for display without inventing a room reading or draggable dial. */
function TemperatureRing({ climate, compact, largeText, unit }: { climate: ClimateState; compact: boolean; largeText: boolean; unit: ClimateTemperatureUnit }) {
  const circumference = 2 * Math.PI * 72;
  const progress = (climate.targetC - climate.tempMin) / (climate.tempMax - climate.tempMin);
  return <LinearGradient colors={climateControllerMaterials.ring}
    style={[styles.ring, compact && styles.ringCompact, largeText && styles.ringLarge]}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.ringArt}>
      <Svg width="100%" height="100%" viewBox="0 0 160 160" accessible={false}>
        <Circle cx={80} cy={80} r={72} fill="none" stroke="#4B365D" strokeWidth={3} />
        <Circle cx={80} cy={80} r={72} fill="none" stroke={climate.on ? theme.colors.accent : '#8B769D'} strokeWidth={4}
          strokeLinecap="round" strokeDasharray={[Math.max(0.01, progress * circumference), circumference]}
          rotation={-90} origin="80, 80" />
        <Circle cx={80} cy={80} r={64} fill="none" stroke="#6D507E" strokeWidth={0.5} />
      </Svg>
    </View>
    <View accessible accessibilityLabel={`Target temperature ${formatClimateTemperature(climate.targetC, unit)} degrees ${unit === 'C' ? 'Celsius' : 'Fahrenheit'}`} accessibilityLiveRegion="polite">
      <Text style={styles.ringCaption}>TARGET °{unit}</Text>
      <Text style={[styles.ringValue, compact && styles.ringValueCompact]}>{formatClimateTemperature(climate.targetC, unit)}</Text>
    </View>
  </LinearGradient>;
}

/** Relative temperature commands resolve against current shared state even during rapid repeated taps. */
function TemperatureControls({ climate, compact, largeText, disabled, unit, run }: {
  climate: ClimateState; compact: boolean; largeText: boolean; disabled: boolean; unit: ClimateTemperatureUnit; run: (key: ClimateKey) => void;
}) {
  const down = <ClimateKey label="Lower target temperature" icon="remove" disabled={disabled || climate.targetC <= climate.tempMin}
    hint={`Adjusts by ${climateTemperatureStepLabel(unit)}`} onPress={() => run('temperatureDown')} style={styles.keyCircle} />;
  const up = <ClimateKey label="Raise target temperature" icon="add" disabled={disabled || climate.targetC >= climate.tempMax}
    hint={`Adjusts by ${climateTemperatureStepLabel(unit)}`} onPress={() => run('temperatureUp')} style={styles.keyCircle} />;
  const ring = <TemperatureRing climate={climate} compact={compact} largeText={largeText} unit={unit} />;
  return largeText ? <View style={styles.temperatureLarge}>{ring}<View style={styles.temperatureAdjusters}>{down}{up}</View></View>
    : <View style={styles.temperatureRow}>{down}{ring}{up}</View>;
}

/** One tactile panel uses the existing guarded client, with contained momentum scrolling for larger text. */
export function ClimateController({ device, state, client, disabled, compact, fontScale, onMore }: Props) {
  const [choosingSwing, setChoosingSwing] = useState(false);
  const unit = useHomeStore((home) => home.profile.tempUnit ?? 'C');
  const climate = readClimateControllerState(device, state);
  const largeText = fontScale > 1.25;
  const swingLabel = CLIMATE_SWING_OPTIONS.find((option) => option.value === climate.swing)!.label;
  const feedback = disabled ? 'View only · Controls unavailable' : climate.on
    ? `Airflow preview · ${Math.round(climate.airflowStrength * 100)}%` : 'Off · Your settings are remembered';

  /** Keep relative steps in the shared reducer so the displayed snapshot cannot lose a rapid press. */
  function run(key: ClimateKey): void { if (!disabled) client.runAction(device.id, climateActionId(key)); }

  /** Preset commands preserve temperature, mode and remembered fan speed through the shared contract. */
  function choosePreset(preset: ClimatePreset): void {
    if (disabled) return;
    const command = climatePresetCommand(preset);
    if (command.type === 'action') client.runAction(device.id, command.actionId);
    else client.setSetting(device.id, command.field, command.value);
  }

  /** Swing remains a catalog-backed choice and never implies a physical device acknowledgement. */
  function chooseSwing(swing: ClimateSwing): void {
    if (!disabled) { client.setSetting(device.id, 'acSwingMode', swing); setChoosingSwing(false); }
  }

  return <ScrollView testID="climate-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    {choosingSwing ? <View testID="climate-swing-picker" style={styles.picker}>
      <View style={styles.row}><Text accessibilityRole="header" style={styles.pickerTitle}>Airflow swing</Text>
        <ClimateKey label="Back to climate controller" icon="close" onPress={() => setChoosingSwing(false)} style={styles.keyCircle} />
      </View>
      <Text style={styles.feedback}>Local airflow preview</Text>
      {CLIMATE_SWING_OPTIONS.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`Swing ${option.label}`}
        accessibilityState={{ checked: climate.swing === option.value, disabled }} disabled={disabled} onPress={() => chooseSwing(option.value)}
        style={({ pressed }) => [styles.pickerChoice, climate.swing === option.value && styles.pickerSelected, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
        <Text style={styles.pickerText}>{option.label}{climate.swing === option.value ? ' ✓' : ''}</Text>
      </Pressable>)}
    </View> : <LinearGradient testID="climate-tactile-controller" colors={climateControllerMaterials.edge} style={[styles.shell, compact && styles.shellCompact]}>
      <LinearGradient colors={climateControllerMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={[styles.row, styles.header]}>
          <ClimateKey label={climate.on ? 'Turn climate off' : 'Turn climate on'} icon="power" active={climate.on} disabled={disabled}
            onPress={() => { if (!disabled) client.toggle(device.id); }} style={styles.keyCircle} />
          <View style={styles.identity}><Text style={styles.title}>CLIMATE</Text>
            <Text style={[styles.powerStatus, climate.on && styles.powerStatusOn]}>{climate.on ? 'ON' : 'OFF'}</Text></View>
          <ClimateKey label="More climate controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <TemperatureControls climate={climate} compact={compact} largeText={largeText} disabled={disabled} unit={unit} run={run} />
        <View accessibilityRole="radiogroup" accessibilityLabel="Climate mode" style={[styles.row, largeText && styles.optionsLarge]}>
          {CLIMATE_MODE_OPTIONS.map((option) => <ClimateKey key={option.value} label={`${option.label} mode`} icon={MODE_ICONS[option.value]}
            text={option.label} choice active={climate.mode === option.value} disabled={disabled}
            onPress={() => { if (!disabled) client.setSetting(device.id, 'mode', option.value); }}
            style={[styles.keyWide, styles.modeKey, largeText && styles.optionLarge]} />)}
        </View>
        <View style={[styles.airflowRow, largeText && styles.airflowLarge]}>
          <View style={[styles.fan, largeText && styles.fanLarge]}>
            <ClimateKey label="Lower fan speed" icon="remove" disabled={disabled || climate.fanSpeed <= climate.fanMin}
              onPress={() => run('fanDown')} style={[styles.keyCircle, styles.fanKey]} />
            <View accessible accessibilityLabel={`Fan speed ${climate.fanSpeed} percent`} accessibilityLiveRegion="polite" style={styles.fanReading}>
              <Text style={styles.fanLabel}>FAN</Text><Text style={styles.fanValue}>{climate.fanSpeed}%</Text>
            </View>
            <ClimateKey label="Raise fan speed" icon="add" disabled={disabled || climate.fanSpeed >= climate.fanMax}
              onPress={() => run('fanUp')} style={[styles.keyCircle, styles.fanKey]} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Swing: ${swingLabel}. Choose airflow swing`} accessibilityState={{ disabled }} disabled={disabled}
            onPress={() => setChoosingSwing(true)} style={({ pressed }) => [styles.key, styles.swing, largeText && styles.swingLarge, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
            <Text style={styles.swingLabel}>SWING</Text><Text style={styles.keyLabel}>{swingLabel}⌄</Text>
          </Pressable>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Airflow preset" style={[styles.row, largeText && styles.optionsLarge]}>
          {CLIMATE_PRESET_OPTIONS.map((option) => <ClimateKey key={option.value} label={`${option.label} airflow preset`} text={option.label}
            choice active={climate.preset === option.value} disabled={disabled} onPress={() => choosePreset(option.value)}
            style={[styles.keyWide, largeText && styles.optionLarge]} />)}
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>
      </LinearGradient>
    </LinearGradient>}
  </ScrollView>;
}
