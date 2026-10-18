import React, { useId } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, G, Line, LinearGradient as SvgLinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { BLINDS_POSITION_PRESETS, blindsActionId, getBlindsControllerSlats, readBlindsControllerState } from '../../../packages/home-scene/src/blindsController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { blindsControllerMaterials, blindsControllerStyles as styles } from './BlindsControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; onMore: () => void;
}
type BlindsAction = Parameters<typeof blindsActionId>[0];
type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface KeyProps {
  label: string; icon?: IconName; text?: string; hint?: string; disabled?: boolean; active?: boolean;
  choice?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}

/** Raised buttons expose their confirmed selection and keep the entire key available as a touch target. */
function BlindsKey({ label, icon, text, hint, disabled = false, active = false, choice = false, onPress, style }: KeyProps) {
  return <Pressable accessibilityRole={choice ? 'radio' : 'button'} accessibilityLabel={label}
    aria-checked={choice ? active : undefined}
    accessibilityState={choice ? { disabled, checked: active } : { disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, active && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={20} color={active ? theme.colors.accentText : theme.colors.text} />}
    {text && <Text style={styles.keyLabel}>{text}</Text>}
    {hint && <Text style={styles.keyHint}>{hint}</Text>}
  </Pressable>;
}

/** Shared slat geometry follows saved position directly, without simulating a motor or independent tilt. */
function BlindsWindow({ position, compact }: { position: number; compact: boolean }) {
  const id = useId().replace(/:/g, '');
  const glassId = `${id}-blinds-glass`;
  const slatId = `${id}-blinds-slat`;
  const slats = getBlindsControllerSlats(position);
  const lastSlat = slats[slats.length - 1];
  const bottom = 24 + (lastSlat.y + lastSlat.height) * 152;
  return <LinearGradient testID="blinds-window-preview" colors={blindsControllerMaterials.window}
    style={[styles.window, compact && styles.windowCompact]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%" viewBox="0 0 260 200" aria-hidden>
      <Defs>
        <SvgLinearGradient id={glassId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#8F7EA4" /><Stop offset="0.55" stopColor="#51435F" /><Stop offset="1" stopColor="#302738" />
        </SvgLinearGradient>
        <SvgLinearGradient id={slatId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#C4B6D3" /><Stop offset="0.35" stopColor="#A28EB3" /><Stop offset="1" stopColor="#594561" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={13} y={8} width={234} height={180} rx={8} fill="#0D0914" stroke="#887092" strokeWidth={1.5} />
      <Rect x={22} y={20} width={216} height={158} rx={2} fill={`url(#${glassId})`} />
      <Path d="M 22 20 L 94 20 L 238 153 L 238 178 L 192 178 Z" fill="#D8C7EA" opacity={0.1} />
      <Line x1={130} y1={20} x2={130} y2={178} stroke="#D4C5E0" strokeWidth={3} opacity={0.28} />
      <Line x1={22} y1={105} x2={238} y2={105} stroke="#D4C5E0" strokeWidth={3} opacity={0.18} />
      <G>
        {slats.map((slat, index) => <Rect key={index} testID={`blinds-preview-slat-${index}`} x={20} y={24 + slat.y * 152}
          width={220} height={slat.height * 152} rx={1.2} fill={`url(#${slatId})`} stroke="#4B3857" strokeWidth={0.65} />)}
      </G>
      <Rect x={18} y={bottom} width={224} height={6} rx={2} fill="#B2A1C1" stroke="#4B3857" strokeWidth={1} />
      <Rect x={17} y={14} width={226} height={13} rx={4} fill="#4D3A5C" stroke="#A48BB5" strokeWidth={1} />
      <Line x1={25} y1={17} x2={235} y2={17} stroke="#C4B6D3" strokeWidth={1} opacity={0.65} />
      <Rect x={9} y={186} width={242} height={7} rx={3} fill="#54405F" stroke="#786184" strokeWidth={0.8} />
    </Svg>
  </LinearGradient>;
}

/** A single native panel sends bounded position commands through the existing guarded simulation client. */
export function BlindsController({ device, state, client, disabled, compact, fontScale, onMore }: Props) {
  const blinds = readBlindsControllerState(device, state);
  const largeText = fontScale > 1.25;

  /** Resolve each relative press against current shared state rather than a potentially stale rendered percentage. */
  function run(action: BlindsAction): void { if (!disabled) client.runAction(device.id, blindsActionId(action)); }

  /** Preset percentages reuse the same validated position field as the advanced inspector. */
  function choosePosition(position: number): void { if (!disabled) client.setSetting(device.id, 'openPercent', position); }

  const lower = <BlindsKey label="Lower blinds by 5 percent" text="−5" disabled={disabled || !blinds.canLower}
    onPress={() => run('lower')} style={styles.keyCircle} />;
  const raise = <BlindsKey label="Raise blinds by 5 percent" text="+5" disabled={disabled || !blinds.canRaise}
    onPress={() => run('raise')} style={styles.keyCircle} />;

  return <ScrollView testID="blinds-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="blinds-tactile-controller" colors={blindsControllerMaterials.edge} style={[styles.shell, compact && styles.shellCompact]}>
      <LinearGradient colors={blindsControllerMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={[styles.row, styles.header]}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.emblem}>
            <Ionicons accessible={false} name="grid-outline" size={20} color={theme.colors.accentText} />
          </View>
          <View style={styles.identity}><Text style={styles.title}>BLINDS</Text><Text style={styles.subtitle}>{blinds.status}</Text></View>
          <BlindsKey label="More blinds controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <BlindsWindow position={blinds.position} compact={compact} />
        <View style={[styles.positionRow, largeText && styles.positionLarge]}>
          {!largeText && lower}
          <View accessible accessibilityLabel={`Blinds ${blinds.position} percent open`} accessibilityLiveRegion="polite"
            style={[styles.reading, largeText && styles.readingLarge]}>
            <Text style={[styles.value, compact && styles.valueCompact]}>{blinds.position}%</Text><Text style={styles.caption}>OPEN</Text>
          </View>
          {!largeText && raise}
          {largeText && <View style={styles.adjustersLarge}>{lower}{raise}</View>}
        </View>
        <View style={[styles.row, largeText && styles.optionsLarge]}>
          <BlindsKey label="Open blinds fully" icon="chevron-up" text="Open" active={!blinds.canRaise} disabled={disabled || !blinds.canRaise}
            onPress={() => run('open')} style={[styles.keyWide, largeText && styles.optionLarge]} />
          <BlindsKey label="Close blinds fully" icon="chevron-down" text="Close" active={!blinds.canLower} disabled={disabled || !blinds.canLower}
            onPress={() => run('close')} style={[styles.keyWide, largeText && styles.optionLarge]} />
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Blinds position presets" style={[styles.row, largeText && styles.optionsLarge]}>
          {BLINDS_POSITION_PRESETS.map((preset) => <BlindsKey key={preset.value} label={`${preset.label}: ${preset.value} percent open`} text={preset.label}
            hint={`${preset.value}%`} choice active={blinds.position === preset.value} disabled={disabled} onPress={() => choosePosition(preset.value)}
            style={[styles.preset, largeText && styles.optionLarge]} />)}
        </View>
        <Text style={styles.feedback}>{disabled ? 'View only · Controls unavailable' : 'Local position preview · Simulation'}</Text>
      </LinearGradient>
    </LinearGradient>
  </ScrollView>;
}
