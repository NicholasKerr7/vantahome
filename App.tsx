import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { AppState } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AppNavigator from "./src/app/AppNavigator";
import { startAmbientData } from "./src/services/ambient";
import { startDeviceRealtime } from "./src/services/realtime";
import {
  invalidateHomeMembership,
  useHomeStore,
} from "./src/store/useHomeStore";
import { startFlowRuntime } from "./src/services/flowRuntime";
import { ensureNotificationsReady } from "./src/services/notifications";
import {
  applyMembershipSnapshot,
  syncMembershipFromSupabase,
} from "./src/services/membership";
import { deviceClient } from "./src/services/deviceClient";
import { supabase } from "./src/services/supabaseClient";
import { runtimePolicy } from "./src/config/runtimeMode";
import * as Sentry from "@sentry/react-native";
import { scrubSentryEvent } from "./src/observability/sentryPrivacy";
import { applyDeviceOrientationPolicy } from "./src/services/orientation";

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
const sentryEnabled = Boolean(sentryDsn);
if (sentryEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENV?.trim() || "production",
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
    tracesSampleRate: 0.2,
  });
}

function App() {
  const notificationsEnabled = useHomeStore((s) => s.preferences.notifications);
  const homeAvailable =
    useHomeStore((s) => s.membershipReady) ||
    (!supabase && runtimePolicy.allowUnauthenticatedDemo);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let scope = "";
    let disposed = false;
    let currentAppState = AppState.currentState;
    let refreshVersion = 0;
    const reconcile = () => {
      const state = useHomeStore.getState();
      const demo = !supabase && runtimePolicy.allowUnauthenticatedDemo;
      const allowed =
        currentAppState === "active" && (demo || state.membershipReady);
      const nextScope = allowed
        ? JSON.stringify([
            state.authenticatedUserId,
            state.activeHomeId,
            state.realtime.enabled,
            state.realtime.wsUrl,
            state.realtime.useMqtt,
            state.household.map(({ id, userId, role }) => ({
              id,
              userId,
              role,
            })),
            state.roomMembers,
            state.memberPermissionOverrides,
          ])
        : "";
      if (nextScope === scope) return;
      scope = nextScope;
      // Store subscriptions run synchronously: old retries and delayed flows
      // stop before another identity or newly revoked policy can be rendered.
      const previousStop = stop;
      stop = undefined;
      previousStop?.();
      deviceClient.resetSession();
      if (!allowed) return;
      const stopRealtime = startDeviceRealtime({
        enabled: state.realtime.enabled,
        wsUrl: state.realtime.wsUrl.trim() || null,
        useMqtt: state.realtime.useMqtt,
        userId: state.authenticatedUserId,
        homeId: state.activeHomeId,
      });
      const stopAmbient = startAmbientData();
      const stopFlows = startFlowRuntime();
      stop = () => {
        stopRealtime();
        stopAmbient();
        stopFlows();
      };
    };
    const refresh = async () => {
      const { authenticatedUserId: userId, sessionEpoch } =
        useHomeStore.getState();
      if (!supabase || !userId || currentAppState !== "active") return;
      const version = ++refreshVersion;
      try {
        const result = await syncMembershipFromSupabase(userId);
        if (
          disposed ||
          version !== refreshVersion ||
          currentAppState !== "active" ||
          useHomeStore.getState().authenticatedUserId !== userId ||
          useHomeStore.getState().sessionEpoch !== sessionEpoch
        )
          return;
        if (!result || !applyMembershipSnapshot(result))
          invalidateHomeMembership();
      } catch {
        if (
          !disposed &&
          version === refreshVersion &&
          useHomeStore.getState().authenticatedUserId === userId &&
          useHomeStore.getState().sessionEpoch === sessionEpoch
        ) {
          invalidateHomeMembership();
        }
      }
    };
    const unsubscribe = useHomeStore.subscribe(reconcile);
    const subscription = AppState.addEventListener("change", (next) => {
      // Native biometric prompts briefly mark the app inactive while the
      // authorized confirmation is still running. Only actual backgrounding
      // invalidates that session's work.
      if (next === "inactive") return;
      const previous = currentAppState;
      currentAppState = next;
      ++refreshVersion;
      if (next !== "active" && supabase) invalidateHomeMembership();
      reconcile();
      if (next === "active" && previous !== "active") void refresh();
    });
    const timer = setInterval(() => {
      void refresh();
    }, 60_000);
    reconcile();
    return () => {
      disposed = true;
      unsubscribe();
      subscription.remove();
      clearInterval(timer);
      stop?.();
      deviceClient.resetSession();
    };
  }, []);
  useEffect(() => {
    applyDeviceOrientationPolicy().catch(() => {});
  }, []);
  useEffect(() => {
    if (!notificationsEnabled || !homeAvailable) return;
    ensureNotificationsReady().catch(() => {});
  }, [notificationsEnabled, homeAvailable]);

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
