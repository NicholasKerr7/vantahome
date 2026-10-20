import React, { useId } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { formatClimateTemperature, climateTemperatureStepLabel } from '../../../packages/home-scene/src/climateController';
import { WATER_HEATER_MODE_OPTIONS, readWaterControllerState, waterControllerActionId } from '../../../packages/home-scene/src/waterController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { waterControllerMaterials, waterControllerStyles as styles } from './WaterControllerStyles';
import { useHomeStore } from '../../store/useHomeStore';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; onMore: () => void;
}
type WaterState = NonNullable<ReturnType<typeof readWaterControllerState>>;
type WaterAction = Parameters<typeof waterControllerActionId>[0];
type WaterField = 'heaterMode' | 'recirculation' | 'waterLeakAlerts' | 'waterPressureAlerts';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface KeyProps {
  label: string; text?: string; icon?: IconName; disabled?: boolean; active?: boolean;
  role?: 'button' | 'radio' | 'switch'; onPress: () => void; style?: StyleProp<ViewStyle>;
}

/** Buttons use fixed minimum touch targets, while checked controls expose their accepted state. */
function WaterKey({ label, text, icon, disabled = false, active = false, role = 'button', onPress, style }: KeyProps) {
  const checked = role !== 'button';
  return <Pressable accessibilityRole={role} accessibilityLabel={label}
    aria-checked={checked ? active : undefined} accessibilityState={checked ? { disabled, checked: active } : { disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, active && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={20} color={theme.colors.text} />}
    {text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** A fixed cylindrical tank identifies the heater without inventing a measured level or temperature. */
function HeaterArtwork({ metal, on }: { metal: string; on: boolean }) {
  return <G>
    <Path d="M83 27 L83 13 L67 13 M135 27 L135 13 L151 13" fill="none" stroke="#BCA1D0" strokeWidth={7} strokeLinecap="round" />
    <Path d="M64 44 C64 15 154 15 154 44 L154 169 C154 197 64 197 64 169 Z" fill={`url(#${metal})`} stroke="#A58BB9" strokeWidth={1.5} />
    <Ellipse cx={109} cy={44} rx={45} ry={16} fill="#62536E" stroke="#C9AFDE" strokeWidth={1.5} />
    <Ellipse cx={109} cy={44} rx={34} ry={10} fill="#807086" opacity={0.5} />
    <Path d="M71 63 L71 161 M147 63 L147 161" stroke="#D5BEDE" strokeWidth={1} opacity={0.35} />
    <Rect x={91} y={67} width={37} height={83} rx={12} fill="#1B1225" stroke="#79608E" />
    <Circle cx={109.5} cy={92} r={12} fill="#291C37" stroke={on ? '#DFB8F9' : '#685578'} strokeWidth={2} />
    <Path d="M110 83 L110 92 M104 87 A8 8 0 1 0 116 87" fill="none" stroke={on ? '#E7C9FC' : '#776485'} strokeWidth={2} strokeLinecap="round" />
    <Path d="M100 118 L119 118 M100 125 L119 125 M100 132 L114 132" stroke="#7F668E" strokeWidth={2} />
    <Path d="M138 80 L138 146" stroke={on ? '#E3B3BC' : '#675869'} strokeWidth={3} strokeLinecap="round" />
    <Path d="M80 183 L80 196 M139 183 L139 196" stroke="#9E84B2" strokeWidth={5} />
  </G>;
}

/** Pipework and a static instrument dial represent the meter, not a connected shutoff valve. */
function MeterArtwork({ metal }: { metal: string }) {
  return <G>
    <Path d="M19 106 L58 106 M162 106 L201 106" stroke="#6D607D" strokeWidth={25} strokeLinecap="round" />
    <Path d="M19 100 L58 100 M162 100 L201 100" stroke="#C1AED2" strokeWidth={3} opacity={0.75} />
    <Rect x={32} y={88} width={12} height={35} rx={3} fill="#8B789D" stroke="#BFA6D5" />
    <Rect x={176} y={88} width={12} height={35} rx={3} fill="#8B789D" stroke="#BFA6D5" />
    <Path d="M63 80 L110 57 L159 79 L159 133 L111 158 L63 134 Z" fill={`url(#${metal})`} stroke="#A890BC" strokeWidth={1.5} />
    <Path d="M63 80 L110 104 L159 79 M110 104 L110 158" fill="none" stroke="#BDA5CF" opacity={0.5} />
    <Ellipse cx={111} cy={80} rx={43} ry={27} fill="#32253F" stroke="#B69ACB" strokeWidth={2} />
    <Ellipse cx={111} cy={80} rx={33} ry={20} fill="#120D1C" stroke="#826A98" />
    <Path d="M89 81 C90 63 129 60 135 78" fill="none" stroke="#AD85D6" strokeWidth={3} strokeLinecap="round" />
    <Path d="M103 78 L113 72 L124 78 L114 84 Z" fill="#B7D8E0" opacity={0.85} />
    <Path d="M86 120 L98 126 M122 126 L139 118" stroke="#AC90C4" strokeWidth={2} />
    <Circle cx={111} cy={145} r={2} fill="#B7D8E0" />
  </G>;
}

/** Decorative SVGs are light enough to retain alongside the existing scene without animation loops. */
function WaterArtwork({ water, compact }: { water: WaterState; compact: boolean }) {
  const metal = `${useId().replace(/:/g, '')}-water-metal`;
  const heater = water.kind === 'water-heater';
  return <View testID={`water-preview-${water.kind}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={heater ? [styles.artwork, compact && styles.artworkCompact] : [styles.meterArtwork, compact && styles.meterArtworkCompact]}>
    <Svg width="100%" height="100%" viewBox={heater ? '45 0 130 214' : '0 38 220 140'} aria-hidden>
      <Defs><SvgGradient id={metal} x1="0%" y1="0%" x2="100%" y2="10%">
        <Stop offset="0" stopColor="#706078" /><Stop offset="0.35" stopColor="#9B84A8" />
        <Stop offset="0.6" stopColor="#5A436A" /><Stop offset="1" stopColor="#291C38" />
      </SvgGradient></Defs>
      <Ellipse cx={110} cy={heater ? 199 : 163} rx={heater ? 54 : 72} ry={heater ? 9 : 11} fill="#0F0917" opacity={0.7} />
      {heater ? <HeaterArtwork metal={metal} on={water.on} /> : <MeterArtwork metal={metal} />}
    </Svg>
  </View>;
}

/** Keep unavailable samples distinct from a genuine zero and retain units in accessible names. */
function WaterMetric({ label, value, unit }: { label: string; value: number | string | null; unit: string }) {
  const text = value === null ? '—' : `${value}${unit ? ` ${unit}` : ''}`;
  return <View accessible accessibilityLabel={`${label}: ${value === null ? 'Unavailable' : text}`} style={styles.metric}>
    <Text style={styles.metricValue}>{text}</Text><Text style={styles.metricLabel}>{label}</Text>
  </View>;
}

/** Saved preferences remain visibly separate from sample readings and physical device behavior. */
function PreferenceKey({ label, checked, disabled, onPress, wide = false, largeText = false }: {
  label: string; checked: boolean; disabled: boolean; onPress: () => void; wide?: boolean; largeText?: boolean;
}) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked, disabled }}
    aria-checked={checked} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, styles.preferenceKey, wide && styles.keyWide, largeText && styles.choiceLarge, checked && styles.keyActive,
      disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    <Text style={[styles.keyLabel, styles.preferenceLabel]}>{label}</Text>
    <Text style={styles.preferenceValue}>{checked ? 'On' : 'Off'}</Text>
  </Pressable>;
}

/** Surface everyday water controls through the same guarded, persisted simulation commands as More. */
export function WaterController({ device, state, client, disabled, compact, fontScale, onMore }: Props) {
  const water = readWaterControllerState(device, state);
  const unit = useHomeStore((home) => home.profile.tempUnit ?? 'C');
  const largeText = fontScale > 1.15;
  if (!water) return null;

  /** Resolve each increment against canonical state so repeated presses cannot overwrite one another. */
  function run(action: WaterAction): void { if (!disabled) client.runAction(device.id, waterControllerActionId(action)); }

  /** Persist only the requested preference; no readings or heater power are patched here. */
  function choose(field: WaterField, value: string | boolean): void { if (!disabled) client.setSetting(device.id, field, value); }

  const heater = water.kind === 'water-heater';
  const headline = heater ? formatClimateTemperature(water.targetC, unit) : water.flowLpm === null ? '—' : String(water.flowLpm);
  const headlineUnit = heater ? `°${unit}` : water.flowLpm === null ? '' : 'L/min';
  const caption = heater ? 'TARGET TEMPERATURE' : 'FLOW SAMPLE';
  const leakLabel = !heater && (water.leakDetected === null ? 'Leak status unavailable' : water.leakDetected ? 'Leak detected · sample' : 'No leak detected · sample');

  return <ScrollView testID="water-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="water-tactile-controller" colors={waterControllerMaterials.edge} style={[styles.shell, compact && styles.shellCompact]}>
      <LinearGradient colors={waterControllerMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.header}>
          {heater
            ? <WaterKey label={`${device.name} power`} icon="power" role="switch" active={water.on} disabled={disabled}
              onPress={() => { if (!disabled) client.toggle(device.id); }} style={styles.keyCircle} />
            : <WaterKey label="Check water sample" icon="refresh" disabled={disabled}
              onPress={() => { if (!disabled) client.toggle(device.id); }} style={styles.keyCircle} />}
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>{heater ? 'HOT WATER' : 'WATER METER'}</Text></View>
          <WaterKey label="More water controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <View style={[styles.hero, largeText && styles.heroLarge]}>
          <WaterArtwork water={water} compact={compact} />
          <View style={[styles.reading, largeText && styles.readingLarge]}>
            <Text style={styles.caption}>{caption}</Text>
            <Text accessibilityLabel={`${heater ? 'Target temperature' : 'Flow sample'}: ${headline} ${headlineUnit}`}
              accessibilityLiveRegion={heater ? 'polite' : 'none'}
              style={[styles.value, compact && styles.valueCompact]}>{headline}<Text style={styles.valueUnit}> {headlineUnit}</Text></Text>
            <Text accessibilityLiveRegion="polite" style={styles.status}>{heater ? water.status : water.sampleChecked ? 'Sample checked' : 'Monitoring sample'}</Text>
            {heater && <View style={styles.stepper} role="group" accessibilityLabel={`Target temperature, steps of ${climateTemperatureStepLabel(unit)}`}>
              <WaterKey label="Decrease water target temperature" icon="remove" disabled={disabled || water.targetC <= water.tempMin}
                onPress={() => run('temperatureDown')} style={styles.keyCircle} />
              <Text style={styles.stepperValue}>{climateTemperatureStepLabel(unit)} steps</Text>
              <WaterKey label="Increase water target temperature" icon="add" disabled={disabled || water.targetC >= water.tempMax}
                onPress={() => run('temperatureUp')} style={styles.keyCircle} />
            </View>}
          </View>
        </View>
        {heater ? <>
          <View style={styles.modeSection}>
            <Text style={styles.caption}>MODE PREFERENCE</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Water heater mode preference" style={[styles.choices, largeText && styles.choicesLarge]}>
              {WATER_HEATER_MODE_OPTIONS.map((option) => <WaterKey key={option.value} label={`Water heater mode: ${option.label}`} text={option.label}
                role="radio" active={water.mode === option.value} disabled={disabled} onPress={() => choose('heaterMode', option.value)}
                style={[styles.keyWide, largeText && styles.choiceLarge]} />)}
            </View>
          </View>
          <PreferenceKey label="Recirculation preference" checked={water.recirculation} disabled={disabled}
            onPress={() => choose('recirculation', !water.recirculation)} />
          <Text style={styles.feedback}>Saved preferences · No heating simulation</Text>
        </> : <>
          <View style={[styles.metrics, largeText && styles.metricsLarge]}>
            <WaterMetric label="Today" value={water.todayL} unit="L" />
            <WaterMetric label="Pressure" value={water.pressurePsi} unit="psi" />
            <WaterMetric label="Water temp" value={water.temperatureC === null ? null : formatClimateTemperature(water.temperatureC, unit)} unit={`°${unit}`} />
          </View>
          <View style={[styles.leakStrip, water.leakDetected === true && styles.leakAlert, water.leakDetected === null && styles.leakUnknown]}>
            <Ionicons accessible={false} name={water.leakDetected === true ? 'warning-outline' : water.leakDetected === null ? 'help-circle-outline' : 'water-outline'}
              size={15} color={water.leakDetected === true ? theme.colors.alarmText : water.leakDetected === null ? theme.colors.warningText : theme.colors.accentText} />
            <Text accessibilityLiveRegion="polite" style={[styles.leakText, water.leakDetected === true && styles.leakAlertText, water.leakDetected === null && styles.leakUnknownText]}>{leakLabel}</Text>
          </View>
          <View style={styles.budget} role="group" accessibilityLabel="Water budget preference, steps of 20 litres">
            <WaterKey label="Decrease water budget" icon="remove" disabled={disabled || water.budgetL <= water.budgetMin} onPress={() => run('budgetDown')} style={styles.keyCircle} />
            <View style={styles.budgetReading}><Text style={styles.caption}>BUDGET PREFERENCE</Text><Text accessibilityLiveRegion="polite"
              accessibilityLabel={`Water budget preference: ${water.budgetL} litres`} style={styles.budgetValue}>{water.budgetL} L</Text></View>
            <WaterKey label="Increase water budget" icon="add" disabled={disabled || water.budgetL >= water.budgetMax} onPress={() => run('budgetUp')} style={styles.keyCircle} />
          </View>
          <View style={[styles.choices, largeText && styles.choicesLarge]}>
            <PreferenceKey label="Leak alerts" checked={water.leakAlerts} disabled={disabled} wide largeText={largeText} onPress={() => choose('waterLeakAlerts', !water.leakAlerts)} />
            <PreferenceKey label="Pressure alerts" checked={water.pressureAlerts} disabled={disabled} wide largeText={largeText} onPress={() => choose('waterPressureAlerts', !water.pressureAlerts)} />
          </View>
          <Text style={styles.feedback}>Alerts are saved preferences · No valve connected</Text>
        </>}
        {disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
      </LinearGradient>
    </LinearGradient>
  </ScrollView>;
}
