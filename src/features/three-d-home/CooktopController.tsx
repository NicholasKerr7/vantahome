import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { COOKTOP_MODES, COOKTOP_PREVIEW_NOTE, readCooktopControllerState } from '../../../packages/home-scene/src/cooktopController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { CooktopControllerArtwork } from './CooktopControllerArtwork';
import { cooktopControllerMaterials, cooktopControllerStyles as styles } from './CooktopControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition;
  state: DeviceState;
  client: SimulationDeviceControls;
  disabled: boolean;
  compact: boolean;
  fontScale: number;
  onMore: () => void;
}
interface KeyProps {
  label: string;
  text?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean;
  selected?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Give tactile keys independent labels, selectable mode semantics and full-size touch targets. */
function CooktopKey({ label, text, icon, disabled = false, selected, onPress, style }: KeyProps) {
  return <Pressable accessibilityRole={selected === undefined ? 'button' : 'radio'} accessibilityLabel={label} aria-checked={selected}
    accessibilityState={{ disabled, ...(selected === undefined ? {} : { checked: selected }) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, selected && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={18} color={theme.colors.accentText} />}
    {text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Keep one shared heat setting and saved preferences distinct from physical cooking or protection. */
export function CooktopController({ device, state, client, disabled, compact, fontScale, onMore }: Props) {
  const cooktop = readCooktopControllerState(device, state);
  const [viewportHeight, setViewportHeight] = useState(0);
  const compactLayout = compact || (viewportHeight > 0 && viewportHeight < 590);
  const largeText = fontScale > 1.15;

  /** Shrink the decorative appliance before controls when the actual sheet height is constrained. */
  function measureViewport(event: LayoutChangeEvent) {
    const height = event.nativeEvent.layout.height;
    setViewportHeight((current) => current === height ? current : height);
  }
  /** Dispatch relative changes through the canonical client for fresh bounds and access checks. */
  function run(action: string) {
    if (!disabled) client.runAction(device.id, action);
  }
  if (!cooktop) return null;

  return <ScrollView onLayout={measureViewport} testID="cooktop-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="cooktop-tactile-controller" colors={cooktopControllerMaterials.edge} style={styles.shell}>
      <LinearGradient colors={cooktopControllerMaterials.body} style={[styles.body, compactLayout && styles.bodyCompact]}>
        <View style={styles.header}>
          <CooktopKey label={`Turn cooktop preview ${cooktop.on ? 'off' : 'on'}`} icon="power-outline" disabled={disabled}
            onPress={() => { if (!disabled) client.setPower([device.id], !cooktop.on); }} style={[styles.keyCircle, cooktop.on && styles.keyActive]} />
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>COOKTOP</Text></View>
          <CooktopKey label="More cooktop controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <CooktopControllerArtwork on={cooktop.on} heat={cooktop.heat} compact={compactLayout} />
        <Text accessibilityLiveRegion="polite" style={styles.status}>{cooktop.status}</Text>
        <View style={[styles.setting, largeText && styles.settingLarge]}>
          <View style={styles.settingLabel}><Text style={styles.caption}>SHARED HEAT LEVEL</Text><Text style={styles.note}>One setting for the preview</Text></View>
          <View style={styles.stepper}>
            <CooktopKey label="Decrease cooktop heat" icon="remove" disabled={disabled || cooktop.heat === null || cooktop.heat <= 0} onPress={() => run('stove-heat-down')} style={styles.keyStep} />
            <Text accessibilityLabel={`Saved cooktop heat: ${cooktop.heat ?? 'unavailable'} of 10`} style={styles.value}>{cooktop.heat ?? '—'}<Text style={styles.unit}>/10</Text></Text>
            <CooktopKey label="Increase cooktop heat" icon="add" disabled={disabled || cooktop.heat === null || cooktop.heat >= 10} onPress={() => run('stove-heat-up')} style={styles.keyStep} />
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.caption}>MODE PREFERENCE</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Cooktop mode preference" style={[styles.row, largeText && styles.rowLarge]}>
            {COOKTOP_MODES.map(({ value, label }) => <CooktopKey key={value} label={`Cooktop mode: ${label}`} text={label} selected={cooktop.mode === value} disabled={disabled}
              onPress={() => { if (!disabled) client.setSetting(device.id, 'stoveMode', value); }} style={[styles.keyWide, largeText && styles.keyLarge]} />)}
          </View>
        </View>
        <View style={[styles.setting, largeText && styles.settingLarge]}>
          <View style={styles.settingLabel}><Text style={styles.caption}>TIMER PREFERENCE</Text><Text style={styles.note}>Saved only · no countdown</Text></View>
          <View style={styles.stepper}>
            <CooktopKey label="Decrease cooktop timer" icon="remove" disabled={disabled || cooktop.timerMinutes === null || cooktop.timerMinutes <= 0} onPress={() => run('stove-timer-down')} style={styles.keyStep} />
            <Text accessibilityLabel={`Saved cooktop timer: ${cooktop.timerMinutes ?? 'unavailable'} minutes`} style={styles.value}>{cooktop.timerMinutes ?? '—'}<Text style={styles.unit}>min</Text></Text>
            <CooktopKey label="Increase cooktop timer" icon="add" disabled={disabled || cooktop.timerMinutes === null || cooktop.timerMinutes >= 60} onPress={() => run('stove-timer-up')} style={styles.keyStep} />
          </View>
        </View>
        <Pressable accessibilityRole="switch" accessibilityLabel={cooktop.lockPreference === null ? 'Child-lock preference unavailable' : 'Child-lock preference'} aria-checked={cooktop.lockPreference === true}
          accessibilityState={{ disabled: disabled || cooktop.lockPreference === null, checked: cooktop.lockPreference === true }} disabled={disabled || cooktop.lockPreference === null}
          onPress={() => { if (!disabled && cooktop.lockPreference !== null) client.setSetting(device.id, 'stoveLock', !cooktop.lockPreference); }}
          style={({ pressed }) => [styles.key, styles.preference, cooktop.lockPreference && styles.keyActive, (disabled || cooktop.lockPreference === null) && styles.keyDisabled, pressed && styles.keyPressed]}>
          <View style={styles.preferenceCopy}><Text style={styles.preferenceLabel}>Child-lock preference</Text><Text style={styles.note}>Timer and lock are saved only</Text></View>
          <Text style={styles.preferenceValue}>{cooktop.lockPreference === null ? '—' : cooktop.lockPreference ? 'On' : 'Off'}</Text>
        </Pressable>
        <Text style={styles.feedback}>{COOKTOP_PREVIEW_NOTE}</Text>
        {disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
      </LinearGradient>
    </LinearGradient>
  </ScrollView>;
}
