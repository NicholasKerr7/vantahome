import React, { useId } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import {
  BATTERY_RESERVE_PRESETS, BATTERY_STORAGE_OPTIONS, GENERATOR_MODE_OPTIONS, energyActionId,
  formatEnergyReading, readEnergyControllerState, type EnergyReading,
} from '../../../packages/home-scene/src/energyController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { energyControllerMaterials, energyControllerStyles as styles } from './EnergyControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; onMore: () => void;
}
type EnergyState = NonNullable<ReturnType<typeof readEnergyControllerState>>;
type EnergyAction = Parameters<typeof energyActionId>[0];
type EnergyField = 'storageMode' | 'reservePercent' | 'generatorMode';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface KeyProps {
  label: string; text?: string; icon?: IconName; disabled?: boolean; active?: boolean;
  choice?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}
const TITLES = { energy: 'ENERGY', solar: 'SOLAR', battery: 'BATTERY', generator: 'GENERATOR' } as const;

/** Expose tactile actions and checked preferences consistently on native devices and the web. */
function EnergyKey({ label, text, icon, disabled = false, active = false, choice = false, onPress, style }: KeyProps) {
  return <Pressable accessibilityRole={choice ? 'radio' : 'button'} accessibilityLabel={label}
    aria-checked={choice ? active : undefined} accessibilityState={choice ? { disabled, checked: active } : { disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, active && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={20} color={theme.colors.text} />}
    {text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Static meter circuitry suggests the appliance's connections without claiming measured flow direction. */
function MeterArtwork({ gradient, available }: { gradient: string; available: boolean | null }) {
  return <G>
    <Path d="M44 126 L44 99 L78 84 M196 126 L196 99 L162 84" fill="none" stroke="#69547D" strokeWidth={2} />
    <Circle cx={44} cy={126} r={5} fill="#BA9CDA" /><Circle cx={196} cy={126} r={5} fill="#BA9CDA" />
    <Path d="M78 42 L120 24 L164 42 L164 110 L120 133 L78 111 Z" fill={`url(#${gradient})`} stroke="#9C80B3" />
    <Path d="M78 42 L120 62 L164 42 M120 62 L120 133" fill="none" stroke="#A68BBB" opacity={0.65} />
    <Path d="M90 53 L113 64 L113 96 L90 85 Z" fill="#130F1D" stroke="#77608D" />
    <Path d="M95 63 L109 70 M95 69 L109 76 M95 75 L105 80" stroke={available ? '#DCC6FF' : '#75657B'} strokeWidth={2} />
    <Path d="M129 70 L151 59 L151 87 L129 99 Z" fill="#21182F" stroke="#6E557F" />
    <Circle cx={139} cy={82} r={4} fill={available ? '#CCAEF7' : '#706475'} />
    <Path d="M89 103 L112 114 M129 116 L153 104" stroke="#77608D" strokeWidth={2} />
  </G>;
}

/** The battery face shows only its sampled charge; there is no animated charging or reserve movement. */
function BatteryArtwork({ gradient, charge }: { gradient: string; charge: number | null }) {
  const fillHeight = charge === null ? 0 : Math.max(0, Math.min(100, charge)) * 0.57;
  return <G>
    <Path d="M85 38 L125 22 L159 39 L159 122 L119 140 L85 122 Z" fill={`url(#${gradient})`} stroke="#A88CC0" />
    <Path d="M85 38 L119 55 L159 39 M119 55 L119 140" fill="none" stroke="#A88CC0" opacity={0.6} />
    <Path d="M101 30 L122 21 L139 29 L118 38 Z" fill="#C4AED8" stroke="#E0CFEB" />
    <Rect x={128} y={61} width={21} height={59} rx={3} fill="#160F20" stroke="#756183" />
    <Rect testID="energy-battery-charge-fill" x={130} y={119 - fillHeight} width={17} height={fillHeight} rx={2} fill="#B18CDD" />
    <Path d="M128 79 L149 79 M128 99 L149 99" stroke="#342641" strokeWidth={2} />
    <Path d="M96 65 L106 70 L100 81 L108 86 L95 104 L99 89 L92 85 Z" fill="#D5BCED" opacity={0.7} />
  </G>;
}

/** An isometric panel grid represents this solar sample without implying live sunlight or generation speed. */
function SolarArtwork({ gradient }: { gradient: string }) {
  return <G>
    <Path d="M72 106 L72 132 M163 100 L163 127 M59 136 L83 136 M151 131 L175 131" stroke="#8E739F" strokeWidth={4} />
    <Path d="M43 65 L158 32 L198 91 L81 125 Z" fill={`url(#${gradient})`} stroke="#C7ACDF" strokeWidth={2} />
    <Path d="M49 67 L156 37 L191 88 L83 119 Z" fill="#32274C" stroke="#9C7DC3" />
    <Path d="M74 59 L109 111 M101 52 L136 104 M129 44 L163 96 M60 84 L168 53 M71 101 L180 71" stroke="#AB87D0" strokeWidth={1} opacity={0.8} />
    <Path d="M44 68 L80 127 L198 93" fill="none" stroke="#756080" strokeWidth={3} />
    <Path d="M55 68 L149 42" stroke="#E3CBF5" strokeWidth={1} opacity={0.75} />
  </G>;
}

/** The generator indicator follows confirmed power while its static enclosure makes no motor-state claim. */
function GeneratorArtwork({ gradient, on }: { gradient: string; on: boolean }) {
  return <G>
    <Path d="M52 65 L135 38 L188 61 L188 115 L104 143 L52 120 Z" fill={`url(#${gradient})`} stroke="#A78DB7" />
    <Path d="M52 65 L104 88 L188 61 M104 88 L104 143" fill="none" stroke="#BBA0CE" opacity={0.65} />
    <Path d="M86 52 L86 40 L123 29 L151 40 L151 48" fill="none" stroke="#BD9FD2" strokeWidth={4} />
    <Path d="M118 94 L174 76 L174 112 L118 130 Z" fill="#17121F" stroke="#685374" />
    <Path d="M125 95 L167 82 M125 102 L167 89 M125 109 L167 96 M125 116 L167 103" stroke="#80658E" strokeWidth={2} />
    <Path d="M62 79 L92 92 L92 114 L62 101 Z" fill="#20172B" stroke="#786186" />
    <Circle cx={73} cy={94} r={4} fill={on ? '#D4B4F8' : '#6B5D75'} />
    <Path d="M61 122 L61 132 M174 121 L174 132" stroke="#A78DB7" strokeWidth={5} />
  </G>;
}

/** One lightweight static SVG renders only the selected device, with no animation or scene subscriptions. */
function EnergyArtwork({ energy, compact }: { energy: EnergyState; compact: boolean }) {
  const gradient = `${useId().replace(/:/g, '')}-energy-metal`;
  return <View testID={`energy-preview-${energy.kind}`} style={[styles.preview, compact && styles.previewCompact]}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%" viewBox="0 0 240 160" aria-hidden>
      <Defs><SvgGradient id={gradient} x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0" stopColor="#776387" /><Stop offset="0.45" stopColor="#493953" /><Stop offset="1" stopColor="#21172E" />
      </SvgGradient></Defs>
      <Ellipse cx={120} cy={139} rx={91} ry={15} fill="#100B17" opacity={0.7} />
      <Path d="M33 128 L117 151 L208 127" fill="none" stroke="#513C66" strokeWidth={1} />
      {energy.kind === 'energy' && <MeterArtwork gradient={gradient} available={energy.gridAvailable} />}
      {energy.kind === 'battery' && <BatteryArtwork gradient={gradient} charge={energy.chargePercent} />}
      {energy.kind === 'solar' && <SolarArtwork gradient={gradient} />}
      {energy.kind === 'generator' && <GeneratorArtwork gradient={gradient} on={energy.on} />}
    </Svg>
  </View>;
}

/** Keep sampled measurements separate from controls and retain explicit units for assistive technology. */
function EnergyMetric({ reading, largeText, halfWidth }: { reading: EnergyReading; largeText: boolean; halfWidth: boolean }) {
  const formatted = formatEnergyReading(reading);
  return <View accessible accessibilityLabel={`${reading.label}: ${formatted.value} ${formatted.unit}`.trim()}
    style={[styles.metric, halfWidth && styles.metricHalf, largeText && styles.metricLarge]}>
    <Text style={styles.metricValue}>{formatted.value}{formatted.unit ? ` ${formatted.unit}` : ''}</Text>
    <Text style={styles.metricLabel}>{reading.label}</Text>
  </View>;
}

/** Clearly label saved-only mode and reserve preferences without suggesting automatic operation. */
function EnergyChoices({ label, options, selected, disabled, largeText, onChoose }: {
  label: string; options: readonly { label: string; value: string | number }[]; selected: string | number;
  disabled: boolean; largeText: boolean; onChoose: (value: string | number) => void;
}) {
  return <View style={styles.section}>
    <Text style={styles.sectionLabel}>{label}</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.choices, largeText && styles.choicesLarge]}>
      {options.map((option) => <EnergyKey key={option.value} label={`${label}: ${option.label}`} text={option.label}
        choice active={selected === option.value} disabled={disabled} onPress={() => onChoose(option.value)}
        style={[styles.keyWide, largeText && styles.choiceLarge]} />)}
    </View>
  </View>;
}

/** A selected-device energy console preserves the existing guarded, persisted simulation command paths. */
export function EnergyController({ device, state, client, disabled, compact, fontScale, onMore }: Props) {
  const energy = readEnergyControllerState(device, state);
  const largeText = fontScale > 1.15;
  if (!energy) return null;
  const headline = formatEnergyReading(energy.headline);

  /** Only a validated grid simulation action is dispatched; displayed sample totals are never patched. */
  function run(action: EnergyAction): void { if (!disabled) client.runAction(device.id, energyActionId(action)); }

  /** Persist the chosen configuration without changing state of charge, power, or simulated output. */
  function choose(field: EnergyField, value: string | number): void { if (!disabled) client.setSetting(device.id, field, value); }

  return <ScrollView testID="energy-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="energy-tactile-controller" colors={energyControllerMaterials.edge} style={[styles.shell, compact && styles.shellCompact]}>
      <LinearGradient colors={energyControllerMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={[styles.row, styles.header]}>
          {energy.kind === 'battery'
            ? <EnergyKey label={energy.on ? 'Disable battery preview' : 'Enable battery preview'} icon="power"
              active={energy.on} disabled={disabled} onPress={() => { if (!disabled) client.toggle(device.id); }} style={styles.keyCircle} />
            : <View style={styles.emblem} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Ionicons accessible={false} name="flash-outline" size={22} color={theme.colors.accentText} />
            </View>}
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>{TITLES[energy.kind]}</Text></View>
          <EnergyKey label="More energy controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <EnergyArtwork energy={energy} compact={compact} />
        <View accessible accessibilityLabel={`${energy.headline.label}: ${headline.value} ${headline.unit}. ${energy.status}`}
          accessibilityLiveRegion="polite" style={styles.reading}>
          <Text style={[styles.value, compact && styles.valueCompact]}>{headline.value}{headline.unit ? ` ${headline.unit}` : ''}</Text>
          <Text style={styles.caption}>{energy.headline.label.toUpperCase()}</Text>
          <Text style={styles.status}>{energy.status}</Text>
        </View>
        <View style={styles.metrics}>{energy.metrics.map((reading) => <EnergyMetric key={reading.label} reading={reading}
          largeText={largeText} halfWidth={energy.metrics.length > 2} />)}</View>
        {energy.primaryActionLabel && <EnergyKey label={energy.primaryActionLabel} text={energy.primaryActionLabel} disabled={disabled}
          active={energy.kind === 'generator' && energy.on} onPress={() => { if (!disabled) client.toggle(device.id); }} />}
        {energy.kind === 'energy' && <View style={[styles.choices, largeText && styles.choicesLarge]}>
          <EnergyKey label="Simulate grid outage" text="Grid outage" disabled={disabled || energy.gridAvailable === false}
            onPress={() => run('outage')} style={[styles.keyWide, largeText && styles.choiceLarge]} />
          <EnergyKey label="Restore sample grid" text="Restore grid" disabled={disabled || energy.gridAvailable === true}
            onPress={() => run('restoreGrid')} style={[styles.keyWide, largeText && styles.choiceLarge]} />
        </View>}
        {energy.kind === 'battery' && <>
          <EnergyChoices label="Reserve preference" options={BATTERY_RESERVE_PRESETS} selected={energy.reservePercent}
            disabled={disabled} largeText={largeText} onChoose={(value) => choose('reservePercent', value)} />
          <EnergyChoices label="Storage preference" options={BATTERY_STORAGE_OPTIONS} selected={energy.storageMode}
            disabled={disabled} largeText={largeText} onChoose={(value) => choose('storageMode', value)} />
          <Text style={styles.feedback}>Reserve and mode: saved preferences only · No simulated charging.</Text>
        </>}
        {energy.kind === 'generator' && <>
          <EnergyChoices label="Start mode preference" options={GENERATOR_MODE_OPTIONS} selected={energy.mode}
            disabled={disabled} largeText={largeText} onChoose={(value) => choose('generatorMode', value)} />
          <Text style={styles.feedback}>Start mode: saved preference only · No automatic start.</Text>
        </>}
        <Text style={styles.feedback}>{disabled ? 'View only · Controls unavailable' : 'Local sample · Simulation'}</Text>
      </LinearGradient>
    </LinearGradient>
  </ScrollView>;
}
