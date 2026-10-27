import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { AIR_AQI_PRESETS, AIR_QUALITY_NOTE, readAirQualityControllerState } from '../../../packages/home-scene/src/airQualityController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { AirQualityControllerArtwork } from './AirQualityControllerArtwork';
import { airQualityControllerMaterials, airQualityControllerStyles as styles } from './AirQualityControllerStyles';
import { switchKeyboard } from '../../components/switchKeyboard';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; motionAllowed: boolean; onMore: () => void;
}
interface KeyProps {
  label: string; text?: string; icon?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean; selected?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}

/** Preserve deliberate 44-point actions and announce selected threshold preferences explicitly. */
function AirQualityKey({ label, text, icon, disabled = false, selected, onPress, style }: KeyProps) {
  const choice = selected !== undefined;
  return <Pressable accessibilityRole={choice ? 'radio' : 'button'} accessibilityLabel={label} aria-checked={selected}
    accessibilityState={choice ? { checked: selected, disabled } : { disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, selected && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={20} color={theme.colors.accentText} />}
    {text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Keep each sample value, unit and unavailable state readable as one accessible measurement. */
function AirQualityMetric({ label, spokenLabel, unit, value, largeText }: { label: string; spokenLabel: string; unit: string; value: number | null; largeText: boolean }) {
  return <View accessible accessibilityLabel={value === null ? `${spokenLabel} sample unavailable` : `${spokenLabel} sample: ${value} ${unit}`}
    style={[styles.metric, largeText && styles.metricLarge]}>
    <Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value ?? '—'}</Text><Text style={styles.metricUnit}>{unit}</Text>
  </View>;
}

/** Show canonical fixed samples and saved alert preferences; sample checks never act as sensor power. */
export function AirQualityController({ device, state, client, disabled, compact, fontScale, onMore }: Props) {
  const air = readAirQualityControllerState(device, state);
  const largeText = fontScale > 1.15;
  const [viewportHeight, setViewportHeight] = useState(0);
  const compactLayout = compact || (viewportHeight > 0 && viewportHeight < 580);
  /** Include the real sheet header, safe area and added-device actions when sizing the artwork. */
  function measureViewport(event: LayoutChangeEvent): void {
    const height = event.nativeEvent.layout.height;
    setViewportHeight((current) => current === height ? current : height);
  }
  if (!air) return null;
  const alertsLabel = air.alertsEnabled === null ? 'Unavailable' : air.alertsEnabled ? 'On' : 'Off';

  /** Save only the chosen preference, preserving all readings and unrelated settings. */
  function choose(field: 'airAlertsEnabled' | 'airAlertAqi', value: boolean | number): void {
    if (!disabled) client.setSetting(device.id, field, value);
  }
  /** An explicit choice can recover an unknown stored preference without implying sensor connectivity. */
  function toggleAlerts(): void { choose('airAlertsEnabled', air?.alertsEnabled !== true); }

  return <ScrollView onLayout={measureViewport} testID="air-quality-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="air-quality-tactile-controller" colors={airQualityControllerMaterials.edge} style={styles.shell}>
      <LinearGradient colors={airQualityControllerMaterials.body} style={[styles.body, compactLayout && styles.bodyCompact]}>
        <View style={styles.header}>
          <View style={styles.emblem}><Ionicons accessible={false} name="pulse-outline" size={24} color={theme.colors.accentText} /></View>
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>AIR QUALITY</Text></View>
          <AirQualityKey label="More air quality controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <View style={styles.hero}>
          <AirQualityControllerArtwork air={air} compact={compactLayout} />
          <Text accessibilityLiveRegion="polite" style={styles.status}>{air.status}</Text>
        </View>
        <View style={[styles.metrics, largeText && styles.metricsLarge]}>
          <AirQualityMetric label="PM2.5" spokenLabel="PM2.5" value={air.pm25} unit="µg/m³" largeText={largeText} />
          <AirQualityMetric label="CO₂" spokenLabel="Carbon dioxide" value={air.co2} unit="ppm" largeText={largeText} />
          <AirQualityMetric label="VOC" spokenLabel="VOC" value={air.voc} unit="ppb" largeText={largeText} />
          <AirQualityMetric label="HUMIDITY" spokenLabel="Humidity" value={air.humidity} unit="%" largeText={largeText} />
        </View>
        <Pressable accessibilityRole="switch" accessibilityLabel="Air quality alerts preference" aria-checked={air.alertsEnabled === true}
          accessibilityValue={{ text: alertsLabel }} accessibilityState={{ checked: air.alertsEnabled === true, disabled }}
          disabled={disabled} onPress={toggleAlerts} {...switchKeyboard(toggleAlerts, disabled)}
          style={({ pressed }) => [styles.key, styles.preference, largeText && styles.preferenceLarge, air.alertsEnabled === true && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
          <View style={styles.preferenceIdentity}><Ionicons accessible={false} name="notifications-outline" size={18} color={theme.colors.accentText} /><Text style={styles.keyLabel}>Alerts preference</Text></View>
          <Text style={styles.preferenceValue}>{alertsLabel}</Text>
        </Pressable>
        <View style={styles.section}>
          <View style={[styles.sectionHeader, largeText && styles.sectionHeaderLarge]}>
            <Text style={styles.caption}>AQI ALERT PREFERENCE</Text>
            <Text accessibilityLabel={air.aqiThreshold === null ? 'Saved AQI threshold unavailable' : `Saved AQI threshold: ${air.aqiThreshold}`} style={styles.thresholdValue}>{air.aqiThreshold ?? '—'} AQI</Text>
          </View>
          <View accessibilityRole="radiogroup" accessibilityLabel="AQI alert preference" style={[styles.row, largeText && styles.rowLarge]}>
            {AIR_AQI_PRESETS.map((preset) => <AirQualityKey key={preset.value} label={`Save AQI alert threshold ${preset.label}`} text={preset.label} selected={air.aqiThreshold === preset.value}
              disabled={disabled} onPress={() => choose('airAlertAqi', preset.value)} style={[styles.keyWide, largeText && styles.keyLarge]} />)}
          </View>
        </View>
        <AirQualityKey label="Check air quality sample" text={air.sampleChecked ? 'Sample checked · Check again' : 'Check sample'} icon="checkmark-circle-outline" disabled={disabled}
          onPress={() => { if (!disabled) client.toggle(device.id); }} style={styles.keyPrimary} />
        <Text style={styles.feedback}>{AIR_QUALITY_NOTE}</Text>
        {disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
      </LinearGradient>
    </LinearGradient>
  </ScrollView>;
}
