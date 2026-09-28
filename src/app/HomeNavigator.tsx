import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import FeatureScreenFrame from '../features/home-shell/FeatureScreenFrame';

/** Preserve nested links from existing room, camera, profile, and notification flows. */
export type HomeStackParamList = {
  Home: undefined;
  Automations: undefined;
  Scenes: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

/** Load the renderer only after authentication has admitted the main home. */
export function loadThreeDHomeScreen() {
  return require('../screens/ThreeDHomeScreen').default as typeof import('../screens/ThreeDHomeScreen').default;
}

/** Retain scene creation and execution inside the shared home frame. */
function ScenesFeature() {
  const Screen = require('../screens/ScenesScreen').default as typeof import('../screens/ScenesScreen').default;
  return <FeatureScreenFrame title="Scenes"><Screen embedded /></FeatureScreenFrame>;
}

/** Retain schedules and the automation builder without a second dashboard. */
function AutomationsFeature() {
  const Screen = require('../screens/AutomationsScreen').default as typeof import('../screens/AutomationsScreen').default;
  return <FeatureScreenFrame title="Automations"><Screen embedded /></FeatureScreenFrame>;
}

/** Keep account preferences and transport diagnostics reachable from the house. */
function SettingsFeature() {
  const Screen = require('../screens/SettingsScreen').default as typeof import('../screens/SettingsScreen').default;
  return <FeatureScreenFrame title="Settings"><Screen embedded /></FeatureScreenFrame>;
}

/** One home entry replaces the old tab dashboard while preserving deep navigation. */
export default function HomeNavigator() {
  return <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false, animation: 'none' }}>
    <Stack.Screen name="Home" getComponent={loadThreeDHomeScreen} />
    <Stack.Screen name="Scenes" component={ScenesFeature} />
    <Stack.Screen name="Automations" component={AutomationsFeature} />
    <Stack.Screen name="Settings" component={SettingsFeature} />
  </Stack.Navigator>;
}
