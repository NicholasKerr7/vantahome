import React, { useId } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { VACUUM_MODE_OPTIONS, readVacuumControllerState, vacuumControllerActionId, vacuumMaintenanceSummary } from '../../../packages/home-scene/src/vacuumController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { vacuumControllerMaterials, vacuumControllerStyles as styles } from './VacuumControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; onMore: () => void;
}
type VacuumState = NonNullable<ReturnType<typeof readVacuumControllerState>>;
type VacuumAction = Parameters<typeof vacuumControllerActionId>[0];
type VacuumField = 'vacuumMode' | 'vacuumMop' | 'vacuumQuietMode';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface KeyProps {
  label: string; text?: string; icon?: IconName; disabled?: boolean; active?: boolean;
  role?: 'button' | 'radio'; onPress: () => void; style?: StyleProp<ViewStyle>;
}

/** Recessed buttons expose accepted mode state and preserve generous touch targets. */
function VacuumKey({ label, text, icon, disabled = false, active = false, role = 'button', onPress, style }: KeyProps) {
  return <Pressable accessibilityRole={role} accessibilityLabel={label}
    aria-checked={role === 'radio' ? active : undefined}
    accessibilityState={role === 'radio' ? { disabled, checked: active } : { disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, active && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={19} color={theme.colors.text} />}
    {text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** A fixed studio model shows accepted activity through its indicator, never an invented route. */
function VacuumArtwork({ activity, compact }: { activity: VacuumState['activity']; compact: boolean }) {
  const id = useId().replace(/:/g, '');
  const shell = `${id}-vacuum-shell`;
  const lid = `${id}-vacuum-lid`;
  const indicator = activity === 'cleaning' ? '#E1BAFF' : activity === 'paused' ? '#DCC096' : '#796B8E';
  return <View testID="vacuum-preview-model" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.artwork, compact && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox="0 0 320 170" aria-hidden>
      <Defs>
        <SvgGradient id={shell} x1="0%" y1="0%" x2="100%" y2="70%">
          <Stop offset="0" stopColor="#AC97BF" /><Stop offset="0.35" stopColor="#675574" />
          <Stop offset="0.65" stopColor="#362A43" /><Stop offset="1" stopColor="#191222" />
        </SvgGradient>
        <SvgGradient id={lid} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor="#84718E" /><Stop offset="0.45" stopColor="#34283F" /><Stop offset="1" stopColor="#201828" />
        </SvgGradient>
      </Defs>
      <Ellipse cx={160} cy={149} rx={109} ry={13} fill="#08050F" opacity={0.7} />
      <Path d="M114 22 Q114 12 124 12 L196 12 Q206 12 206 22 L206 74 L114 74 Z"
        fill="#30253B" stroke="#7A668C" strokeWidth={1.5} />
      <Rect x={123} y={21} width={74} height={45} rx={7} fill="#18121F" stroke="#4B3A5C" />
      <Path d="M148 34 L172 34" stroke={activity === 'docked' ? '#C2A2E3' : '#665671'} strokeWidth={3} strokeLinecap="round" />
      <Path d="M108 68 L212 68 L227 83 L93 83 Z" fill="#46374F" stroke="#80678D" />
      <Path d="M71 97 C71 42 249 42 249 97 L249 116 C249 164 71 164 71 116 Z" fill={`url(#${shell})`} stroke="#AE92C0" strokeWidth={1.5} />
      <Ellipse cx={160} cy={96} rx={89} ry={42} fill={`url(#${lid})`} stroke="#C4ABD3" strokeWidth={1.5} />
      <Ellipse cx={160} cy={96} rx={78} ry={34} fill="none" stroke="#91769F" opacity={0.65} />
      <Path d="M90 114 Q160 147 230 114" fill="none" stroke={indicator} strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M79 117 Q160 158 241 117" fill="none" stroke="#1A1123" strokeWidth={5} />
      <Rect x={144} y={125} width={32} height={7} rx={3.5} fill="#100A18" stroke="#5D4970" />
      <Path d="M139 75 L139 67 C139 52 181 52 181 67 L181 75" fill={`url(#${shell})`} stroke="#AE93BE" />
      <Ellipse cx={160} cy={66} rx={21} ry={10} fill="#4C3D59" stroke="#C1A6CF" />
      <Ellipse cx={160} cy={65} rx={14} ry={6} fill="#211729" />
      <Circle cx={160} cy={94} r={6} fill="#251B31" stroke={indicator} />
      <Path d="M160 89 L160 94 M157 92 A4 4 0 1 0 163 92" fill="none" stroke={indicator} strokeWidth={1.3} strokeLinecap="round" />
      <Path d="M99 143 L88 152 M99 143 L82 143 M221 143 L232 152 M221 143 L238 143" stroke="#897199" strokeWidth={3} strokeLinecap="round" />
    </Svg>
  </View>;
}

/** Mode preferences remain editable while docked without starting a cleaning cycle. */
function PreferenceKey({ label, text, icon, checked, disabled, largeText, onPress }: {
  label: string; text: string; icon: IconName; checked: boolean; disabled: boolean; largeText: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked, disabled }}
    aria-checked={checked} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, styles.keyWide, styles.preference, largeText && styles.keyLarge, checked && styles.keyActive,
      disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    <Ionicons accessible={false} name={icon} size={16} color={theme.colors.accentText} />
    <Text style={styles.preferenceLabel}>{text}</Text><Text style={styles.preferenceValue}>{checked ? 'On' : 'Off'}</Text>
  </Pressable>;
}

/** Cleaning actions share the guarded simulation client; sample telemetry never advances locally. */
export function VacuumController({ device, state, client, disabled, compact, fontScale, onMore }: Props) {
  const vacuum = readVacuumControllerState(device, state);
  const largeText = fontScale > 1.15;
  if (!vacuum) return null;

  /** Dispatch relative commands against canonical state rather than captured numeric values. */
  function run(action: VacuumAction): void { if (!disabled) client.runAction(device.id, vacuumControllerActionId(action)); }

  /** Write only the selected saved preference; preserve activity, readings and all other settings. */
  function choose(field: VacuumField, value: string | boolean): void { if (!disabled) client.setSetting(device.id, field, value); }

  const cleaning = vacuum.activity === 'cleaning';
  const primaryLabel = cleaning ? 'Pause cleaning' : vacuum.activity === 'paused' ? 'Resume cleaning' : 'Start cleaning';
  const care = vacuumMaintenanceSummary(vacuum);

  return <ScrollView testID="vacuum-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="vacuum-tactile-controller" colors={vacuumControllerMaterials.edge} style={[styles.shell, compact && styles.shellCompact]}>
      <LinearGradient colors={vacuumControllerMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.header}>
          <View style={styles.emblem} accessible={false}><Ionicons accessible={false} name="sparkles-outline" size={20} color={theme.colors.accentText} /></View>
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>CLEANING</Text></View>
          <VacuumKey label="More vacuum controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <View style={styles.hero}>
          <VacuumArtwork activity={vacuum.activity} compact={compact} />
          <View style={[styles.statusRow, largeText && styles.statusRowLarge]}>
            <Text accessibilityLiveRegion="polite" style={styles.status}>{vacuum.status}</Text>
            <Text accessibilityLabel={`Battery sample: ${vacuum.batteryPercent === null ? 'Unavailable' : `${vacuum.batteryPercent}%`}`}
              style={styles.battery}>{vacuum.batteryPercent === null ? '—' : `${vacuum.batteryPercent}%`} · Battery sample</Text>
          </View>
        </View>
        <View style={[styles.row, largeText && styles.rowLarge]}>
          <VacuumKey label={primaryLabel} text={primaryLabel} icon={cleaning ? 'pause' : 'play'} active={cleaning} disabled={disabled}
            onPress={() => run(cleaning ? 'pause' : 'start')} style={[styles.keyWide, styles.keyHorizontal, largeText && styles.keyLarge]} />
          <VacuumKey label="Dock vacuum" text="Dock" icon="home-outline" disabled={disabled || vacuum.activity === 'docked'}
            onPress={() => run('dock')} style={[styles.keyWide, styles.keyHorizontal, largeText && styles.keyLarge]} />
        </View>
        <View style={styles.section}>
          <Text style={styles.caption}>CLEANING MODE PREFERENCE</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Vacuum mode preference" style={[styles.row, largeText && styles.rowLarge]}>
            {VACUUM_MODE_OPTIONS.map((option) => <VacuumKey key={option.value} label={`Vacuum mode: ${option.label}`} text={option.label}
              role="radio" active={vacuum.mode === option.value} disabled={disabled} onPress={() => choose('vacuumMode', option.value)}
              style={[styles.keyWide, largeText && styles.keyLarge]} />)}
          </View>
        </View>
        <View role="group" accessibilityLabel="Suction preference, steps of 10 percent" style={styles.suction}>
          <VacuumKey label="Decrease vacuum suction" icon="remove" disabled={disabled || vacuum.suction <= 0} onPress={() => run('suctionDown')} style={styles.keyCircle} />
          <View style={styles.suctionReading}><Text style={styles.caption}>SUCTION PREFERENCE</Text>
            <Text accessibilityLiveRegion="polite" accessibilityLabel={`Suction preference: ${vacuum.suction}%`} style={styles.suctionValue}>{vacuum.suction}%</Text></View>
          <VacuumKey label="Increase vacuum suction" icon="add" disabled={disabled || vacuum.suction >= 100} onPress={() => run('suctionUp')} style={styles.keyCircle} />
        </View>
        <View style={[styles.row, largeText && styles.rowLarge]}>
          <PreferenceKey label="Vacuum mop preference" text="Mop" icon="water-outline" checked={vacuum.mop} disabled={disabled} largeText={largeText}
            onPress={() => choose('vacuumMop', !vacuum.mop)} />
          <PreferenceKey label="Vacuum quiet preference" text="Quiet" icon="moon-outline" checked={vacuum.quiet} disabled={disabled} largeText={largeText}
            onPress={() => choose('vacuumQuietMode', !vacuum.quiet)} />
        </View>
        {care && <Text accessibilityLiveRegion="polite" style={styles.care}>Care sample · {care}</Text>}
        <Text style={styles.feedback}>Local activity preview · Preferences saved{'\n'}No route or cleaning progress is measured</Text>
        {disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
      </LinearGradient>
    </LinearGradient>
  </ScrollView>;
}
