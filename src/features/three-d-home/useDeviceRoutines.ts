import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { openHomeFeature } from '../../app/homeNavigation';
import { runtimePolicy } from '../../config/runtimeMode';
import { useHomeStore } from '../../store/useHomeStore';
import { resolveRoutineDeviceId } from './deviceRoutineBinding';

/** Open the common routine collection only after rechecking the current device/session binding. */
export function useDeviceRoutines(onClose?: () => void): (sceneDeviceId: string) => void {
  const navigation = useNavigation();
  return useCallback((sceneDeviceId: string) => {
    const deviceId = resolveRoutineDeviceId(useHomeStore.getState(), sceneDeviceId, runtimePolicy.mode);
    if (!deviceId) {
      Alert.alert('Device linking required', 'This model device is not linked to the home device catalog. Its saved preview preferences do not run routines. Scheduling becomes available after a verified device connection.');
      return;
    }
    onClose?.();
    openHomeFeature(navigation.dispatch, 'Automations', { deviceId });
  }, [navigation, onClose]);
}
