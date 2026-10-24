import React from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { cameraControllerActionId, getCameraConsolePresentation } from '../../../packages/home-scene/src/cameraController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { CameraControllerArtwork } from './CameraControllerArtwork';
import { cameraControllerMaterials, cameraControllerStyles as styles } from './CameraControllerStyles';
import { theme } from '../../theme/theme';
import { switchKeyboard } from '../../components/switchKeyboard';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; onMore: () => void; onWatch?: () => void;
}
type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Shared tactile keys keep deliberate camera actions readable and at least 44 points. */
function CameraKey({ label, text, icon, disabled = false, active = false, onPress, style }: {
  label: string; text?: string; icon: IconName; disabled?: boolean; active?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, active && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    <Ionicons accessible={false} name={icon} size={20} color={active ? theme.colors.accentText : theme.colors.text} />
    {text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Preferences do not imply connected video, microphone access or changed camera arming. */
function CameraPreference({ label, title, icon, checked, disabled, largeText, onPress }: {
  label: string; title: string; icon: IconName; checked: boolean; disabled: boolean; largeText: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} aria-checked={checked}
    accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress} {...switchKeyboard(onPress, disabled)}
    style={({ pressed }) => [styles.key, styles.keyWide, styles.preference, largeText && styles.keyLarge, checked && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    <View style={styles.keyHorizontal}><Ionicons accessible={false} name={icon} size={18} color={theme.colors.accentText} /><Text style={styles.keyLabel}>{title}</Text></View>
    <Text style={styles.preferenceValue}>{checked ? 'On' : 'Off'} · Preference</Text>
  </Pressable>;
}

/** One accepted local state drives a sample monitor; every mutation uses the existing guarded client. */
export function CameraController({ device, state, client, disabled, compact, fontScale, onMore, onWatch }: Props) {
  const camera = getCameraConsolePresentation(device, state);
  const largeText = fontScale > 1.15;
  if (!camera) return null;

  /** Store a preference only, preserving arming and the other camera settings. */
  function setPreference(field: 'nightVision' | 'motionAlerts', value: boolean): void {
    if (!disabled) client.setSetting(device.id, field, value);
  }

  return <ScrollView testID="camera-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="camera-tactile-controller" colors={cameraControllerMaterials.edge} style={[styles.shell, compact && styles.shellCompact]}>
      <LinearGradient colors={cameraControllerMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.header}>
          <View style={styles.emblem}><Ionicons accessible={false} name="videocam-outline" size={22} color={theme.colors.accentText} /></View>
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>VISION</Text></View>
          <CameraKey label="More camera controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <View style={styles.monitor}>
          <View style={[styles.monitorHeader, largeText && styles.monitorHeaderLarge]}>
            <Text style={styles.sampleCaption}>SAMPLE PREVIEW</Text><Text style={styles.sampleDetail}>Architectural illustration</Text>
          </View>
          <CameraControllerArtwork nightVision={camera.nightVision} compact={compact} condensed={compact && Boolean(onWatch)} />
          <View style={styles.monitorFooter}>
            <Text accessibilityLiveRegion="polite" style={styles.status}>{camera.status}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.event}>{camera.previewEvent.label}</Text>
          </View>
        </View>
        <View style={[styles.row, largeText && styles.rowLarge]}>
          <CameraKey label={`${camera.armed ? 'Disarm' : 'Arm'} camera preview`} text={camera.armed ? 'Disarm' : 'Arm'} icon={camera.armed ? 'shield-checkmark-outline' : 'shield-outline'}
            active={camera.armed} disabled={disabled} onPress={() => { if (!disabled) client.toggle(device.id); }}
            style={[styles.keyWide, styles.keyHorizontal, largeText && styles.keyLarge]} />
          <CameraKey label="Simulate snapshot" text="Snapshot" icon="camera-outline" disabled={disabled}
            onPress={() => { if (!disabled) client.runAction(device.id, cameraControllerActionId('snapshot')); }}
            style={[styles.keyWide, styles.keyHorizontal, largeText && styles.keyLarge]} />
        </View>
        <View style={[styles.row, largeText && styles.rowLarge]}>
          <CameraPreference label="Camera Night vision preference" title="Night" icon="moon-outline" checked={camera.nightVision} disabled={disabled} largeText={largeText}
            onPress={() => setPreference('nightVision', !camera.nightVision)} />
          <CameraPreference label="Camera Motion alerts preference" title="Alerts" icon="notifications-outline" checked={camera.motionAlerts} disabled={disabled} largeText={largeText}
            onPress={() => setPreference('motionAlerts', !camera.motionAlerts)} />
        </View>
        {onWatch && <View style={styles.row}><CameraKey label="Watch camera demo preview" text="Watch" icon="play-outline" onPress={onWatch} style={[styles.keyWide, styles.keyHorizontal]} /></View>}
        <Text style={styles.feedback}>Simulation · No live feed connected</Text>
        {disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
      </LinearGradient>
    </LinearGradient>
  </ScrollView>;
}
