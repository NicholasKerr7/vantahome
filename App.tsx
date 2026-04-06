import "react-native-gesture-handler";
import React, { useCallback, useEffect, useRef } from "react";
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
import {
  buildUtilityLocationPatchFromDeviceResult,
  refreshUtilityLocationFromDeviceIfAuthorized,
} from "./src/services/utilityLocation";
import * as Sentry from "@sentry/react-native";

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
const sentryEnabled = Boolean(sentryDsn);
if (sentryEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENV?.trim() || "production",
    tracesSampleRate: 0.2,
  });
}

function App() {
  const realtime = useHomeStore((s) => s.realtime);
  const notificationsEnabled = useHomeStore((s) => s.preferences.notifications);
  const utilityLocation = useHomeStore((s) => s.profile.utilityLocation);
  const utilityLocationManual = useHomeStore(
    (s) => s.profile.utilityLocationManual,
  );
  const utilityLocationMode = useHomeStore((s) => s.profile.utilityLocationMode);
  const utilityLocationResolvedLabel = useHomeStore(
    (s) => s.profile.utilityLocationResolvedLabel,
  );
  const utilityLocationStatus = useHomeStore(
    (s) => s.profile.utilityLocationStatus,
  );
  const setProfile = useHomeStore((s) => s.setProfile);
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
  const syncDeviceUtilityLocation = useCallback(() => {
    if (utilityLocationMode !== "device") return Promise.resolve();
    return refreshUtilityLocationFromDeviceIfAuthorized()
      .then((result) => {
        if (!result || result.kind !== "resolved") return;
        const patch = buildUtilityLocationPatchFromDeviceResult(
          result,
          utilityLocationManual,
        );
        if (
          patch.utilityLocation === utilityLocation &&
          patch.utilityLocationResolvedLabel ===
            (utilityLocationResolvedLabel ?? "") &&
          patch.utilityLocationStatus === utilityLocationStatus
        )
          return;
        setProfile({
          utilityLocationMode: "device",
          ...patch,
        });
      })
      .catch(() => {});
  }, [
    setProfile,
    utilityLocation,
    utilityLocationManual,
    utilityLocationMode,
    utilityLocationResolvedLabel,
    utilityLocationStatus,
  ]);

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
    if (utilityLocationMode !== "device") return;
    syncDeviceUtilityLocation();
  }, [syncDeviceUtilityLocation, utilityLocationMode]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackground =
        appState.current === "background" || appState.current === "inactive";
      appState.current = nextState;
      if (!wasBackground || nextState !== "active") return;
      syncDeviceUtilityLocation();
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
  }, [
    setActiveMember,
    setHouseholdFromRemote,
    setRoomMembersFromRemote,
    syncDeviceUtilityLocation,
  ]);

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

export default sentryEnabled ? Sentry.wrap(App) : App;
