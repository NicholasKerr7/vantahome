import React, { useId } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { LIGHT_COLOR_PRESETS, LIGHT_WHITE_PRESETS, lightingActionId, readLightingControllerState } from '../../../packages/home-scene/src/lightingController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { lightingControllerMaterials, lightingControllerStyles as styles } from './LightingControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; onMore: () => void;
}
type LightingState = ReturnType<typeof readLightingControllerState>;
type LightingAction = Parameters<typeof lightingActionId>[0];
type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface KeyProps {
  label: string; icon?: IconName; text?: string; hint?: string; swatch?: string;
  disabled?: boolean; active?: boolean; choice?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}

/** Each tactile key exposes the same checked state on native devices and React Native Web. */
function LightingKey({ label, icon, text, hint, swatch, disabled = false, active = false, choice = false, onPress, style }: KeyProps) {
  return <Pressable accessibilityRole={choice ? 'radio' : 'button'} accessibilityLabel={label} aria-checked={choice ? active : undefined}
    accessibilityState={choice ? { disabled, checked: active } : { disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, active && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={20} color={active ? theme.colors.accentText : theme.colors.text} />}
    {swatch && <Svg width={16} height={16} viewBox="0 0 16 16" aria-hidden><Circle cx={8} cy={8} r={6} fill={swatch} stroke="#EEE3FA" strokeWidth={0.8} /></Svg>}
    {text && <Text style={styles.keyLabel}>{text}</Text>}
    {hint && <Text style={styles.keyHint}>{hint}</Text>}
  </Pressable>;
}

/** Opal material reflects only effective simulation output; off and on-at-zero both have no emitted light. */
function LightPreview({ lighting, compact }: { lighting: LightingState; compact: boolean }) {
  const id = useId().replace(/:/g, '');
  const glowId = `${id}-lighting-glow`;
  const faceId = `${id}-lighting-face`;
  const emission = lighting.on ? lighting.previewBrightness / 100 : 0;
  return <View testID="lighting-opal-preview" style={[styles.orb, compact && styles.orbCompact]}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%" viewBox="0 0 200 200" aria-hidden>
      <Defs>
        <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={lighting.previewColor} stopOpacity={0.85} />
          <Stop offset="0.7" stopColor={lighting.previewColor} stopOpacity={0.18} />
          <Stop offset="1" stopColor={lighting.previewColor} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={faceId} cx="38%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#FFF9F3" /><Stop offset="0.45" stopColor={lighting.previewColor} />
          <Stop offset="1" stopColor={lighting.previewColor} stopOpacity={0.6} />
        </RadialGradient>
      </Defs>
      <Circle testID="lighting-preview-glow" cx={100} cy={100} r={98} fill={`url(#${glowId})`} opacity={emission} />
      <Circle cx={100} cy={100} r={78} fill="#100C18" stroke="#80668E" strokeWidth={1} />
      <Circle cx={100} cy={100} r={72} fill="#292330" stroke="#51405C" strokeWidth={2} />
      <Circle testID="lighting-preview-emission" cx={100} cy={100} r={70} fill={`url(#${faceId})`} opacity={emission} />
      <Ellipse cx={82} cy={65} rx={32} ry={17} fill="#FFFFFF" opacity={0.04 + emission * 0.18} />
      <Circle cx={100} cy={100} r={72} fill="none" stroke="#DCCAE8" strokeWidth={0.5} opacity={0.35} />
    </Svg>
  </View>;
}

/** Describe remembered effects separately from effective output and avoid claiming that an off light is illuminated. */
function lightingFeedback(lighting: LightingState): string {
  if (lighting.effectLabel) return lighting.on
    ? `${lighting.effectLabel} effect · Preview ${Math.round(lighting.previewBrightness)}%`
    : `${lighting.effectLabel} effect remembered · Light off`;
  if (!lighting.on) return 'Off · Your settings are remembered';
  return lighting.brightness === 0 ? 'On · Brightness 0%' : 'Local light preview · Simulation';
}

/** Lighting commands reuse guarded saved state; only the explicit power key changes power. */
export function LightingController({ device, state, client, disabled, compact, fontScale, onMore }: Props) {
  const lighting = readLightingControllerState(device, state);
  const largeText = fontScale > 1.15;
  const manual = lighting.effect === 'none';

  /** Shared relative actions resolve rapid presses against current state and preserve the current power flag. */
  function run(action: LightingAction): void { if (!disabled) client.runAction(device.id, lightingActionId(action)); }

  /** Manual presets clear effects through the validated setting path without turning the light on. */
  function chooseSetting(field: 'color' | 'colorTempK', value: string | number): void {
    if (!disabled) client.setSetting(device.id, field, value);
  }

  const dimmer = <LightingKey label="Dim light by 5 percent" text="−5" disabled={disabled || lighting.brightness <= 0}
    onPress={() => run('dimmer')} style={styles.keyCircle} />;
  const brighter = <LightingKey label="Brighten light by 5 percent" text="+5" disabled={disabled || lighting.brightness >= 100}
    onPress={() => run('brighter')} style={styles.keyCircle} />;

  return <ScrollView testID="lighting-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="lighting-tactile-controller" colors={lightingControllerMaterials.edge} style={[styles.shell, compact && styles.shellCompact]}>
      <LinearGradient colors={lightingControllerMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={[styles.row, styles.header]}>
          <LightingKey label={lighting.on ? 'Turn light off' : 'Turn light on'} icon="power" active={lighting.on} disabled={disabled}
            onPress={() => { if (!disabled) client.toggle(device.id); }} style={styles.keyCircle} />
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>LIGHTING</Text></View>
          <LightingKey label="More lighting controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <LightPreview lighting={lighting} compact={compact} />
        <View style={[styles.brightnessRow, largeText && styles.brightnessLarge]}>
          {!largeText && dimmer}
          <View accessible accessibilityLabel={`Brightness ${lighting.brightness} percent. Light ${lighting.on ? 'on' : 'off'}`}
            accessibilityLiveRegion="polite" style={[styles.reading, largeText && styles.readingLarge]}>
            <Text style={[styles.value, compact && styles.valueCompact]}>{lighting.brightness}%</Text>
            <Text style={styles.caption}>BRIGHTNESS · {lighting.status.toUpperCase()}</Text>
          </View>
          {!largeText && brighter}
          {largeText && <View style={styles.adjustersLarge}>{dimmer}{brighter}</View>}
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Light mode" style={styles.row}>
          <LightingKey label="White light mode" text="White" choice active={manual && lighting.colorMode === 'temperature'} disabled={disabled}
            onPress={() => run('white')} style={styles.keyWide} />
          <LightingKey label="Color light mode" text="Color" choice active={manual && lighting.colorMode === 'color'} disabled={disabled}
            onPress={() => run('color')} style={styles.keyWide} />
        </View>
        {lighting.colorMode === 'temperature'
          ? <View accessibilityRole="radiogroup" accessibilityLabel="White temperature presets" style={[styles.presets, largeText && styles.optionsLarge]}>
            {LIGHT_WHITE_PRESETS.map((preset) => <LightingKey key={preset.value} label={`${preset.label} white: ${preset.value} kelvin`}
              text={preset.label} hint={`${preset.value}K`} choice active={manual && lighting.temperatureK === preset.value} disabled={disabled}
              onPress={() => chooseSetting('colorTempK', preset.value)} style={[styles.preset, largeText && styles.optionLarge]} />)}
          </View>
          : <View accessibilityRole="radiogroup" accessibilityLabel="Light color presets" style={[styles.presets, styles.palette]}>
            {LIGHT_COLOR_PRESETS.map((preset) => <LightingKey key={preset.value} label={`${preset.label} light color`} text={preset.label} swatch={preset.value}
              choice active={manual && lighting.color.toUpperCase() === preset.value.toUpperCase()} disabled={disabled}
              onPress={() => chooseSetting('color', preset.value)} style={[styles.preset, styles.colorPreset, largeText && styles.optionLarge]} />)}
          </View>}
        <Text style={styles.feedback}>{disabled ? 'View only · Controls unavailable' : lightingFeedback(lighting)}</Text>
      </LinearGradient>
    </LinearGradient>
  </ScrollView>;
}
