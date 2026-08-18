import React, { useEffect, useState } from "react";
import { Linking } from "react-native";
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
import { syncMembershipFromSupabase } from "../services/membership";
import { bootstrapHome } from "../services/cloudRegistry";
import { useHomeStore } from "../store/useHomeStore";
import { resolveAuthExperience } from "../config/runtimeMode";
import {
  getAuthRedirectParams,
  isAuthCallbackUrl,
} from "../config/authRedirects";
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
  const [authReady, setAuthReady] = useState(!supabase);
  const setHouseholdFromRemote = useHomeStore((s) => s.setHouseholdFromRemote);
  const setRoomMembersFromRemote = useHomeStore(
    (s) => s.setRoomMembersFromRemote,
  );
  const setActiveMember = useHomeStore((s) => s.setActiveMember);

  useEffect(() => {
    if (!supabase) return;
    const authClient = supabase;
    let mounted = true;
    authClient.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        setAuthReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setAuthReady(true);
      });
    const handleAuthUrl = async (url: string | null) => {
      if (!mounted || !url || !isAuthCallbackUrl(url)) return;
      const params = getAuthRedirectParams(url);
      if (!params) return;
      const isRecovery = params.get("type") === "recovery";
      if (isRecovery) setPasswordRecovery(true);

      const code = params.get("code");
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      let recoveredSession: Session | null = null;
      try {
        if (code) {
          const { data, error } =
            await authClient.auth.exchangeCodeForSession(code);
          if (!error) recoveredSession = data.session;
        } else if (accessToken && refreshToken) {
          const { data, error } = await authClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!error) recoveredSession = data.session;
        }
      } catch {
        recoveredSession = null;
      } finally {
        if (mounted && isRecovery && !recoveredSession) {
          setPasswordRecovery(false);
        }
      }
    };

    void Linking.getInitialURL().then(handleAuthUrl).catch(() => undefined);
    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      void handleAuthUrl(url);
    });
    const { data } = authClient.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setSession(nextSession ?? null);
    });
    return () => {
      mounted = false;
      linkSubscription.remove();
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || passwordRecovery) return;
    let active = true;
    const ensureMembership = async () => {
      let result = await syncMembershipFromSupabase();
      if (!result) {
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
          await bootstrapHome(homeName);
        } catch {
          return;
        }
        result = await syncMembershipFromSupabase();
      }
      if (!active || !result) return;
      setHouseholdFromRemote(result.household);
      setRoomMembersFromRemote(result.roomMembers);
      setActiveMember(result.activeMemberId);
    };
    void ensureMembership();
    return () => {
      active = false;
    };
  }, [
    passwordRecovery,
    session,
    setActiveMember,
    setHouseholdFromRemote,
    setRoomMembersFromRemote,
  ]);

  if (!authReady) {
    return null;
  }

  const authExperience = resolveAuthExperience({
    hasSupabase: Boolean(supabase),
    hasSession: Boolean(session),
  });
  return (
    <BottomSheetModalProvider>
      <NavigationContainer
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
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
              <Stack.Screen name="Main" component={BottomTabs} />
              <Stack.Screen name="Room" component={RoomScreen} />
              <Stack.Screen name="DeviceDetail" component={DeviceDetailScreen} />
              <Stack.Screen
                name="Notifications"
                component={NotificationsScreen}
              />
              <Stack.Screen name="Profile" component={ProfileScreen} />
              <Stack.Screen name="ManageRooms" component={ManageRoomsScreen} />
              <Stack.Screen name="Cameras" component={CamerasScreen} />
              <Stack.Screen name="CameraViewer" component={CameraViewerScreen} />
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
  );
}
