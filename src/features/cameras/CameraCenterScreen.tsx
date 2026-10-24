import React, { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../app/AppNavigator';
import { openHomeFeature } from '../../app/homeNavigation';
import { DeepAction, DeepScreen } from '../../components/deep/DeepScreen';
import { useHomeStore } from '../../store/useHomeStore';
import { useProtectedAccess } from '../../security/useProtectedAccess';
import { theme } from '../../theme/theme';
import { modelSimulationIdentity } from '../three-d-home/modelSceneAccess';
import { useControllerFocused } from '../three-d-home/useControllerFocused';
import { CameraAccessState } from './CameraAccessState';
import { CameraCenterEmpty, CameraCenterView } from './center/CameraCenterView';
import type { CameraCenterLayout, CameraCenterSection } from './center/CameraCenterTypes';
import { getCameraCenterAccess } from './cameraCenterModel';
import { locateCameraInHome, openCameraCenter, openCameraViewer } from './cameraNavigation';
import { useCameraCenter, useCameraCenterAccess } from './useCameraCenter';

type Props = {
  navigation: Pick<NativeStackNavigationProp<RootStackParamList>, 'navigate' | 'dispatch' | 'goBack' | 'canGoBack'>;
  focusedDeviceId?: string;
};

/** A lifecycle boundary removes camera content on background without interrupting biometric sheets. */
export function CameraCenterScreen(props: Props) {
  const identity = useHomeStore(modelSimulationIdentity);
  const { access } = useCameraCenterAccess();
  const [appState, setAppState] = useState(AppState.currentState);
  useEffect(() => {
    const listener = AppState.addEventListener('change', setAppState);
    return () => listener.remove();
  }, []);
  // Actual background unmounts the protected session; returning requires a fresh access check.
  if (appState === 'background') return <View testID="camera-center-background" style={styles.background} />;
  return <CameraCenterSession key={`${identity}:${access.identityKey}`} {...props} foreground={appState === 'active' || appState == null} />;
}

/** Resolve private content only after role, room, foreground and protected-access checks. */
function CameraCenterSession({ navigation, focusedDeviceId, foreground }: Props & { foreground: boolean }) {
  const focused = useControllerFocused();
  const canView = useHomeStore((state) => getCameraCenterAccess(state).canView);
  const protection = useProtectedAccess('Confirm access to household cameras', canView);
  const active = foreground && focused && canView && protection.state === 'granted';
  const center = useCameraCenter(active);
  const viewAllowed = canView && center.canView;
  const [selectedId, setSelectedId] = useState<string | null>(focusedDeviceId ?? null);
  const [section, setSection] = useState<CameraCenterSection>('cameras');
  const [layout, setLayout] = useState<CameraCenterLayout>('focus');
  const cameras = focusedDeviceId
    ? center.cameras.filter((camera) => camera.id === focusedDeviceId)
    : center.cameras;
  const selected = cameras.find((camera) => camera.id === (focusedDeviceId ?? selectedId)) ?? cameras[0];

  /** Back keeps the original Home/Devices stack and does not recreate the renderer. */
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else openHomeFeature(navigation.dispatch, 'Home');
  }, [navigation]);

  /** Viewing controls still rechecks live-camera access; their own command gates enforce management. */
  const openControls = useCallback((id: string) => {
    const access = getCameraCenterAccess(useHomeStore.getState());
    if (access.canView && access.devices.some((camera) => camera.id === id)) {
      navigation.navigate('DeviceDetail', { deviceId: id });
    }
  }, [navigation]);

  return <DeepScreen title={focusedDeviceId && active ? selected?.name ?? 'Camera' : 'Camera Center'}
    eyebrow="VANTAHOME · VISION" onBack={goBack}>
    {!viewAllowed || protection.state !== 'granted' ? <CameraAccessState
      checking={viewAllowed && protection.state === 'checking'} allowed={viewAllowed} onRetry={() => void protection.retry()} />
      : !active ? <View testID="camera-center-hidden" style={styles.background} />
        : center.simulationError ? <>
          <CameraCenterEmpty title="Camera preview unavailable" message={center.simulationError} icon="cloud-offline-outline" />
          <DeepAction label="Retry camera preview" onPress={center.retrySimulation} />
        </>
        : <>
          <CameraCenterView cameras={cameras} events={center.events} selectedCameraId={selected?.id ?? null}
            section={center.canViewActivity ? section : 'cameras'} layout={layout} focused={Boolean(focusedDeviceId)}
            loading={!center.ready} canViewActivity={center.canViewActivity}
            onSelectCamera={setSelectedId} onSectionChange={setSection} onLayoutChange={setLayout}
            onOpenCamera={(id) => { openCameraViewer(navigation.dispatch, id); }} onControls={openControls}
            onLocate={selected?.modelDeviceId ? (id) => { locateCameraInHome(navigation.dispatch, id); } : undefined}
            onToggleFavorite={center.preferencesReady ? center.toggleFavorite : undefined}
            onAllCameras={focusedDeviceId ? () => { openCameraCenter(navigation.dispatch); } : undefined} />
          {center.preferenceError ? <View accessibilityLiveRegion="polite" style={styles.notice}>
            <Text style={styles.noticeText}>{center.preferenceError}</Text>
            <DeepAction label="Retry" onPress={center.retryPreferences} />
          </View> : null}
        </>}
  </DeepScreen>;
}

const styles = StyleSheet.create({
  background: { flex: 1, minHeight: 0, backgroundColor: theme.colors.bg0 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  noticeText: { flex: 1, color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
});
