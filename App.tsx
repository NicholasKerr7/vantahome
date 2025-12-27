import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/app/AppNavigator';
import { startDeviceRealtime } from './src/services/realtime';

export default function App() {
  useEffect(() => {
    return startDeviceRealtime();
  }, []);

  return (
    // Required by RNGH (and libraries built on it like @gorhom/bottom-sheet).
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <AppNavigator />
    </GestureHandlerRootView>
  );
}
