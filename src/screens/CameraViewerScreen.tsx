import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../app/AppNavigator';
import { useCameraCenterAccess } from '../features/cameras/useCameraCenter';
import { CameraCenterScreen } from '../features/cameras/CameraCenterScreen';
import ConfiguredCameraViewerScreen from './ConfiguredCameraViewerScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'CameraViewer'>;

/** Show the new simulation experience while preserving the existing configured-camera pathway. */
export default function CameraViewerScreen(props: Props) {
  const { access } = useCameraCenterAccess();
  const deviceId = props.route.params.deviceId;
  // An expired or changed grant must never fall back to the older configured-media pathway.
  const configured = access.canView && access.devices.some((device) => device.id === deviceId) && !access.bindings[deviceId];
  return !configured
    ? <CameraCenterScreen navigation={props.navigation} focusedDeviceId={props.route.params.deviceId} />
    : <ConfiguredCameraViewerScreen {...props} />;
}
