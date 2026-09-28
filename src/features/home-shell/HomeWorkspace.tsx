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

const HomeDeviceLibrary = React.lazy(() => import('./HomeDeviceLibrary'));

/** Share destination handling and utility drawers without adding duplicate navigation stacks. */
export default function HomeWorkspace({ section, children }: PropsWithChildren<{ section: HomeSection }>) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const commandActivity = useCommandActivityLauncher();
  const focused = useIsFocused();
  const [panel, setPanel] = useState<'menu' | 'devices' | null>(null);
  const motionAllowed = useDecorativeMotion(focused && panel !== null);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'background') setPanel(null); });
    return () => subscription.remove();
  }, []);
  useEffect(() => { if (!focused) setPanel(null); }, [focused]);

  /** Route primary destinations directly; drawers retain the current property or collection. */
  function selectSection(next: HomeSection) {
    if (next === 'more') { setPanel('menu'); return; }
    if (next === 'devices') { setPanel('devices'); return; }
    setPanel(null);
    if (section === next) return;
    openHomeFeature(navigation.dispatch, next === 'home' ? 'Home' : next === 'scenes' ? 'Scenes' : 'Automations');
  }

  /** Keep all secondary routes, permissions, and existing feature entry points available. */
  function selectDestination(destination: HomeDestination) {
    setPanel(null);
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
      case 'household': navigation.navigate('Profile'); break;
      case 'audit': navigation.navigate('AuditLog'); break;
      case 'activity': commandActivity?.open(); break;
    }
  }

  return <>
    <HomeNavigation selected={panel === 'menu' ? 'more' : panel === 'devices' ? 'devices' : section} onSelect={selectSection}>{children}</HomeNavigation>
    {focused && panel === 'menu' && <HomeMenu motionAllowed={motionAllowed} onClose={() => setPanel(null)} onSelect={selectDestination}
      rendererAvailable={isRendererLabEnabled()} activityAvailable={Boolean(commandActivity)} />}
    {focused && panel === 'devices' && <HomePanelBoundary onClose={() => setPanel(null)}><Suspense fallback={<View style={styles.loading}><ActivityIndicator color={theme.colors.accent} /></View>}>
      <HomeDeviceLibrary onClose={() => setPanel(null)} />
    </Suspense></HomePanelBoundary>}
  </>;
}

const styles = StyleSheet.create({ loading: { padding: 18, alignItems: 'center', backgroundColor: theme.colors.bg0 } });
