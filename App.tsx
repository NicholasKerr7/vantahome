import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AppNavigator from "./src/app/AppNavigator";
import { startDeviceRealtime } from "./src/services/realtime";
import { useHomeStore } from "./src/store/useHomeStore";
import { startFlowRuntime } from "./src/services/flowRuntime";
import { ensureNotificationsReady } from "./src/services/notifications";

export default function App() {
  const realtime = useHomeStore((s) => s.realtime);
  const notificationsEnabled = useHomeStore((s) => s.preferences.notifications);
  const wsUrl = realtime.wsUrl.trim();
  const enableRealtime = realtime.enabled;
  const wsUrlOrNull = wsUrl.length > 0 ? wsUrl : null;

  useEffect(() => {
    return startDeviceRealtime({
      enabled: enableRealtime,
      wsUrl: wsUrlOrNull,
    });
  }, [enableRealtime, wsUrlOrNull]);

  useEffect(() => startFlowRuntime(), []);
  useEffect(() => {
    if (!notificationsEnabled) return;
    ensureNotificationsReady().catch(() => {});
  }, [notificationsEnabled]);

  return (
    // Required by RNGH (and libraries built on it like @gorhom/bottom-sheet).
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
