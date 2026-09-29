import React from 'react';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import FeatureScreenFrame from '../features/home-shell/FeatureScreenFrame';
import HomePanelBoundary from '../features/home-shell/HomePanelBoundary';
import { isRendererLabEnabled } from '../config/rendererLab';
import { theme } from '../theme/theme';
import { openHomeFeature } from './homeNavigation';

/** Preserve nested links from existing room, camera, profile, and notification flows. */
export type HomeStackParamList = {
  Home: undefined;
  Automations: { deviceId?: string } | undefined;
  Scenes: undefined;
  Settings: undefined;
  Renderer: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();
const RendererLab = React.lazy(() => import('../features/renderer-lab/RendererLab'));

/** Load the renderer only after authentication has admitted the main home. */
export function loadThreeDHomeScreen() {
  return require('../screens/ThreeDHomeScreen').default as typeof import('../screens/ThreeDHomeScreen').default;
}

/** Retain scene creation and execution inside the shared home frame. */
function ScenesFeature() {
  const Screen = require('../screens/ScenesScreen').default as typeof import('../screens/ScenesScreen').default;
  return <FeatureScreenFrame title="Scenes" section="scenes"><Screen embedded /></FeatureScreenFrame>;
}

/** Retain schedules and the automation builder without a second dashboard. */
function AutomationsFeature({ route }: NativeStackScreenProps<HomeStackParamList, 'Automations'>) {
  const Screen = require('../screens/AutomationsScreen').default as typeof import('../screens/AutomationsScreen').default;
  return <FeatureScreenFrame title="Routines" section="automations"><Screen embedded deviceId={route.params?.deviceId} /></FeatureScreenFrame>;
}

/** Keep account preferences and transport diagnostics reachable from the house. */
function SettingsFeature() {
  const Screen = require('../screens/SettingsScreen').default as typeof import('../screens/SettingsScreen').default;
  return <FeatureScreenFrame title="Settings" section="more"><Screen embedded /></FeatureScreenFrame>;
}

/** Isolate the comparison renderer so leaving the property releases its graphics first. */
function RendererFeature() {
  const focused = useIsFocused();
  const navigation = useNavigation();
  return <FeatureScreenFrame title="Renderer preview" section="more">
    {isRendererLabEnabled() ? <HomePanelBoundary onClose={() => openHomeFeature(navigation.dispatch, 'Home')}>
      <React.Suspense fallback={<View style={styles.loading}><ActivityIndicator color={theme.colors.accent} /></View>}><RendererLab active={focused} /></React.Suspense>
    </HomePanelBoundary> : <View style={styles.loading}><Text style={styles.notice}>Renderer preview is unavailable in this build.</Text></View>}
  </FeatureScreenFrame>;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }, notice: { color: theme.colors.text, textAlign: 'center' } });

/** One home entry replaces the old tab dashboard while preserving deep navigation. */
export default function HomeNavigator() {
  return <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false, animation: 'none' }}>
    <Stack.Screen name="Home" getComponent={loadThreeDHomeScreen} />
    <Stack.Screen name="Scenes" component={ScenesFeature} />
    <Stack.Screen name="Automations" component={AutomationsFeature} />
    <Stack.Screen name="Settings" component={SettingsFeature} />
    <Stack.Screen name="Renderer" component={RendererFeature} />
  </Stack.Navigator>;
}
