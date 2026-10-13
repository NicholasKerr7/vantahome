import { captureMembershipRead, isMembershipReadCurrent } from "../services/membershipRevision";
import React, { useEffect, useRef, useState } from "react";
import { AppState, Linking, View, StyleSheet, Platform, useWindowDimensions } from "react-native";
import {
  NavigationContainer,
  DefaultTheme,
  type NavigatorScreenParams,
  type NavigationState,
  type PartialState,
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
import { HomeCacheLoadError, hydrateHomeAccount, invalidateHomeMembership, useHomeStore } from "../store/useHomeStore";
import { resolveAuthExperience, runtimePolicy } from "../config/runtimeMode";
import {
  cancelAuthFlow,
  completeAuthCallback,
  needsInvitationPasswordSetup,
} from "../services/authFlow";
import { deviceClient } from "../services/deviceClient";
import PasswordRecoveryScreen from "../screens/PasswordRecoveryScreen";
import CommandFeedbackProvider from "../components/command-feedback/CommandFeedbackProvider";
import ModelHomeSync from '../features/three-d-home/ModelHomeSync';
import { SimulationLoadError } from '../features/three-d-home/simulationPersistence';
import HomeAccessScreen from '../features/home-access/HomeAccessScreen';
import CinematicArrival from '../features/arrival/CinematicArrival';
import { ArrivalContext, useArrivalCoordinator } from '../features/arrival/ArrivalContext';
import { hideNativeLaunch } from '../features/arrival/nativeLaunch';
import ArrivalInteractionShield from '../features/arrival/ArrivalInteractionShield';
import { isHomeInvitationUrl } from '../config/authRedirects';
import { signOutAccount } from '../features/account/accountSession';
import { isAccountScopeCurrent } from '../features/account/accountIdentity';
import { resolveSessionProfile } from '../features/account/sessionProfile';
import HomeDestinationGuard from '../features/home-shell/HomeDestinationGuard';
import { useWarmHomeRetention } from './useWarmHomeRetention';

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

/** Keep verification actions local to this account and discard results after the gate closes. */
function MembershipVerificationGate({ status, onRetry, returning, canSignOut, busy, statusMessage, statusDescription, onCoveredChange, onShowControls }: {
  status: 'preparing' | 'checking' | 'rendering' | 'ready' | 'inactive' | 'unavailable';
  onRetry?: () => void;
  returning: boolean;
  canSignOut: boolean;
  busy?: boolean;
  statusMessage?: string;
  statusDescription?: string;
  onCoveredChange: (covered: boolean) => void;
  onShowControls?: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signOutAttempt = useRef<symbol | null>(null);
  useEffect(() => () => { signOutAttempt.current = null; }, []);
  const accountScope = useHomeStore((state) => `${state.authenticatedUserId}:${state.sessionEpoch}`);
  useEffect(() => {
    signOutAttempt.current = null;
    setSigningOut(false);
    setSignOutError(null);
  }, [accountScope]);

  /** Ignore duplicate taps and never carry a delayed sign-out result into another account. */
  const handleSignOut = () => {
    if (signOutAttempt.current || busy) return;
    const attempt = Symbol('verification-sign-out');
    const scope = useHomeStore.getState();
    signOutAttempt.current = attempt;
    setSigningOut(true);
    setSignOutError(null);
    void signOutAccount(scope).catch(() => {
      if (signOutAttempt.current === attempt && isAccountScopeCurrent(scope, useHomeStore.getState())) {
        setSignOutError('Unable to sign out on this device. Please try again.');
      }
    }).finally(() => {
      if (signOutAttempt.current === attempt) {
        signOutAttempt.current = null;
        setSigningOut(false);
      }
    });
  };

  return <CinematicArrival
    status={status}
    returning={returning}
    onCoveredChange={onCoveredChange}
    onPosterReady={hideNativeLaunch}
    onShowControls={onShowControls}
    statusMessage={statusMessage}
    statusDescription={statusDescription}
    onRetry={onRetry ? () => { if (!signOutAttempt.current && !busy) onRetry(); } : undefined}
    onSignOut={canSignOut ? handleSignOut : undefined}
    signingOut={signingOut}
    retrying={busy}
    signOutError={signOutError}
  />;
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
  const [startupDescription, setStartupDescription] = useState('Retry to prepare your account on this device.');
  const [startupRetrying, setStartupRetrying] = useState(false);
  const retryStartup = useRef<(() => void) | null>(null);
  const [membershipRetry, setMembershipRetry] = useState(0);
  const membershipReady = useHomeStore((s) => s.membershipReady);
  const verification = useHomeStore((s) => s.membershipVerification);
  const guestExpiresAt = useHomeStore((s) => {
    const member = s.household.find((candidate) => candidate.id === s.activeMemberId);
    return member?.role === 'Guest' ? member.accessExpiresAt : null;
  });
  const [homeRoute, setHomeRoute] = useState<{ scope: string; visible: boolean } | null>(null);
  const appActive = useRef(AppState.currentState !== 'background');
  const lifecycleGeneration = useRef(0);
  const navigationScope = useHomeStore((s) =>
    `${s.authenticatedUserId ?? "demo"}:${s.sessionEpoch}:${s.accountHomeId ?? "unverified"}`,
  );
  // A keyed navigator starts at Home; React Navigation does not emit an initial
  // onStateChange, so a previous account's secondary route cannot suppress arrival.
  const homeRouteVisible = homeRoute?.scope === navigationScope ? homeRoute.visible : true;
  const arrival = useArrivalCoordinator(navigationScope);
  const [arrivalCovered, setArrivalCovered] = useState(true);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') lifecycleGeneration.current += 1;
      if (next !== 'inactive') appActive.current = next === 'active';
    });
    // Packaged immutable files may warm up alongside authentication; no household
    // data, WebView, renderer, or controls are opened before access is verified.
    if (Platform.OS !== 'web') {
      const { prewarmNativeScene } = require('../features/three-d-home/prepareNativeScene') as typeof import('../features/three-d-home/prepareNativeScene');
      prewarmNativeScene();
    }
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!supabase) {
      let mounted = true;
      let attempt = 0;
      /** Retry demo storage preparation without enabling any household screen on failure. */
      const prepareDemo = async (retry = false) => {
        const version = ++attempt;
        retryStartup.current = null;
        setStartupError(null);
        setStartupDescription('Retry to prepare your account on this device.');
        setStartupRetrying(retry);
        try {
          await hydrateHomeAccount(null, runtimePolicy.allowUnauthenticatedDemo);
          if (mounted && version === attempt) {
            setStartupRetrying(false);
            setAuthReady(true);
          }
        } catch (error) {
          if (!mounted || version !== attempt) return;
          setStartupRetrying(false);
          const cacheFailure = error instanceof HomeCacheLoadError || error instanceof SimulationLoadError;
          setStartupError(cacheFailure ? 'Saved home data is unavailable.' : 'Unable to prepare your home on this device.');
          if (cacheFailure) setStartupDescription(error.message);
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
    let latestSession: Session | null = null;
    let profilePrepared = false;
    let profileRevision = 0;
    let pendingProfileSave: { version: number; name: string; email: string | undefined; completion: Promise<void> } | null = null;
    let transition = 0;
    let receivedAuthEvent = false;
    /** Persist only changed identity text and keep a failed or stale save outside startup completion. */
    const prepareSessionProfile = async (currentSession: Session, version: number) => {
      const revision = ++profileRevision;
      const state = useHomeStore.getState();
      if (state.authenticatedUserId !== currentSession.user.id) return;
      // Profile persistence follows account identity; a same-account membership
      // refresh must not silently discard its success or storage failure.
      const isCurrent = () => mounted && version === transition && revision === profileRevision
        && state.authenticatedUserId === useHomeStore.getState().authenticatedUserId
        && state.sessionEpoch === useHomeStore.getState().sessionEpoch;
      const profile = resolveSessionProfile(state.profile.name, currentSession.user);
      let pending = pendingProfileSave;
      try {
        if (state.profile.name !== profile.name || state.profile.email !== profile.email) {
          pending = { ...profile, version, completion: Promise.resolve(state.setProfile(profile)) };
          pendingProfileSave = pending;
        }
        // A repeated token event must wait for an identical in-flight save,
        // rather than mistake its already-updated memory state for durable data.
        if (pending?.version === version && pending.name === profile.name && pending.email === profile.email) {
          await pending.completion;
        }
      } catch {
        if (!isCurrent()) return;
        profilePrepared = false;
        setAuthReady(false);
        setStartupRetrying(false);
        setStartupError('Unable to save your account on this device.');
        retryStartup.current = () => {
          if (isCurrent()) void receiveSession(latestSession, true);
        };
        return;
      } finally {
        if (pendingProfileSave === pending) pendingProfileSave = null;
      }
      if (!isCurrent()) return;
      setStartupError(null);
      setStartupDescription('Retry to prepare your account on this device.');
      setStartupRetrying(false);
      setAuthReady(true);
    };
    /** Hydrate one identity at a time; storage failures stay outside private navigation. */
    const receiveSession = async (nextSession: Session | null, retry = false) => {
      if (!mounted) return;
      const userId = nextSession?.user.id ?? null;
      latestSession = nextSession;
      if (currentUserId === userId && !retry) {
        setSession(nextSession);
        // Token/user updates may confirm a new login email without rehydrating
        // storage or replacing a display name edited on this device.
        if (profilePrepared && nextSession) {
          await prepareSessionProfile(nextSession, transition);
        }
        return;
      }
      if (currentUserId && currentUserId !== userId) {
        // Account-scoped credential setup cannot follow a different identity.
        setPasswordRecovery(false);
        setInvitationEnrollment(false);
      }
      currentUserId = userId;
      profilePrepared = false;
      const version = ++transition;
      retryStartup.current = null;
      setStartupError(null);
      setStartupDescription('Retry to prepare your account on this device.');
      setStartupRetrying(retry);
      deviceClient.resetSession();
      // Clearing is synchronous, before React can render the new identity.
      const hydration = hydrateHomeAccount(userId);
      setAuthReady(false);
      setSession(nextSession);
      if (!nextSession) {
        setPasswordRecovery(false);
        setInvitationEnrollment(false);
      }
      try {
        await hydration;
      } catch (error) {
        if (!mounted || version !== transition) return;
        setStartupRetrying(false);
        const cacheFailure = error instanceof HomeCacheLoadError;
        setStartupError(cacheFailure ? 'Saved account data is unavailable.' : 'Unable to prepare your account on this device.');
        if (cacheFailure) setStartupDescription(error.message);
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
        // Hydration restores only this account's cache. Metadata supplies a
        // first-login fallback; it must not undo a saved local display name.
        profilePrepared = true;
        await prepareSessionProfile(latestSession ?? nextSession, version);
        return;
      }
      profilePrepared = true;
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
    const generation = lifecycleGeneration.current;
    const read = captureMembershipRead();
    const isCurrent = () =>
      active && isMembershipReadCurrent(read) && appActive.current && lifecycleGeneration.current === generation &&
      useHomeStore.getState().sessionEpoch === sessionEpoch &&
      useHomeStore.getState().authenticatedUserId === session.user.id;
    const ensureMembership = async () => {
      useHomeStore.setState({ membershipVerification: 'checking' });
      const result = await syncMembershipFromSupabase(session.user.id);
      if (!isCurrent()) return;
      if (!result) {
        invalidateHomeMembership('missing');
        return;
      }
      if (!applyMembershipSnapshot(result, sessionEpoch)) {
        invalidateHomeMembership('failed');
      }
    };
    void ensureMembership().catch(() => {
      if (isCurrent()) invalidateHomeMembership('failed');
    });
    return () => {
      active = false;
    };
  }, [passwordRecovery, session?.user.id, authReady, membershipRetry]);

  // A renewal confirmed by the foreground or periodic sync replaces the earlier
  // missing-access result without requiring another login or invitation.
  const missingMembership = Boolean(session && !membershipReady && verification === 'missing');
  const checkingMembership = Boolean(session && !passwordRecovery && !membershipReady && !missingMembership);
  const needsHomeAccess = Boolean(session && !passwordRecovery && (missingMembership || invitationRequested));
  const authExperience = resolveAuthExperience({
    hasSupabase: Boolean(supabase),
    hasSession: Boolean(session),
  });
  // Shared background controls must obey the same credential and household gates
  // as private navigation, including when a verified session is later revoked.
  const homeReady = authReady && !passwordRecovery && !checkingMembership && !needsHomeAccess
    && (authExperience === "authenticated" || authExperience === "demo");
  const retainHome = useWarmHomeRetention({
    admitted: homeReady && Boolean(session) && homeRouteVisible,
    checking: authReady && checkingMembership && verification === 'checking' && !needsHomeAccess && homeRouteVisible,
    scope: navigationScope,
    guestExpiresAt,
  });
  const awaitingScene = homeReady && homeRouteVisible && !arrival.dismissed
    && (!arrival.scene || arrival.scene.status === 'loading');
  const arrivalStatus = !authReady
    ? startupError && !startupRetrying ? 'unavailable' : 'preparing'
    : checkingMembership ? verification === 'failed' ? 'unavailable' : 'checking'
    : awaitingScene ? 'rendering'
    : homeReady && homeRouteVisible && arrival.scene?.status === 'ready' ? 'ready' : 'inactive';
  // Privacy never waits for an animation callback; fades only affect presentation.
  const shieldNavigation = checkingMembership || arrivalCovered;

  /** Reuse graphics only from the main Home route, never a retained camera or account screen. */
  const trackHomeRoute = (state: NavigationState | PartialState<NavigationState> | undefined) => {
    const root = state?.routes[state.index ?? 0];
    const nested = root?.state;
    const leaf = nested?.routes[nested.index ?? 0];
    setHomeRoute({ scope: navigationScope, visible: root?.name === 'ThreeDHome' || (root?.name === 'Main' && (!leaf || leaf.name === 'Home')) });
  };

  return (
    <View style={[styles.viewport, desktopPreview && styles.desktopViewport]}>
      <ArrivalContext.Provider value={arrival.context}>
      <ArrivalInteractionShield blocked={shieldNavigation} hidden={checkingMembership}>
        {authReady && <CommandFeedbackProvider enabled={homeReady}>
          <BottomSheetModalProvider>
            {homeReady && <ModelHomeSync key={`model-home:${navigationScope}`} />}
            <NavigationContainer
              key={navigationScope}
              onStateChange={trackHomeRoute}
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
                ) : session && ((checkingMembership && !retainHome) || needsHomeAccess) ? (
                  <Stack.Screen name="HomeAccess">
                    {() => checkingMembership ? null : <HomeAccessScreen
                      userId={session.user.id}
                      email={session.user.email}
                      onComplete={() => setInvitationRequested(false)}
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
        </CommandFeedbackProvider>}
      </ArrivalInteractionShield>
      </ArrivalContext.Provider>
        <MembershipVerificationGate
          status={arrivalStatus}
          onCoveredChange={setArrivalCovered}
          onShowControls={homeReady && awaitingScene && arrival.scene ? arrival.showControls : undefined}
          statusMessage={!authReady && startupError && !startupRetrying ? startupError : undefined}
          statusDescription={!authReady && startupError && !startupRetrying ? startupDescription : undefined}
          returning={retainHome}
          busy={startupRetrying}
          canSignOut={Boolean(session) && (checkingMembership || Boolean(startupError))}
          onRetry={!authReady
            ? startupError ? () => retryStartup.current?.() : undefined
            : checkingMembership ? () => setMembershipRetry((value) => value + 1) : undefined}
        />
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, width: '100%', alignSelf: 'center', overflow: 'hidden', backgroundColor: theme.colors.bg0 },
  desktopViewport: { maxWidth: 1366, maxHeight: 1024 },
});
