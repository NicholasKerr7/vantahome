import React, { useEffect, useState } from "react";
import { Linking, View, Text, ActivityIndicator } from "react-native";
import {
  NavigationContainer,
  DefaultTheme,
  type NavigatorScreenParams,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import type { Session } from "@supabase/supabase-js";
import AuthScreen from "../screens/AuthScreen";
import AuthRequiredScreen from "../screens/AuthRequiredScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import BottomTabs, { type BottomTabParamList } from "../components/BottomTabs";
import DeviceDetailScreen from "../screens/DeviceDetailScreen";
import RoomScreen from "../screens/RoomScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import ManageRoomsScreen from "../screens/ManageRoomsScreen";
import AutomationBuilderScreen from "../screens/AutomationBuilderScreen";
import CamerasScreen from "../screens/CamerasScreen";
import AuditLogScreen from "../screens/AuditLogScreen";
import CameraViewerScreen from "../screens/CameraViewerScreen";
import { theme } from "../theme/theme";
import { supabase } from "../services/supabaseClient";
import {
  applyMembershipSnapshot,
  syncMembershipFromSupabase,
} from "../services/membership";
import { bootstrapHome } from "../services/cloudRegistry";
import { hydrateHomeAccount, useHomeStore } from "../store/useHomeStore";
import { resolveAuthExperience, runtimePolicy } from "../config/runtimeMode";
import {
  cancelAuthFlow,
  completeAuthCallback,
  waitForAuthExchange,
} from "../services/authFlow";
import { deviceClient } from "../services/deviceClient";
import Pressable from "../components/Pressable";
import PasswordRecoveryScreen from "../screens/PasswordRecoveryScreen";

/**
 * Root stack for the app.
 *
 * Notes:
 * - We wrap the navigator with `BottomSheetModalProvider` so any screen can
 *   present a Gorhom bottom sheet (e.g. device long-press sheet).
 * - The `GestureHandlerRootView` lives in `App.tsx`; both are required for
 *   bottom sheet + gestures to work reliably.
 */
export type RootStackParamList = {
  Auth: undefined;
  PasswordRecovery: undefined;
  Onboarding: undefined;
  Main: NavigatorScreenParams<BottomTabParamList>;
  Room: { roomId?: string; showAll?: boolean };
  DeviceDetail: { deviceId: string };
  Notifications: undefined;
  Profile: undefined;
  ManageRooms: undefined;
  AutomationBuilder: { flowId?: string };
  Cameras: undefined;
  AuditLog: undefined;
  CameraViewer: { deviceId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [membershipError, setMembershipError] = useState(false);
  const [membershipRetry, setMembershipRetry] = useState(0);
  const membershipReady = useHomeStore((s) => s.membershipReady);
  const navigationScope = useHomeStore((s) =>
    `${s.authenticatedUserId ?? "demo"}:${s.sessionEpoch}:${s.accountHomeId ?? "unverified"}`,
  );

  useEffect(() => {
    if (!supabase) {
      let mounted = true;
      void hydrateHomeAccount(
        null,
        runtimePolicy.allowUnauthenticatedDemo,
      ).then(() => {
        if (mounted) setAuthReady(true);
      });
      return () => {
        mounted = false;
      };
    }
    const authClient = supabase;
    let mounted = true;
    let currentUserId: string | null | undefined;
    let transition = 0;
    let receivedAuthEvent = false;
    const receiveSession = async (nextSession: Session | null) => {
      if (!mounted) return;
      const userId = nextSession?.user.id ?? null;
      if (currentUserId === userId) {
        setSession(nextSession);
        return;
      }
      currentUserId = userId;
      const version = ++transition;
      deviceClient.resetSession();
      // Clearing is synchronous, before React can render the new identity.
      const hydration = hydrateHomeAccount(userId);
      setAuthReady(false);
      setSession(nextSession);
      if (!nextSession) setPasswordRecovery(false);
      await hydration;
      if (!mounted || version !== transition) return;
      if (nextSession) {
        const meta = nextSession.user.user_metadata ?? {};
        useHomeStore.getState().setProfile({
          name:
            meta.full_name ||
            meta.name ||
            nextSession.user.email?.split("@")[0] ||
            "Home",
          email: nextSession.user.email,
        });
      }
      setAuthReady(true);
    };
    authClient.auth
      .getSession()
      .then(({ data }) => {
        if (!receivedAuthEvent) void receiveSession(data.session ?? null);
      })
      .catch(() => {
        if (!receivedAuthEvent) void receiveSession(null);
      });
    const handleAuthUrl = async (url: string | null) => {
      if (!mounted || !url) return;
      let recovery = false;
      const recovered = await completeAuthCallback(url, () => {
        recovery = true;
        if (mounted) setPasswordRecovery(true);
      });
      if (mounted && recovery && !recovered) setPasswordRecovery(false);
    };

    void Linking.getInitialURL()
      .then(handleAuthUrl)
      .catch(() => undefined);
    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      void handleAuthUrl(url);
    });
    const { data } = authClient.auth.onAuthStateChange((event, nextSession) => {
      receivedAuthEvent = true;
      if (event === "SIGNED_OUT") void cancelAuthFlow();
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      void receiveSession(nextSession ?? null);
    });
    return () => {
      mounted = false;
      linkSubscription.remove();
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || passwordRecovery || !authReady) return;
    let active = true;
    const sessionEpoch = useHomeStore.getState().sessionEpoch;
    const isCurrent = () =>
      active && useHomeStore.getState().sessionEpoch === sessionEpoch;
    const ensureMembership = async () => {
      setMembershipError(false);
      let result = await syncMembershipFromSupabase(session.user.id);
      if (!isCurrent()) return;
      if (!result && !useHomeStore.getState().accountHomeId) {
        const meta = session.user.user_metadata ?? {};
        const baseName =
          meta.full_name ||
          meta.name ||
          meta.preferred_username ||
          meta.nickname ||
          meta.given_name ||
          session.user.email?.split("@")[0] ||
          "Home";
        const homeName = `${String(baseName).trim() || "Home"}'s Home`;
        try {
          await bootstrapHome(homeName, session.user.id);
        } catch {
          if (isCurrent()) setMembershipError(true);
          return;
        }
        if (!isCurrent()) return;
        result = await syncMembershipFromSupabase(session.user.id);
      }
      if (!isCurrent()) return;
      if (!result || !applyMembershipSnapshot(result)) setMembershipError(true);
    };
    void ensureMembership().catch(() => {
      if (isCurrent()) setMembershipError(true);
    });
    return () => {
      active = false;
    };
  }, [passwordRecovery, session?.user.id, authReady, membershipRetry]);

  if (!authReady) {
    return null;
  }

  const checkingMembership = Boolean(
    session && !passwordRecovery && !membershipReady,
  );
  const authExperience = resolveAuthExperience({
    hasSupabase: Boolean(supabase),
    hasSession: Boolean(session),
  });
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        pointerEvents={checkingMembership ? "none" : "auto"}
        accessibilityElementsHidden={checkingMembership}
        importantForAccessibility={
          checkingMembership ? "no-hide-descendants" : "auto"
        }
      >
        <BottomSheetModalProvider>
          <NavigationContainer
            key={navigationScope}
            theme={{
              ...DefaultTheme,
              // Ensure the “safe” default background matches our gradient base.
              colors: { ...DefaultTheme.colors, background: theme.colors.bg0 },
            }}
          >
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              {passwordRecovery && session ? (
                <Stack.Screen name="PasswordRecovery">
                  {() => (
                    <PasswordRecoveryScreen
                      onComplete={() => setPasswordRecovery(false)}
                    />
                  )}
                </Stack.Screen>
              ) : authExperience === "configuration-required" ? (
                <Stack.Screen name="Auth" component={AuthRequiredScreen} />
              ) : authExperience === "authenticated" ||
                authExperience === "demo" ? (
                <>
                  <Stack.Screen
                    name="Onboarding"
                    component={OnboardingScreen}
                  />
                  <Stack.Screen name="Main" component={BottomTabs} />
                  <Stack.Screen name="Room" component={RoomScreen} />
                  <Stack.Screen
                    name="DeviceDetail"
                    component={DeviceDetailScreen}
                  />
                  <Stack.Screen
                    name="Notifications"
                    component={NotificationsScreen}
                  />
                  <Stack.Screen name="Profile" component={ProfileScreen} />
                  <Stack.Screen
                    name="ManageRooms"
                    component={ManageRoomsScreen}
                  />
                  <Stack.Screen name="Cameras" component={CamerasScreen} />
                  <Stack.Screen
                    name="CameraViewer"
                    component={CameraViewerScreen}
                  />
                  <Stack.Screen name="AuditLog" component={AuditLogScreen} />
                  <Stack.Screen
                    name="AutomationBuilder"
                    component={AutomationBuilderScreen}
                  />
                </>
              ) : (
                <Stack.Screen name="Auth" component={AuthScreen} />
              )}
            </Stack.Navigator>
          </NavigationContainer>
        </BottomSheetModalProvider>
      </View>
      {checkingMembership && (
        <View
          accessibilityViewIsModal
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            backgroundColor: theme.colors.bg0,
          }}
        >
          {!membershipError && (
            <ActivityIndicator color={theme.colors.accent2} />
          )}
          <Text style={{ color: theme.colors.text }}>
            {membershipError
              ? "Unable to verify home access."
              : "Verifying your home…"}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setMembershipRetry((value) => value + 1)}
          >
            <Text style={{ color: theme.colors.accent2 }}>Retry</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void cancelAuthFlow()
                .then(waitForAuthExchange)
                .then(() => supabase?.auth.signOut({ scope: "local" }));
            }}
          >
            <Text style={{ color: theme.colors.subtext }}>Sign out</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
