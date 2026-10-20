import React from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import {
  OPENING_POSITION_BOUNDS, openingControllerActionId, readOpeningControllerState,
  type OpeningControllerKey, type OpeningDeviceKind,
} from '../../../packages/home-scene/src/openingController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { OpeningControllerArtwork } from './OpeningControllerArtwork';
import { openingControllerMaterials, openingControllerStyles as styles } from './OpeningControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; motionAllowed: boolean; onMore: () => void;
}
type IconName = React.ComponentProps<typeof Ionicons>['name'];
const PRESENTATION: Record<OpeningDeviceKind, { title: string; mechanism: string; icon: IconName }> = {
  door: { title: 'ENTRY', mechanism: 'Side-hinged door', icon: 'enter-outline' },
  garage: { title: 'GARAGE', mechanism: 'Roller shutter', icon: 'albums-outline' },
  window: { title: 'WINDOW', mechanism: 'Awning window', icon: 'grid-outline' },
};

/** Explicit command keys expose disabled state and retain at least 44-point touch targets. */
function OpeningKey({ label, text, icon, disabled = false, active = false, onPress, style }: {
  label: string; text?: string; icon: IconName; disabled?: boolean; active?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, active && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    <Ionicons accessible={false} name={icon} size={20} color={active ? theme.colors.accentText : theme.colors.text} />
    {text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Independent architectural controls follow accepted position and never infer locks or safety telemetry. */
export function OpeningController({ device, state, client, disabled, compact, fontScale, motionAllowed, onMore }: Props) {
  const opening = readOpeningControllerState(device, state);
  if (!opening) return null;
  const { kind, openPercent } = opening;
  const presentation = PRESENTATION[kind];
  const largeText = fontScale > 1.15;

  /** Relative and explicit targets are resolved by the current guarded reducer, not a captured percentage. */
  function run(key: OpeningControllerKey): void {
    const action = openingControllerActionId(kind, key);
    if (!disabled && action) client.runAction(device.id, action);
  }

  const reading = <View style={[styles.reading, largeText && styles.readingLarge]}>
    <Text style={styles.caption}>OPENING</Text>
    <Text accessibilityLiveRegion="polite" accessibilityLabel={`${kind} opening: ${openPercent === null ? 'Unavailable' : `${openPercent}%`}`}
      style={styles.positionValue}>{openPercent === null ? '—' : `${openPercent}%`}</Text>
  </View>;

  return <ScrollView testID="opening-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="opening-tactile-controller" colors={openingControllerMaterials.edge} style={[styles.shell, compact && styles.shellCompact]}>
      <LinearGradient colors={openingControllerMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.header}>
          <View style={styles.emblem}><Ionicons accessible={false} name={presentation.icon} size={22} color={theme.colors.accentText} /></View>
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>{presentation.title}</Text></View>
          <OpeningKey label={`More ${kind} controls`} icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <View style={styles.hero}>
          <OpeningControllerArtwork kind={kind} position={openPercent} compact={compact} motionAllowed={motionAllowed} />
          <Text accessibilityLiveRegion="polite" style={styles.status}>{opening.status} · {presentation.mechanism}</Text>
        </View>
        <View role="group" accessibilityLabel={`${kind} opening, steps of 5 percent`} style={[styles.positionRow, largeText && styles.positionLarge]}>
          {largeText && reading}
          <OpeningKey label={`Decrease ${kind} opening by 5 percent`} icon="remove"
            disabled={disabled || openPercent === null || openPercent <= OPENING_POSITION_BOUNDS.min}
            onPress={() => run('decrease')} style={styles.keyCircle} />
          {!largeText && reading}
          <OpeningKey label={`Increase ${kind} opening by 5 percent`} icon="add"
            disabled={disabled || openPercent === null || openPercent >= OPENING_POSITION_BOUNDS.max}
            onPress={() => run('increase')} style={styles.keyCircle} />
        </View>
        <View style={[styles.row, largeText && styles.rowLarge]}>
          <OpeningKey label={`Close ${kind} fully`} text="Close" icon={kind === 'garage' ? 'chevron-down' : 'contract-outline'}
            active={openPercent === 0} disabled={disabled || !opening.canClose} onPress={() => run('close')}
            style={[styles.keyWide, styles.keyHorizontal, largeText && styles.keyLarge]} />
          {kind === 'window' && <OpeningKey label="Vent window to 25 percent" text="Vent" icon="leaf-outline"
            active={openPercent === 25} disabled={disabled || openPercent === 25} onPress={() => run('vent')}
            style={[styles.keyWide, styles.keyHorizontal, largeText && styles.keyLarge]} />}
          <OpeningKey label={`Open ${kind} fully`} text="Open" icon={kind === 'garage' ? 'chevron-up' : 'expand-outline'}
            active={openPercent === 100} disabled={disabled || !opening.canOpen} onPress={() => run('open')}
            style={[styles.keyWide, styles.keyHorizontal, largeText && styles.keyLarge]} />
        </View>
        <Text style={styles.feedback}>Local position preview · Simulation</Text>
        {disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
      </LinearGradient>
    </LinearGradient>
  </ScrollView>;
}
