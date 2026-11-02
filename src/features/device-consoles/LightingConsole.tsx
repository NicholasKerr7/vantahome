import React, { useId } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { LIGHT_COLOR_PRESETS, LIGHT_WHITE_PRESETS } from '../../../packages/home-scene/src/deviceControlCatalog';
import type { LightingConsoleActions, LightingConsoleModel } from './lightingConsoleModel';
import { lightingControllerMaterials, lightingControllerStyles as styles } from '../three-d-home/LightingControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  model: LightingConsoleModel;
  actions: LightingConsoleActions;
  disabled: boolean;
  compact: boolean;
  fontScale: number;
  onMore?: () => void;
}
type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface KeyProps {
  label: string; icon?: IconName; text?: string; hint?: string; swatch?: string;
  disabled?: boolean; active?: boolean; choice?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}

/** Each tactile key exposes the same checked state on native devices and React Native Web. */
function LightingKey({ label, icon, text, hint, swatch, disabled = false, active = false, choice = false, onPress, style }: KeyProps) {
  return <Pressable accessibilityRole={choice ? 'radio' : 'button'} accessibilityLabel={label} aria-checked={choice ? active : undefined}
    accessibilityState={choice ? { disabled, checked: active } : { disabled }} disabled={disabled} onPress={() => { if (!disabled) onPress(); }}
    style={({ pressed }) => [styles.key, style, active && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={20} color={active ? theme.colors.accentText : theme.colors.text} />}
    {swatch && <Svg width={16} height={16} viewBox="0 0 16 16" aria-hidden><Circle cx={8} cy={8} r={6} fill={swatch} stroke="#EEE3FA" strokeWidth={0.8} /></Svg>}
    {text && <Text style={styles.keyLabel}>{text}</Text>}
    {hint && <Text style={styles.keyHint}>{hint}</Text>}
  </Pressable>;
}

/** Steady opal artwork reflects accepted output only; unknown power and brightness never emit light. */
function LightPreview({ lighting, compact, brightnessKnown }: { lighting: LightingConsoleModel; compact: boolean; brightnessKnown: boolean }) {
  const id = useId().replace(/:/g, '');
  const glowId = `${id}-lighting-glow`;
  const faceId = `${id}-lighting-face`;
  const emission = lighting.on === true && brightnessKnown && Number.isFinite(lighting.previewBrightness)
    ? Math.min(100, Math.max(0, lighting.previewBrightness)) / 100 : 0;
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

/** Render supported lighting controls without owning identity, persistence, transport or simulation state. */
export function LightingConsole({ model, actions, disabled, compact, fontScale, onMore }: Props) {
  const largeText = fontScale > 1.15;
  const { capabilities } = model;
  const brightnessRange = capabilities.brightness;
  const brightness = brightnessRange && model.brightness !== null && Number.isFinite(model.brightness)
    && model.brightness >= brightnessRange.min && model.brightness <= brightnessRange.max ? model.brightness : null;
  const powerKnown = model.on !== null;
  const powerLabel = powerKnown ? (model.on ? 'on' : 'off') : 'unavailable';
  const temperatureRange = capabilities.temperature;
  const whitePresets = temperatureRange
    ? LIGHT_WHITE_PRESETS.filter(({ value }) => value >= temperatureRange.min && value <= temperatureRange.max) : [];
  const showWhite = temperatureRange !== null && (!capabilities.color || model.colorMode === 'temperature');
  const showColor = capabilities.color && (temperatureRange === null || model.colorMode === 'color');
  const dimmer = brightnessRange && <LightingKey label={`Dim light by ${brightnessRange.step} percent`} text={`−${brightnessRange.step}`}
    disabled={disabled || brightness === null || brightness <= brightnessRange.min}
    onPress={() => actions.adjustBrightness(-1)} style={styles.keyCircle} />;
  const brighter = brightnessRange && <LightingKey label={`Brighten light by ${brightnessRange.step} percent`} text={`+${brightnessRange.step}`}
    disabled={disabled || brightness === null || brightness >= brightnessRange.max}
    onPress={() => actions.adjustBrightness(1)} style={styles.keyCircle} />;
  const readingLabel = brightnessRange
    ? `${brightness === null ? 'Brightness unavailable' : `Brightness ${brightness} percent`}. Light ${powerLabel}`
    : `Light ${powerLabel}`;
  const readingValue = brightnessRange
    ? brightness === null ? '—' : `${brightness}%`
    : powerKnown ? model.on ? 'On' : 'Off' : '—';
  const readingStatus = !powerKnown ? 'Power unavailable'
    : brightnessRange && brightness === null ? 'Unavailable' : model.status;

  return <ScrollView testID="lighting-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="lighting-tactile-controller" colors={lightingControllerMaterials.edge} style={[styles.shell, compact && styles.shellCompact]}>
      <LinearGradient colors={lightingControllerMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={[styles.row, styles.header]}>
          {capabilities.power
            ? <LightingKey label={powerKnown ? model.on ? 'Turn light off' : 'Turn light on' : 'Light power unavailable'} icon="power"
              active={model.on === true} disabled={disabled || !powerKnown} onPress={actions.toggle} style={styles.keyCircle} />
            : <View testID="lighting-power-placeholder" style={styles.keyCircle} />}
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>LIGHTING</Text></View>
          {onMore
            ? <LightingKey label="More lighting controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
            : <View testID="lighting-more-placeholder" style={styles.keyCircle} />}
        </View>
        <LightPreview lighting={model} compact={compact} brightnessKnown={brightnessRange === null || brightness !== null} />
        <View style={[styles.brightnessRow, largeText && styles.brightnessLarge]}>
          {!largeText && dimmer}
          <View accessible accessibilityLabel={readingLabel}
            accessibilityLiveRegion="polite" style={[styles.reading, largeText && styles.readingLarge]}>
            <Text style={[styles.value, compact && styles.valueCompact]}>{readingValue}</Text>
            <Text style={styles.caption}>{brightnessRange ? 'BRIGHTNESS' : 'POWER'} · {readingStatus.toUpperCase()}</Text>
          </View>
          {!largeText && brighter}
          {largeText && brightnessRange && <View style={styles.adjustersLarge}>{dimmer}{brighter}</View>}
        </View>
        {temperatureRange !== null && capabilities.color && <View accessibilityRole="radiogroup" accessibilityLabel="Light mode" style={styles.row}>
          <LightingKey label="White light mode" text="White" choice active={model.manual && model.colorMode === 'temperature'} disabled={disabled}
            onPress={() => actions.setMode('temperature')} style={styles.keyWide} />
          <LightingKey label="Color light mode" text="Color" choice active={model.manual && model.colorMode === 'color'} disabled={disabled}
            onPress={() => actions.setMode('color')} style={styles.keyWide} />
        </View>}
        {showWhite && whitePresets.length > 0 && <View accessibilityRole="radiogroup" accessibilityLabel="White temperature presets" style={[styles.presets, largeText && styles.optionsLarge]}>
          {whitePresets.map((preset) => <LightingKey key={preset.value} label={`${preset.label} white: ${preset.value} kelvin`}
            text={preset.label} hint={`${preset.value}K`} choice active={model.manual && model.temperatureK === preset.value} disabled={disabled}
            onPress={() => actions.setTemperature(preset.value)} style={[styles.preset, largeText && styles.optionLarge]} />)}
        </View>}
        {showColor && <View accessibilityRole="radiogroup" accessibilityLabel="Light color presets" style={[styles.presets, styles.palette]}>
          {LIGHT_COLOR_PRESETS.map((preset) => <LightingKey key={preset.value} label={`${preset.label} light color`} text={preset.label} swatch={preset.value}
            choice active={model.manual && model.color?.toUpperCase() === preset.value.toUpperCase()} disabled={disabled}
            onPress={() => actions.setColor(preset.value)} style={[styles.preset, styles.colorPreset, largeText && styles.optionLarge]} />)}
        </View>}
        <Text style={styles.feedback}>{model.feedback}</Text>
      </LinearGradient>
    </LinearGradient>
  </ScrollView>;
}
