import React from 'react';
import { Text, View } from 'react-native';
import type { ConciergeResponse, ConciergeValues } from '../../../shared/home-concierge/contract';
import type { AssistantDevice } from './assistantContext';
import { assistantStyles as styles } from './assistantStyles';

const LABELS: Record<keyof ConciergeValues, string> = {
  isOn: 'Power', brightness: 'Brightness', colorTempK: 'White temperature', tempC: 'Target temperature',
  openPercent: 'Open', volume: 'Volume',
};

/** Describe only a supplied comfort value; missing readings are never converted into defaults. */
function formatValue(field: keyof ConciergeValues, value: unknown, fahrenheit: boolean): string {
  if (value === undefined) return 'Not reported';
  if (field === 'isOn') return value ? 'On' : 'Off';
  if (typeof value !== 'number') return 'Unavailable';
  if (field === 'tempC') return fahrenheit ? `${Math.round(value * 9 / 5 + 32)}°F` : `${value}°C`;
  if (field === 'colorTempK') return `${value} K`;
  return `${value}%`;
}

/** Reveal the exact proposed fields without filling in unrelated scene defaults or changing state. */
export default function AssistantSceneChanges({ scene, devices, fahrenheit = false }: {
  scene: NonNullable<ConciergeResponse['scene']>; devices: readonly AssistantDevice[]; fahrenheit?: boolean;
}) {
  return <View style={styles.changes} testID="assistant-scene-changes">
    <Text style={styles.scopeCaption}>PROPOSED CHANGES · SIMULATION</Text>
    {scene.actions.map((action) => {
      const device = devices.find((item) => item.id === action.deviceId);
      if (!device) return null;
      return <View key={action.deviceId} style={styles.changeDevice}>
        <Text style={styles.changeDeviceName}>{device.name}</Text><Text style={styles.changeRoom}>{device.roomName}</Text>
        {(Object.keys(action.values) as (keyof ConciergeValues)[]).map((field) => <View key={field} style={styles.changeRow}>
          <Text style={styles.changeLabel}>{LABELS[field]}</Text>
          <Text style={styles.changeValues}>{formatValue(field, device.values[field], fahrenheit)} → {formatValue(field, action.values[field], fahrenheit)}</Text>
        </View>)}
      </View>;
    })}
    <Text style={styles.detail}>Only these settings are included. Previewing and saving do not run the scene.</Text>
  </View>;
}
