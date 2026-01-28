import "react-native-gesture-handler";
import React, { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AppNavigator from "./src/app/AppNavigator";
import { startAmbientData } from "./src/services/ambient";
import { startDeviceRealtime } from "./src/services/realtime";
import { useHomeStore } from "./src/store/useHomeStore";
import { startFlowRuntime } from "./src/services/flowRuntime";
import { ensureNotificationsReady } from "./src/services/notifications";
import { syncMembershipFromSupabase } from "./src/services/membership";
import * as Sentry from "@sentry/react-native";

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENV?.trim() || "production",
    tracesSampleRate: 0.2,
  });
}

function App() {
  const realtime = useHomeStore((s) => s.realtime);
  const notificationsEnabled = useHomeStore((s) => s.preferences.notifications);
  const setHouseholdFromRemote = useHomeStore((s) => s.setHouseholdFromRemote);
  const setRoomMembersFromRemote = useHomeStore(
    (s) => s.setRoomMembersFromRemote,
  );
  const setActiveMember = useHomeStore((s) => s.setActiveMember);
  const appState = useRef(AppState.currentState);
  const wsUrl = realtime.wsUrl.trim();
  const enableRealtime = realtime.enabled;
  const useMqtt = realtime.useMqtt;
  const wsUrlOrNull = wsUrl.length > 0 ? wsUrl : null;

  useEffect(() => {
    return startDeviceRealtime({
      enabled: enableRealtime,
      wsUrl: wsUrlOrNull,
      useMqtt,
    });
  }, [enableRealtime, useMqtt, wsUrlOrNull]);

  useEffect(() => startAmbientData(), []);
  useEffect(() => startFlowRuntime(), []);
  useEffect(() => {
    if (!notificationsEnabled) return;
    ensureNotificationsReady().catch(() => {});
  }, [notificationsEnabled]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackground =
        appState.current === "background" || appState.current === "inactive";
      appState.current = nextState;
      if (!wasBackground || nextState !== "active") return;
      syncMembershipFromSupabase()
        .then((result) => {
          if (!result) return;
          setHouseholdFromRemote(result.household);
          setRoomMembersFromRemote(result.roomMembers);
          setActiveMember(result.activeMemberId);
        })
        .catch(() => {});
    });
    return () => subscription.remove();
  }, [setActiveMember, setHouseholdFromRemote, setRoomMembersFromRemote]);

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

export default Sentry.wrap(App);
