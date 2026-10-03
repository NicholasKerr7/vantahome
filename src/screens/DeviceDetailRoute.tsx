import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../app/AppNavigator';
import { DeepScreen } from '../components/deep/DeepScreen';
import { useDecorativeMotion } from '../components/useDecorativeMotion';
import { selectVisibleDevices, useHomeStore } from '../store/useHomeStore';
import { theme } from '../theme/theme';
import { DeviceControlsSheet } from '../features/three-d-home/DeviceControlsSheet';
import { guardModelDeviceControls } from '../features/three-d-home/modelDeviceControls';
import { useSimulationControls } from '../features/three-d-home/useSimulationControls';
import { selectSimulationDeviceBindings } from '../features/three-d-home/simulationDeviceBindings';
import DeviceDetailScreen from './DeviceDetailScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'DeviceDetail'>;
const MODEL_ONLY_KINDS = new Set(['blinds', 'solar', 'battery', 'generator']);

/** Use the shared inspector for authorized virtual devices and native controls for physical ones. */
export default function DeviceDetailRoute(props: Props) {
  const { deviceId } = props.route.params;
  const visibleDevices = useHomeStore(useShallow(selectVisibleDevices));
  const modelRoutes = useHomeStore(useShallow(selectSimulationDeviceBindings));
  const device = visibleDevices.find((candidate) => candidate.id === deviceId);
  const modelId = modelRoutes[deviceId];
  if (!device || ((MODEL_ONLY_KINDS.has(device.kind) || device.simulationOnly) && !modelId)) {
    return <DeepScreen title="Device unavailable" eyebrow="DEVICE ACCESS" onBack={() => props.navigation.goBack()}><Text style={styles.detail}>This device is not available with your current home access.</Text></DeepScreen>;
  }
  if (modelId && (device.simulationOnly || device.kind !== 'camera')) {
    return <ModeledDeviceDetail {...props} modelId={modelId} allowedDeviceIds={Object.values(modelRoutes)} />;
  }
  return <DeviceDetailScreen {...props} />;
}

/** Reuse the house inspector, including browsing, without falling back to legacy capability cards. */
function ModeledDeviceDetail({ navigation, modelId, allowedDeviceIds }: Props & { modelId: string; allowedDeviceIds: readonly string[] }) {
  const snapshot = useSimulationControls();
  const motionAllowed = useDecorativeMotion(true);
  const controls = useMemo(() => guardModelDeviceControls(snapshot.client), [snapshot.client]);
  /** Navigate by registry identity while the inspector uses only permitted authored positions. */
  function selectDevice(deviceId: string) {
    const candidate = Object.entries(selectSimulationDeviceBindings(useHomeStore.getState())).find(([, id]) => id === deviceId);
    if (candidate) navigation.setParams({ deviceId: candidate[0] });
  }
  return <View style={styles.root}><DeviceControlsSheet deviceId={modelId} client={controls} snapshot={snapshot} allowedDeviceIds={allowedDeviceIds}
    motionAllowed={motionAllowed} onClose={() => navigation.goBack()} onSelect={selectDevice} /></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg0 },
  detail: { color: theme.colors.subtext, fontSize: 14, lineHeight: 21 },
});
