import React, { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../app/AppNavigator';
import { openHomeFeature } from '../../app/homeNavigation';
import { DeepAction, DeepScreen } from '../../components/deep/DeepScreen';
import { useHomeStore } from '../../store/useHomeStore';
import { getDeviceHealthAccess, type DeviceHealthAccess } from './deviceHealthModel';
import { useDeviceHealthAccess, useDeviceHealthEntries } from './useDeviceHealth';
import { DeviceHealthEmpty, DeviceHealthView } from './DeviceHealthView';
import { DeviceHealthDetails } from './DeviceHealthDetails';
import { healthStyles as styles } from './DeviceHealthStyles';

type Props = NativeStackScreenProps<RootStackParamList, 'DeviceHealth'>;

/** Unmount private reports, selection and example alerts whenever access, identity or visibility changes. */
export default function DeviceHealthScreen({ navigation }: Props) {
  const { access, rooms, active } = useDeviceHealthAccess();
  const back = () => { if (navigation.canGoBack()) navigation.goBack(); else openHomeFeature(navigation.dispatch, 'Home'); };
  return <DeepScreen title="Device Health" eyebrow="VANTAHOME / HOME PULSE" onBack={back}>
    {!access.canView ? <DeviceHealthEmpty title="Device Health unavailable" detail="Your current home access does not include these devices." />
      : !active ? <View testID="device-health-hidden" style={styles.hidden} />
        : <DeviceHealthSession key={access.identityKey} navigation={navigation} access={access} rooms={rooms} />}
  </DeepScreen>;
}

/** All health controls are local presentation; device control is an explicit guarded navigation action. */
function DeviceHealthSession({ navigation, access, rooms }: { navigation: Props['navigation']; access: DeviceHealthAccess; rooms: readonly { id: string; name: string }[] }) {
  const [examples, setExamples] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const health = useDeviceHealthEntries(access, rooms, examples);
  const selected = health.entries.find((entry) => entry.id === selectedId);

  /** Recheck grants synchronously so old card and recovery callbacks cannot cross a session boundary. */
  function current(id?: string): boolean {
    const next = getDeviceHealthAccess(useHomeStore.getState());
    return mounted.current && navigation.isFocused() && (AppState.currentState == null || AppState.currentState === 'active')
      && (typeof document === 'undefined' || !document.hidden) && next.canView && next.identityKey === access.identityKey && (!id || next.devices.some((device) => device.id === id));
  }
  return <>
    {health.loading ? <DeviceHealthEmpty title="Reading your model" detail="Restoring permitted simulation samples. No physical devices are being scanned." />
      : health.error ? <><DeviceHealthEmpty title="Model samples unavailable" detail="Your saved settings have been kept. Retry to read them again." /><DeepAction label="Retry health samples" onPress={() => { if (current()) health.retry(); }} primary /></>
        : <DeviceHealthView entries={health.entries} examples={examples} canTryExamples={health.entries.some((entry) => entry.modelDeviceId && entry.status !== 'unreported')}
          onExamples={() => { if (current()) { setExamples((value) => !value); setSelectedId(null); } }}
          onSelect={(id) => { if (current(id)) setSelectedId(id); }} />}
    {selected && <DeviceHealthDetails entry={selected} onClose={() => setSelectedId(null)} onOpen={() => {
      if (!current(selected.id) || selected.source === 'sample') return;
      setSelectedId(null); navigation.navigate('DeviceDetail', { deviceId: selected.id });
    }} />}
  </>;
}
