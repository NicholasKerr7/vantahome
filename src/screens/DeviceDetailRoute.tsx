import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../app/AppNavigator';
import { getDevice } from '../../packages/home-scene/src/data';
import { DeepScreen } from '../components/deep/DeepScreen';
import { useDecorativeMotion } from '../components/useDecorativeMotion';
import { runtimePolicy } from '../config/runtimeMode';
import { selectVisibleDevices, useHomeStore } from '../store/useHomeStore';
import { theme } from '../theme/theme';
import { DeviceControlsSheet } from '../features/three-d-home/DeviceControlsSheet';
import { guardModelDeviceControls } from '../features/three-d-home/modelDeviceControls';
import { isModelHome } from '../features/three-d-home/modelHomeScope';
import { canShareDemoDevices } from '../features/three-d-home/simulationSession';
import { useSimulationControls } from '../features/three-d-home/useSimulationControls';
import DeviceDetailScreen from './DeviceDetailScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'DeviceDetail'>;
const MODEL_ONLY_KINDS = new Set(['blinds', 'solar', 'battery', 'generator']);

/** Mount simulation controls only for an explicitly modeled, visible device in the local owner's home. */
export default function DeviceDetailRoute(props: Props) {
  const { deviceId } = props.route.params;
  const visibleDevices = useHomeStore(useShallow(selectVisibleDevices));
  const modelHome = useHomeStore(isModelHome);
  const sharedModel = useHomeStore((state) => canShareDemoDevices(state, runtimePolicy.mode));
  const device = visibleDevices.find((candidate) => candidate.id === deviceId);
  const definition = getDevice(deviceId);
  if (!device || (MODEL_ONLY_KINDS.has(device.kind) && !(modelHome && sharedModel && definition?.kind === device.kind))) {
    return <DeepScreen title="Device unavailable" eyebrow="DEVICE ACCESS" onBack={() => props.navigation.goBack()}><Text style={styles.detail}>This device is not available with your current home access.</Text></DeepScreen>;
  }
  if (modelHome && sharedModel && definition?.kind === device.kind && device.kind !== 'camera') {
    const allowedDeviceIds = visibleDevices.filter((candidate) => getDevice(candidate.id)?.kind === candidate.kind).map((candidate) => candidate.id);
    return <ModeledDeviceDetail {...props} allowedDeviceIds={allowedDeviceIds} />;
  }
  return <DeviceDetailScreen {...props} />;
}

/** Reuse the house inspector, including browsing, without falling back to legacy capability cards. */
function ModeledDeviceDetail({ route, navigation, allowedDeviceIds }: Props & { allowedDeviceIds: readonly string[] }) {
  const snapshot = useSimulationControls();
  const motionAllowed = useDecorativeMotion(true);
  const controls = useMemo(() => guardModelDeviceControls(snapshot.client), [snapshot.client]);
  /** Let cameras switch to their dedicated native route while other devices retain the shared inspector. */
  function selectDevice(deviceId: string) {
    const state = useHomeStore.getState();
    if (!isModelHome(state) || !canShareDemoDevices(state, runtimePolicy.mode)) return;
    const candidate = selectVisibleDevices(state).find((device) => device.id === deviceId);
    if (!candidate || getDevice(deviceId)?.kind !== candidate.kind) return;
    navigation.setParams({ deviceId });
  }
  return <View style={styles.root}><DeviceControlsSheet deviceId={route.params.deviceId} client={controls} snapshot={snapshot} allowedDeviceIds={allowedDeviceIds}
    motionAllowed={motionAllowed} onClose={() => navigation.goBack()} onSelect={selectDevice} /></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg0 },
  detail: { color: theme.colors.subtext, fontSize: 14, lineHeight: 21 },
});
