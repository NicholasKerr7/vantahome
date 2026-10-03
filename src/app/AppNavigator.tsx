import React, { useEffect, useRef, useState } from "react";
import { Linking, View, Text, ActivityIndicator, StyleSheet, Platform, useWindowDimensions } from "react-native";
import {
  NavigationContainer,
  DefaultTheme,
  type NavigatorScreenParams,
} from "@react-navigation/native";
import { createNativeStackNavigator, type NativeStackScreenProps } from "@react-navigation/native-stack";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import type { Session } from "@supabase/supabase-js";
import AuthScreen from "../screens/AuthScreen";
import AuthRequiredScreen from "../screens/AuthRequiredScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import HomeNavigator, { loadThreeDHomeScreen, type HomeStackParamList } from "./HomeNavigator";
import DeviceDetailRoute from "../screens/DeviceDetailRoute";
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
import { hydrateHomeAccount, useHomeStore } from "../store/useHomeStore";
import { resolveAuthExperience, runtimePolicy } from "../config/runtimeMode";
import {
  cancelAuthFlow,
  completeAuthCallback,
  needsInvitationPasswordSetup,
  waitForAuthExchange,
} from "../services/authFlow";
import { deviceClient } from "../services/deviceClient";
import Pressable from "../components/Pressable";
import PasswordRecoveryScreen from "../screens/PasswordRecoveryScreen";
import CommandFeedbackProvider from "../components/command-feedback/CommandFeedbackProvider";
import ModelHomeSync from '../features/three-d-home/ModelHomeSync';
import HomeAccessScreen from '../features/home-access/HomeAccessScreen';
import { isHomeInvitationUrl } from '../config/authRedirects';
import { signOutAccount } from '../features/account/accountSession';
import HomeDestinationGuard from '../features/home-shell/HomeDestinationGuard';

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
  AccountEntry: undefined;
  HomeAccess: undefined;
  PasswordRecovery: undefined;
  Onboarding: undefined;
  Main: NavigatorScreenParams<HomeStackParamList>;
  ThreeDHome: undefined;
  Integrations: undefined;
  Room: { roomId?: string; showAll?: boolean };
  DeviceDetail: { deviceId: string };
  Notifications: undefined;
  Profile: { section?: 'identity' | 'household' | 'preferences' | 'access' } | undefined;
  ManageRooms: undefined;
  AutomationBuilder: { flowId?: string; routineId?: string; deviceId?: string; preset?: 'time' };
  Cameras: undefined;
  AuditLog: undefined;
  CameraViewer: { deviceId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Defer provider setup and browser-auth code until integrations are opened. */
function IntegrationsRoute(props: NativeStackScreenProps<RootStackParamList, 'Integrations'>) {
  const Screen = require('../screens/IntegrationsScreen').default as typeof import('../screens/IntegrationsScreen').default;
  return <HomeDestinationGuard destination="integrations"><Screen {...props} /></HomeDestinationGuard>;
}

export default function AppNavigator() {
  const { width } = useWindowDimensions();
  const desktopPreview = Platform.OS === 'web' && width > 1366;
  const [session, setSession] = useState<Session | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [invitationRequested, setInvitationRequested] = useState(false);
  const [invitationEnrollment, setInvitationEnrollment] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [startupRetrying, setStartupRetrying] = useState(false);
  const [startupSigningOut, setStartupSigningOut] = useState(false);
  const retryStartup = useRef<(() => void) | null>(null);
  const [membershipError, setMembershipError] = useState(false);
  const [membershipRetry, setMembershipRetry] = useState(0);
  const [missingMembershipFor, setMissingMembershipFor] = useState<string | null>(null);
  const membershipReady = useHomeStore((s) => s.membershipReady);
  const navigationScope = useHomeStore((s) =>
    `${s.authenticatedUserId ?? "demo"}:${s.sessionEpoch}:${s.accountHomeId ?? "unverified"}`,
  );

  useEffect(() => {
    if (!supabase) {
      let mounted = true;
      let attempt = 0;
      /** Retry demo storage preparation without enabling any household screen on failure. */
      const prepareDemo = async (retry = false) => {
        const version = ++attempt;
        retryStartup.current = null;
        setStartupError(null);
        setStartupRetrying(retry);
        try {
          await hydrateHomeAccount(null, runtimePolicy.allowUnauthenticatedDemo);
          if (mounted && version === attempt) {
            setStartupRetrying(false);
            setAuthReady(true);
          }
        } catch {
          if (!mounted || version !== attempt) return;
          setStartupRetrying(false);
          setStartupError('Unable to prepare your home on this device.');
          retryStartup.current = () => { if (mounted && version === attempt) void prepareDemo(true); };
        }
      };
      void prepareDemo();
      return () => {
        mounted = false;
        retryStartup.current = null;
      };
    }
    const authClient = supabase;
    let mounted = true;
    let currentUserId: string | null | undefined;
    let transition = 0;
    let receivedAuthEvent = false;
    /** Hydrate one identity at a time; storage failures stay outside private navigation. */
    const receiveSession = async (nextSession: Session | null, retry = false) => {
      if (!mounted) return;
      const userId = nextSession?.user.id ?? null;
      if (currentUserId === userId && !retry) {
        setSession(nextSession);
        return;
      }
      if (currentUserId && currentUserId !== userId) {
        // Account-scoped credential setup cannot follow a different identity.
        setPasswordRecovery(false);
        setInvitationEnrollment(false);
      }
      currentUserId = userId;
      const version = ++transition;
      retryStartup.current = null;
      setStartupError(null);
      setStartupRetrying(retry);
      setStartupSigningOut(false);
      deviceClient.resetSession();
      // Clearing is synchronous, before React can render the new identity.
      const hydration = hydrateHomeAccount(userId);
      setAuthReady(false);
      setMissingMembershipFor(null);
      setMembershipError(false);
      setSession(nextSession);
      if (!nextSession) {
        setPasswordRecovery(false);
        setInvitationEnrollment(false);
      }
      try {
        await hydration;
      } catch {
        if (!mounted || version !== transition) return;
        setStartupRetrying(false);
        setStartupError('Unable to prepare your account on this device.');
        retryStartup.current = () => {
          if (mounted && version === transition && currentUserId === userId) void receiveSession(nextSession, true);
        };
        return;
      }
      if (!mounted || version !== transition) return;
      if (nextSession) {
        // A verified invitation can survive an app restart before its password is set.
        // Storage/verification failures stay in credential setup rather than exposing controls.
        let needsPasswordSetup = true;
        try {
          needsPasswordSetup = await needsInvitationPasswordSetup(nextSession.user.id);
        } catch {
          needsPasswordSetup = true;
        }
        if (!mounted || version !== transition) return;
        if (needsPasswordSetup) {
          setInvitationRequested(true);
          setInvitationEnrollment(true);
          setPasswordRecovery(true);
        }
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
      setStartupRetrying(false);
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
      if (isHomeInvitationUrl(url)) {
        setInvitationRequested(true);
        return;
      }
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
      if (event === "SIGNED_OUT") {
        void cancelAuthFlow();
        if (currentUserId) setInvitationRequested(false);
      }
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      void receiveSession(nextSession ?? null);
    });
    return () => {
      mounted = false;
      retryStartup.current = null;
      linkSubscription.remove();
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || passwordRecovery || !authReady) return;
    let active = true;
    const sessionEpoch = useHomeStore.getState().sessionEpoch;
    const isCurrent = () =>
      active && useHomeStore.getState().sessionEpoch === sessionEpoch &&
      useHomeStore.getState().authenticatedUserId === session.user.id;
    const ensureMembership = async () => {
      setMembershipError(false);
      const result = await syncMembershipFromSupabase(session.user.id);
      if (!isCurrent()) return;
      if (!result) {
        setMissingMembershipFor(session.user.id);
        return;
      }
      if (!applyMembershipSnapshot(result, sessionEpoch)) setMembershipError(true);
      else setMissingMembershipFor(null);
    };
    void ensureMembership().catch(() => {
      if (isCurrent()) setMembershipError(true);
    });
    return () => {
      active = false;
    };
  }, [passwordRecovery, session?.user.id, authReady, membershipRetry]);

  if (!authReady) {
    if (!startupError && !startupRetrying) return null;
    return <View style={[styles.viewport, desktopPreview && styles.desktopViewport]}>
      <View style={styles.membershipOverlay} accessibilityLiveRegion="polite">
        {startupRetrying && <ActivityIndicator color={theme.colors.accent2} />}
        <Text style={[styles.text, styles.startupMessage]}>{startupRetrying ? 'Preparing your account…' : startupError}</Text>
        <Pressable
          accessibilityRole="button"
          style={styles.startupAction}
          disabled={startupRetrying || startupSigningOut}
          onPress={() => retryStartup.current?.()}
        ><Text style={styles.actionText}>Retry</Text></Pressable>
        {session && <Pressable
          accessibilityRole="button"
          style={styles.startupAction}
          disabled={startupRetrying || startupSigningOut}
          onPress={() => {
            const scope = useHomeStore.getState();
            setStartupSigningOut(true);
            void signOutAccount(scope).catch(() => {
              if (useHomeStore.getState().sessionEpoch === scope.sessionEpoch) {
                setStartupError('Unable to sign out on this device. Retry or try signing out again.');
              }
            }).finally(() => {
              if (useHomeStore.getState().sessionEpoch === scope.sessionEpoch) setStartupSigningOut(false);
            });
          }}
        ><Text style={styles.subtext}>{startupSigningOut ? 'Signing out…' : 'Sign out'}</Text></Pressable>}
      </View>
    </View>;
  }

  const missingMembership = Boolean(session && missingMembershipFor === session.user.id);
  const checkingMembership = Boolean(session && !passwordRecovery && !membershipReady && !missingMembership);
  const needsHomeAccess = Boolean(session && !passwordRecovery && (missingMembership || invitationRequested));
  const authExperience = resolveAuthExperience({
    hasSupabase: Boolean(supabase),
    hasSession: Boolean(session),
  });
  // Shared background controls must obey the same credential and household gates
  // as private navigation, including when a verified session is later revoked.
  const homeReady = !passwordRecovery && !checkingMembership && !needsHomeAccess
    && (authExperience === "authenticated" || authExperience === "demo");
  return (
    <View style={[styles.viewport, desktopPreview && styles.desktopViewport]}>
      <View
        style={styles.fill}
        pointerEvents={checkingMembership ? "none" : "auto"}
        accessibilityElementsHidden={checkingMembership}
        importantForAccessibility={
          checkingMembership ? "no-hide-descendants" : "auto"
        }
      >
        <CommandFeedbackProvider enabled={homeReady}>
          <BottomSheetModalProvider>
            {homeReady && <ModelHomeSync key={`model-home:${navigationScope}`} />}
            <NavigationContainer
              key={navigationScope}
              theme={{
                ...DefaultTheme,
                // Ensure the “safe” default background matches our gradient base.
                colors: { ...DefaultTheme.colors, background: theme.colors.bg0 },
              }}
            >
              <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
                {passwordRecovery && session ? (
                  <Stack.Screen name="PasswordRecovery">
                    {() => (
                      <PasswordRecoveryScreen
                        purpose={invitationEnrollment ? 'invitation' : 'recovery'}
                        onComplete={() => {
                          setPasswordRecovery(false);
                          setInvitationEnrollment(false);
                        }}
                      />
                    )}
                  </Stack.Screen>
                ) : authExperience === "configuration-required" ? (
                  <Stack.Screen name="Auth" component={AuthRequiredScreen} />
                ) : session && (checkingMembership || needsHomeAccess) ? (
                  <Stack.Screen name="HomeAccess">
                    {() => checkingMembership ? null : <HomeAccessScreen
                      userId={session.user.id}
                      email={session.user.email}
                      onComplete={() => {
                        setMissingMembershipFor(null);
                        setInvitationRequested(false);
                      }}
                      onContinue={membershipReady ? () => setInvitationRequested(false) : undefined}
                    />}
                  </Stack.Screen>
                ) : authExperience === "authenticated" ||
                  authExperience === "demo" ? (
                  <>
                    <Stack.Screen name="Main" component={HomeNavigator} />
                    {authExperience === 'demo' && <Stack.Screen name="AccountEntry">
                      {({ navigation }) => <AuthScreen preview onClose={() => navigation.goBack()} />}
                    </Stack.Screen>}
                    <Stack.Screen
                      name="Onboarding"
                      component={OnboardingScreen}
                    />
                    <Stack.Screen name="ThreeDHome" getComponent={loadThreeDHomeScreen} />
                    <Stack.Screen name="Integrations" component={IntegrationsRoute} />
                    <Stack.Screen name="Room">{(props) => <HomeDestinationGuard destination="rooms"><RoomScreen {...props} /></HomeDestinationGuard>}</Stack.Screen>
                    <Stack.Screen
                      name="DeviceDetail"
                      component={DeviceDetailRoute}
                    />
                    <Stack.Screen
                      name="Notifications"
                    >{() => <HomeDestinationGuard destination="notifications"><NotificationsScreen /></HomeDestinationGuard>}</Stack.Screen>
                    <Stack.Screen name="Profile" component={ProfileScreen} />
                    <Stack.Screen
                      name="ManageRooms"
                    >{(props) => <HomeDestinationGuard destination="rooms"><ManageRoomsScreen {...props} /></HomeDestinationGuard>}</Stack.Screen>
                    <Stack.Screen name="Cameras">{(props) => <HomeDestinationGuard destination="cameras"><CamerasScreen {...props} /></HomeDestinationGuard>}</Stack.Screen>
                    <Stack.Screen
                      name="CameraViewer"
                    >{(props) => <HomeDestinationGuard destination="cameras"><CameraViewerScreen {...props} /></HomeDestinationGuard>}</Stack.Screen>
                    <Stack.Screen name="AuditLog">{(props) => <HomeDestinationGuard destination="audit"><AuditLogScreen {...props} /></HomeDestinationGuard>}</Stack.Screen>
                    <Stack.Screen
                      name="AutomationBuilder"
                    >{(props) => <HomeDestinationGuard destination="automations"><AutomationBuilderScreen {...props} /></HomeDestinationGuard>}</Stack.Screen>
                  </>
                ) : (
                  <Stack.Screen name="Auth">
                    {() => <AuthScreen
                      initialMode={invitationRequested ? 'invite' : 'login'}
                      onInvitationRequested={() => setInvitationRequested(true)}
                      onInvitationEnrollmentChange={(active) => {
                        setPasswordRecovery(active);
                        setInvitationEnrollment(active);
                      }}
                    />}
                  </Stack.Screen>
                )}
              </Stack.Navigator>
            </NavigationContainer>
          </BottomSheetModalProvider>
        </CommandFeedbackProvider>
      </View>
      {checkingMembership && (
        <View
          accessibilityViewIsModal
          style={styles.membershipOverlay}
        >
          {!membershipError && (
            <ActivityIndicator color={theme.colors.accent2} />
          )}
          <Text style={styles.text}>
            {membershipError
              ? "Unable to verify home access."
              : "Verifying your home…"}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setMembershipRetry((value) => value + 1)}
          >
            <Text style={styles.actionText}>Retry</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void cancelAuthFlow()
                .then(waitForAuthExchange)
                .then(() => supabase?.auth.signOut({ scope: "local" }));
            }}
          >
            <Text style={styles.subtext}>Sign out</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, width: '100%', alignSelf: 'center', overflow: 'hidden', backgroundColor: theme.colors.bg0 },
  desktopViewport: { maxWidth: 1366, maxHeight: 1024 },
  fill: { flex: 1, minHeight: 0 },
  membershipOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: theme.colors.bg0 },
  text: { color: theme.colors.text },
  actionText: { color: theme.colors.accent },
  subtext: { color: theme.colors.subtext },
  startupAction: { minHeight: 44, minWidth: 88, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  startupMessage: { maxWidth: 360, paddingHorizontal: 24, textAlign: 'center', lineHeight: 22 },
});
