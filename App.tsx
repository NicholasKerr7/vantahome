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
import {
  maybeNotifyHomeLeftUnsecured,
  syncPresenceFromCurrentLocationIfAuthorized,
  syncPresenceGeofencingFromProfile,
} from "./src/services/presenceGeofencing";
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
  const household = useHomeStore((s) => s.household);
  const activeMemberId = useHomeStore((s) => s.activeMemberId);
  const notificationsEnabled = useHomeStore((s) => s.preferences.notifications);
  const locationSharingEnabled = useHomeStore(
    (s) => s.profile.locationSharingEnabled,
  );
  const presenceGeofenceEnabled = useHomeStore(
    (s) => s.profile.presenceGeofenceEnabled,
  );
  const presenceGeofenceLatitude = useHomeStore(
    (s) => s.profile.presenceGeofenceLatitude,
  );
  const presenceGeofenceLongitude = useHomeStore(
    (s) => s.profile.presenceGeofenceLongitude,
  );
  const presenceGeofenceRadiusM = useHomeStore(
    (s) => s.profile.presenceGeofenceRadiusM,
  );
  const securityMode = useHomeStore((s) => s.profile.securityMode);
  const securityModeSource = useHomeStore((s) => s.profile.securityModeSource);
  const securityAutoSyncWithPresence = useHomeStore(
    (s) => s.profile.securityAutoSyncWithPresence,
  );
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
  const setSecurityMode = useHomeStore((s) => s.setSecurityMode);
  const setHouseholdFromRemote = useHomeStore((s) => s.setHouseholdFromRemote);
  const setRoomMembersFromRemote = useHomeStore(
    (s) => s.setRoomMembersFromRemote,
  );
  const setActiveMember = useHomeStore((s) => s.setActiveMember);
  const appState = useRef(AppState.currentState);
  const suppressNextAwayAudit = useRef(false);
  const lastHouseOccupied = useRef<boolean | null>(null);
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
    let active = true;
    const loadMembership = async () => {
      const result = await syncMembershipFromSupabase();
      if (!active || !result) return;
      suppressNextAwayAudit.current = true;
      setHouseholdFromRemote(result.household);
      setRoomMembersFromRemote(result.roomMembers);
      setActiveMember(result.activeMemberId);
      syncPresenceFromCurrentLocationIfAuthorized().catch(() => {});
    };
    void loadMembership();
    return () => {
      active = false;
    };
  }, [setActiveMember, setHouseholdFromRemote, setRoomMembersFromRemote]);
  useEffect(() => {
    if (!notificationsEnabled) return;
    ensureNotificationsReady().catch(() => {});
  }, [notificationsEnabled]);
  useEffect(() => {
    syncPresenceGeofencingFromProfile().catch(() => {});
    syncPresenceFromCurrentLocationIfAuthorized().catch(() => {});
  }, [
    activeMemberId,
    locationSharingEnabled,
    presenceGeofenceEnabled,
    presenceGeofenceLatitude,
    presenceGeofenceLongitude,
    presenceGeofenceRadiusM,
  ]);
  useEffect(() => {
    const houseOccupied = household.some((member) => member.status === "home");

    if (suppressNextAwayAudit.current) {
      lastHouseOccupied.current = houseOccupied;
      suppressNextAwayAudit.current = false;
      return;
    }

    if (lastHouseOccupied.current === null) {
      if (securityAutoSyncWithPresence) {
        if (!houseOccupied && securityMode !== "away") {
          setSecurityMode("away", { source: "presence" });
        }
        if (
          houseOccupied &&
          securityMode === "away" &&
          securityModeSource !== "manual"
        ) {
          setSecurityMode("home", { source: "presence" });
        }
      }
      lastHouseOccupied.current = houseOccupied;
      return;
    }

    if (securityAutoSyncWithPresence) {
      const everyoneJustLeft = lastHouseOccupied.current && !houseOccupied;
      const someoneJustArrived = !lastHouseOccupied.current && houseOccupied;

      if (everyoneJustLeft && securityMode !== "away") {
        setSecurityMode("away", { source: "presence" });
      }

      if (
        someoneJustArrived &&
        securityMode === "away" &&
        securityModeSource !== "manual"
      ) {
        setSecurityMode("home", { source: "presence" });
      }
    }

    if (!notificationsEnabled) {
      lastHouseOccupied.current = houseOccupied;
      return;
    }

    const everyoneJustLeft = lastHouseOccupied.current && !houseOccupied;
    if (everyoneJustLeft) {
      maybeNotifyHomeLeftUnsecured().catch(() => {});
    }

    lastHouseOccupied.current = houseOccupied;
  }, [
    household,
    notificationsEnabled,
    securityAutoSyncWithPresence,
    securityMode,
    securityModeSource,
    setSecurityMode,
  ]);
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
      syncPresenceGeofencingFromProfile().catch(() => {});
      syncMembershipFromSupabase()
        .then((result) => {
          if (!result) return;
          suppressNextAwayAudit.current = true;
          setHouseholdFromRemote(result.household);
          setRoomMembersFromRemote(result.roomMembers);
          setActiveMember(result.activeMemberId);
          syncPresenceFromCurrentLocationIfAuthorized().catch(() => {});
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
