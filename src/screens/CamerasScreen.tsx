import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../app/AppNavigator';
import { CameraCenterScreen } from '../features/cameras/CameraCenterScreen';
import { useCameraCenterAccess } from '../features/cameras/useCameraCenter';
import ConfiguredCamerasScreen from './ConfiguredCamerasScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'Cameras'>;

/** Show the new simulation experience while preserving the existing configured-camera pathway. */
export default function CamerasScreen(props: Props) {
  const { access } = useCameraCenterAccess();
  // A physical catalog cannot bypass current membership or timed camera-access expiry.
  return !access.canView || access.usesSimulationCenter
    ? <CameraCenterScreen navigation={props.navigation} />
    : <ConfiguredCamerasScreen {...props} />;
}
