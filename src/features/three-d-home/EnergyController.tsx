import React from 'react';
import { EnergyConsoleArtwork } from './EnergyConsoleArtwork';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
  const horizontalReading = energy.kind !== 'solar' && !largeText;

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
        <EnergyConsoleArtwork energy={energy} compact={compact} />
        <View accessible accessibilityLabel={`${energy.headline.label}: ${headline.value} ${headline.unit}. ${energy.status}`}
          accessibilityLiveRegion="polite" style={[styles.reading, horizontalReading && styles.readingHorizontal]}>
          <Text style={[styles.value, (compact || horizontalReading) && styles.valueCompact]}>{headline.value}{headline.unit ? ` ${headline.unit}` : ''}</Text>
          <View style={horizontalReading ? styles.readingDetailHorizontal : styles.readingDetail}>
            <Text style={[styles.caption, horizontalReading && styles.readingCaptionHorizontal]}>{energy.headline.label.toUpperCase()}</Text>
            <Text style={[styles.status, horizontalReading && styles.readingCaptionHorizontal]}>{energy.status}</Text>
          </View>
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
