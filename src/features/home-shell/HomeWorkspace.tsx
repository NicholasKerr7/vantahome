import React, { Suspense, useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../app/AppNavigator';
import { openHomeFeature } from '../../app/homeNavigation';
import { useCommandActivityLauncher } from '../../components/command-feedback/CommandActivityContext';
import { useDecorativeMotion } from '../../components/useDecorativeMotion';
import { isRendererLabEnabled } from '../../config/rendererLab';
import { theme } from '../../theme/theme';
import HomeNavigation, { type HomeSection } from './HomeNavigation';
import HomeMenu from './HomeMenu';
import HomePanelBoundary from './HomePanelBoundary';
import type { HomeDestination } from './homeDestinations';
import { ScenePresentationContext } from './ScenePresentationContext';
import { useShallow } from 'zustand/react/shallow';
import { useHomeStore } from '../../store/useHomeStore';
import { selectHomeNavigationAccess } from './homeNavigationAccess';
import HomeDestinationGuard from './HomeDestinationGuard';

const HomeDeviceLibrary = React.lazy(() => import('./HomeDeviceLibrary'));

/** Share destination handling and utility drawers without adding duplicate navigation stacks. */
export default function HomeWorkspace({ section, children }: PropsWithChildren<{ section: HomeSection }>) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const commandActivity = useCommandActivityLauncher();
  const access = useHomeStore(useShallow(selectHomeNavigationAccess));
  const accessCurrent = useHomeStore((state) => !(state.accountUserId || state.authenticatedUserId) || state.membershipReady);
  const focused = useIsFocused();
  const [panel, setPanel] = useState<'menu' | 'devices' | null>(null);
  const motionAllowed = useDecorativeMotion(focused && panel !== null);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'background') setPanel(null); });
    return () => subscription.remove();
  }, []);
  useEffect(() => { if (!focused || !accessCurrent) setPanel(null); }, [focused, accessCurrent]);
  useEffect(() => { if (panel === 'devices' && !access.devices) setPanel(null); }, [access.devices, panel]);

  /** Route primary destinations directly; drawers retain the current property or collection. */
  function selectSection(next: HomeSection) {
    if (!selectHomeNavigationAccess(useHomeStore.getState())[next]) { setPanel(null); return; }
    if (next === 'more') { setPanel('menu'); return; }
    if (next === 'devices') { setPanel('devices'); return; }
    setPanel(null);
    if (section === next) return;
    if (next === 'automations') openHomeFeature(navigation.dispatch, 'Automations', {});
    else openHomeFeature(navigation.dispatch, next === 'home' ? 'Home' : 'Scenes');
  }

  /** Keep all secondary routes, permissions, and existing feature entry points available. */
  function selectDestination(destination: HomeDestination) {
    setPanel(null);
    if (!selectHomeNavigationAccess(useHomeStore.getState())[destination]) return;
    switch (destination) {
      case 'scenes': selectSection('scenes'); break;
      case 'automations': selectSection('automations'); break;
      case 'devices': setPanel('devices'); break;
      case 'settings': openHomeFeature(navigation.dispatch, 'Settings'); break;
      case 'renderer': openHomeFeature(navigation.dispatch, 'Renderer'); break;
      case 'integrations': navigation.navigate('Integrations'); break;
      case 'cameras': navigation.navigate('Cameras'); break;
      case 'notifications': navigation.navigate('Notifications'); break;
      case 'rooms': navigation.navigate('ManageRooms'); break;
      case 'household': navigation.navigate('Profile', { section: 'household' }); break;
      case 'audit': navigation.navigate('AuditLog'); break;
      case 'activity': commandActivity?.open(); break;
    }
  }

  return <>
    <ScenePresentationContext.Provider value={panel === 'menu' || (panel === 'devices' && access.devices) || Boolean(commandActivity?.visible)}>
      <HomeNavigation selected={panel === 'menu' ? 'more' : panel === 'devices' && access.devices ? 'devices' : section} onSelect={selectSection} availableSections={access}>
        {section === 'scenes' || section === 'automations' ? <HomeDestinationGuard destination={section}>{children}</HomeDestinationGuard> : children}
      </HomeNavigation>
    </ScenePresentationContext.Provider>
    {focused && accessCurrent && panel === 'menu' && <HomeMenu motionAllowed={motionAllowed} onClose={() => setPanel(null)} onSelect={selectDestination}
      rendererAvailable={isRendererLabEnabled()} activityAvailable={Boolean(commandActivity)} availableDestinations={access} />}
    {focused && accessCurrent && panel === 'devices' && access.devices && <HomePanelBoundary onClose={() => setPanel(null)}><Suspense fallback={<View style={styles.loading}><ActivityIndicator color={theme.colors.accent} /></View>}>
      <HomeDeviceLibrary onClose={() => setPanel(null)} />
    </Suspense></HomePanelBoundary>}
  </>;
}

const styles = StyleSheet.create({ loading: { padding: 18, alignItems: 'center', backgroundColor: theme.colors.bg0 } });
