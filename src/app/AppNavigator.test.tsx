import React from "react";
import { Linking } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockGetSession = jest.fn();
const mockSetSession = jest.fn();
const mockExchangeCode = jest.fn();
const mockSignOut = jest.fn();
const mockMembership = jest.fn();
const mockNavigationMount = jest.fn();
const mockModelHomeSyncMount = jest.fn();
const mockModelHomeSyncUnmount = jest.fn();
const mockFeedbackEnabled = jest.fn();
const mockNeedsInvitationPasswordSetup = jest.fn();
let mockSupabaseAvailable = true;
let mockAuthChanged: (event: string, session: Session | null) => void;

jest.mock("../services/supabaseClient", () => {
  const client = {
    auth: {
      getSession: () => mockGetSession(),
      setSession: (tokens: unknown) => mockSetSession(tokens),
      exchangeCodeForSession: (code: string) => mockExchangeCode(code),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      onAuthStateChange: (callback: typeof mockAuthChanged) => {
        mockAuthChanged = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  };
  return {
    /** Exercise offline demo without changing the authenticated client behavior. */
    get supabase() { return mockSupabaseAvailable ? client : null; },
  };
});
jest.mock("../services/membership", () => ({
  ...jest.requireActual("../services/membership"),
  syncMembershipFromSupabase: (...args: unknown[]) => mockMembership(...args),
}));
jest.mock('../services/authFlow', () => ({
  ...jest.requireActual('../services/authFlow'),
  needsInvitationPasswordSetup: (...args: unknown[]) => mockNeedsInvitationPasswordSetup(...args),
}));
jest.mock("../services/secureSessionStorage", () => ({
  secureSessionStorage: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));
jest.mock("../services/deviceClient", () => ({
  deviceClient: { resetSession: jest.fn() },
}));
jest.mock("../services/cloudRegistry", () => ({
  bootstrapHome: jest.fn(async () => ({})),
}));
jest.mock("@react-navigation/native", () => ({
  DefaultTheme: { colors: {} },
  NavigationContainer: ({ children }: { children: React.ReactNode }) => {
    require("react").useEffect(() => { mockNavigationMount(); }, []);
    return children;
  },
}));
jest.mock("@react-navigation/native-stack", () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    /** Expose registration only; private screens stay unmounted in auth tests. */
    Screen: ({ name }: { name: string }) =>
      require("react").createElement(require("react-native").View, {
        testID: `registered-route-${name}`,
      }),
  }),
}));
jest.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModalProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock("../components/command-feedback/CommandFeedbackProvider", () => ({
  __esModule: true,
  /** Capture the privacy gate without mounting command subscriptions or a portal. */
  default: ({ children, enabled }: { children: React.ReactNode; enabled: boolean }) => {
    mockFeedbackEnabled(enabled);
    return children;
  },
}));
jest.mock("../features/three-d-home/ModelHomeSync", () => ({
  __esModule: true,
  /** Observe session remounts without starting model transport subscriptions. */
  default: () => {
    require("react").useEffect(() => {
      mockModelHomeSyncMount();
      return () => mockModelHomeSyncUnmount();
    }, []);
    return null;
  },
}));
jest.mock("../screens/AuthScreen", () => () => null);
jest.mock("../screens/AuthRequiredScreen", () => () => null);
jest.mock("../screens/OnboardingScreen", () => () => null);
jest.mock("./HomeNavigator", () => ({ __esModule: true, default: () => null, loadThreeDHomeScreen: () => () => null }));
jest.mock("../screens/DeviceDetailScreen", () => () => null);
jest.mock("../screens/RoomScreen", () => () => null);
jest.mock("../screens/NotificationsScreen", () => () => null);
jest.mock("../screens/ProfileScreen", () => () => null);
jest.mock("../screens/ManageRoomsScreen", () => () => null);
jest.mock("../screens/AutomationBuilderScreen", () => () => null);
jest.mock("../screens/CamerasScreen", () => () => null);
jest.mock("../screens/AuditLogScreen", () => () => null);
jest.mock("../screens/CameraViewerScreen", () => () => null);
jest.mock("../screens/PasswordRecoveryScreen", () => () => null);
jest.mock("../features/home-access/HomeAccessScreen", () => () => null);
jest.mock('../features/home-access/HomeVerificationScreen', () => ({
  __esModule: true,
  /** Keep gate integration tests independent of decorative animation and responsive presentation. */
  default: ({ status, onRetry, onSignOut, signingOut, signOutError }: {
    status: 'checking' | 'unavailable';
    onRetry: () => void;
    onSignOut: () => void;
    signingOut?: boolean;
    signOutError?: string | null;
  }) => {
    const { View, Text, Pressable } = require('react-native');
    return <View testID="home-verification-screen">
      <Text>{status === 'checking' ? 'Verifying your home…' : 'Unable to verify home access.'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry" disabled={signingOut} onPress={onRetry}><Text>Retry</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Sign out" disabled={signingOut} onPress={onSignOut}><Text>{signingOut ? 'Signing out…' : 'Sign out'}</Text></Pressable>
      {signOutError && <Text>{signOutError}</Text>}
    </View>;
  },
}));

import AppNavigator from "./AppNavigator";
import HomeVerificationScreen from '../features/home-access/HomeVerificationScreen';
import {
  hydrateHomeAccount,
  selectVisibleDevices,
  useHomeStore,
} from "../store/useHomeStore";
import { deviceClient } from "../services/deviceClient";
import { applyMembershipSnapshot, type MembershipSyncResult } from "../services/membership";
import { bootstrapHome } from '../services/cloudRegistry';

const sessionFor = (id: string) =>
  ({
    access_token: `test-access-${id}`,
    refresh_token: `test-refresh-${id}`,
    user: { id, email: `${id}@example.test`, user_metadata: {} },
  }) as Session;
const membershipFor = (id: string): MembershipSyncResult => ({
  homeId: `${id}-home`,
  activeMemberId: id,
  household: [{ id, name: id, role: "Owner", status: "home" }],
  roomMembers: [],
  permissionOverrides: [],
  rooms: [{ id: `${id}-room`, name: `${id} room` }],
  devices: [
    {
      id: `${id}-camera`,
      name: "Camera",
      kind: "camera",
      roomId: `${id}-room`,
      isOn: true,
      streamUrl: "https://camera.example.test/live?token=test",
    },
  ],
});

describe("navigation session boundaries", () => {
  const previousThreeDFlag = process.env.EXPO_PUBLIC_ENABLE_3D_HOME;
  let deliverLink: (event: { url: string }) => void;
  beforeEach(async () => {
    mockSupabaseAvailable = true;
    process.env.EXPO_PUBLIC_ENABLE_3D_HOME = "true";
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await hydrateHomeAccount(null);
    mockGetSession.mockResolvedValue({
      data: { session: sessionFor("alice") },
    });
    mockSignOut.mockResolvedValue({ error: null });
    mockMembership.mockImplementation(async (id: string) => membershipFor(id));
    mockNeedsInvitationPasswordSetup.mockResolvedValue(false);
    jest.spyOn(Linking, "getInitialURL").mockResolvedValue(null);
    jest
      .spyOn(Linking, "addEventListener")
      .mockImplementation((_, callback) => {
        deliverLink = callback;
        return { remove: jest.fn() } as unknown as ReturnType<
          typeof Linking.addEventListener
        >;
      });
  });
  afterEach(() => {
    mockSupabaseAvailable = true;
    if (previousThreeDFlag === undefined) {
      delete process.env.EXPO_PUBLIC_ENABLE_3D_HOME;
    } else {
      process.env.EXPO_PUBLIC_ENABLE_3D_HOME = previousThreeDFlag;
    }
    jest.restoreAllMocks();
  });

  test("offline demo keeps sibling keys distinct and resets both components only for a new session scope", async () => {
    mockSupabaseAvailable = false;
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.getByTestId("registered-route-Main")).toBeTruthy());
    expect(mockNavigationMount).toHaveBeenCalledTimes(1);
    expect(mockModelHomeSyncMount).toHaveBeenCalledTimes(1);
    expect(mockGetSession).not.toHaveBeenCalled();

    act(() => { useHomeStore.setState({ activeHomeId: "demo-home" }); });
    expect(mockNavigationMount).toHaveBeenCalledTimes(1);
    expect(mockModelHomeSyncMount).toHaveBeenCalledTimes(1);

    act(() => {
      useHomeStore.setState({ sessionEpoch: useHomeStore.getState().sessionEpoch + 1 });
    });
    expect(mockNavigationMount).toHaveBeenCalledTimes(2);
    expect(mockModelHomeSyncMount).toHaveBeenCalledTimes(2);
    expect(consoleError.mock.calls.filter(([message]) =>
      String(message).includes("Encountered two children with the same key"),
    )).toEqual([]);
  });

  test('demo hydration failure shows a retry without mounting the model or private routes', async () => {
    mockSupabaseAvailable = false;
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('Storage unavailable'));
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.getByText('Unable to prepare your home on this device.')).toBeTruthy());
    expect(mockModelHomeSyncMount).not.toHaveBeenCalled();
    expect(mockNavigationMount).not.toHaveBeenCalled();
    expect(screen.queryByText('Sign out')).toBeNull();
    fireEvent.press(screen.getByText('Retry'));
    await waitFor(() => expect(screen.getByTestId('registered-route-Main')).toBeTruthy());
    expect(screen.queryByText('Unable to prepare your home on this device.')).toBeNull();
  });

  test('authenticated hydration failure keeps household routes closed until retry succeeds', async () => {
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('Storage unavailable'));
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.getByText('Unable to prepare your account on this device.')).toBeTruthy());
    expect(screen.getByText('Sign out')).toBeTruthy();
    expect(mockNavigationMount).not.toHaveBeenCalled();
    expect(mockMembership).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Retry'));
    await waitFor(() => expect(screen.getByTestId('registered-route-Main')).toBeTruthy());
    expect(useHomeStore.getState().authenticatedUserId).toBe('alice');
    expect(mockMembership).toHaveBeenCalledWith('alice');
  });

  test('a late hydration error from a previous account cannot replace the current home', async () => {
    let fail: (error: Error) => void = () => {};
    jest.mocked(AsyncStorage.getItem).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(useHomeStore.getState().authenticatedUserId).toBe('alice'));
    await act(async () => { mockAuthChanged('SIGNED_IN', sessionFor('bob')); });
    await waitFor(() => expect(screen.getByTestId('registered-route-Main')).toBeTruthy());
    await act(async () => { fail(new Error('Old account storage failed')); });
    expect(screen.queryByText('Unable to prepare your account on this device.')).toBeNull();
    expect(useHomeStore.getState().activeMemberId).toBe('bob');
  });

  test("3D Home is available within the authenticated stack only", async () => {
    const screen = render(<AppNavigator />);
    await waitFor(() =>
      expect(useHomeStore.getState().membershipReady).toBe(true),
    );
    expect(screen.getByTestId("registered-route-ThreeDHome")).toBeTruthy();
    await act(async () => {
      mockAuthChanged("SIGNED_OUT", null);
    });
    expect(screen.queryByTestId("registered-route-ThreeDHome")).toBeNull();
  });

  test("the 3D shell is the first private route and retains features when graphics are disabled", async () => {
    process.env.EXPO_PUBLIC_ENABLE_3D_HOME = "false";
    const screen = render(<AppNavigator />);
    await waitFor(() =>
      expect(useHomeStore.getState().membershipReady).toBe(true),
    );
    expect(screen.getByTestId("registered-route-ThreeDHome")).toBeTruthy();
    expect(screen.getByTestId("registered-route-Main")).toBeTruthy();
    expect(screen.getAllByTestId(/^registered-route-/)[0].props.testID).toBe('registered-route-Main');
    expect(screen.getByTestId("registered-route-Integrations")).toBeTruthy();
    expect(screen.getByTestId("registered-route-DeviceDetail")).toBeTruthy();
  });

  test("command feedback waits for authentication and verified home access", async () => {
    let finishSession: (value: { data: { session: Session } }) => void = () => {};
    let finishMembership: (value: MembershipSyncResult) => void = () => {};
    mockGetSession.mockImplementationOnce(() => new Promise((resolve) => {
      finishSession = resolve;
    }));
    mockMembership.mockImplementationOnce(() => new Promise((resolve) => {
      finishMembership = resolve;
    }));
    const screen = render(<AppNavigator />);
    expect(mockFeedbackEnabled).not.toHaveBeenCalled();
    expect(mockNavigationMount).not.toHaveBeenCalled();

    await act(async () => { finishSession({ data: { session: sessionFor("alice") } }); });
    await waitFor(() => expect(mockMembership).toHaveBeenCalledWith("alice"));
    expect(screen.getByText("Verifying your home…")).toBeTruthy();
    expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(false);
    expect(mockFeedbackEnabled).not.toHaveBeenCalledWith(true);
    expect(mockNavigationMount).toHaveBeenCalled();

    await act(async () => { finishMembership(membershipFor("alice")); });
    await waitFor(() => expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(true));
    expect(screen.queryByText("Verifying your home…")).toBeNull();
  });

  test("a signed-out launch keeps command feedback disabled", async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    render(<AppNavigator />);
    await waitFor(() => expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(false));
    expect(mockFeedbackEnabled).not.toHaveBeenCalledWith(true);
    expect(mockMembership).not.toHaveBeenCalled();
    expect(mockNavigationMount).toHaveBeenCalled();
    expect(mockModelHomeSyncMount).not.toHaveBeenCalled();
  });

  test('accounts with no membership enter the invitation gate without creating a household', async () => {
    mockMembership.mockResolvedValueOnce(null);
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.queryByText('Verifying your home…')).toBeNull());
    await waitFor(() => expect(screen.getByTestId('registered-route-HomeAccess')).toBeTruthy());
    expect(screen.queryByTestId('registered-route-Main')).toBeNull();
    expect(bootstrapHome).not.toHaveBeenCalled();
    expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(false);
    expect(mockModelHomeSyncMount).not.toHaveBeenCalled();
  });

  test('a verified renewal refresh releases the earlier missing-membership gate', async () => {
    mockMembership.mockResolvedValueOnce(null);
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.getByTestId('registered-route-HomeAccess')).toBeTruthy());
    expect(screen.queryByTestId('registered-route-Main')).toBeNull();
    expect(mockModelHomeSyncMount).not.toHaveBeenCalled();
    const renewed = membershipFor('alice');
    renewed.household[0] = { ...renewed.household[0], role: 'Guest', accessExpiresAt: '2099-01-01T12:00:00Z' };
    renewed.roomMembers = [{ memberId: 'alice', roomIds: ['alice-room'] }];
    // The runtime installs the same authoritative snapshot on its timer or foreground refresh.
    act(() => { expect(applyMembershipSnapshot(renewed, useHomeStore.getState().sessionEpoch)).toBe(true); });
    expect(screen.getByTestId('registered-route-Main')).toBeTruthy();
    expect(screen.queryByTestId('registered-route-HomeAccess')).toBeNull();
    expect(mockModelHomeSyncMount).toHaveBeenCalledTimes(1);
    expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(true);
    expect(bootstrapHome).not.toHaveBeenCalled();
  });

  test('a stale renewal snapshot cannot release another account from the invitation gate', async () => {
    mockMembership.mockResolvedValue(null);
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.getByTestId('registered-route-HomeAccess')).toBeTruthy());
    const oldEpoch = useHomeStore.getState().sessionEpoch;
    await act(async () => { mockAuthChanged('SIGNED_IN', sessionFor('bob')); });
    await waitFor(() => expect(mockMembership).toHaveBeenCalledWith('bob'));
    act(() => { expect(applyMembershipSnapshot(membershipFor('alice'), oldEpoch)).toBe(false); });
    expect(screen.getByTestId('registered-route-HomeAccess')).toBeTruthy();
    expect(screen.queryByTestId('registered-route-Main')).toBeNull();
    expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(false);
  });

  test('private routes are not mounted before membership verification finishes', async () => {
    mockMembership.mockImplementationOnce(() => new Promise(() => {}));
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.getByText('Verifying your home…')).toBeTruthy());
    expect(screen.queryByTestId('registered-route-Main')).toBeNull();
    expect(screen.queryByTestId('registered-route-ThreeDHome')).toBeNull();
    expect(mockModelHomeSyncMount).not.toHaveBeenCalled();
  });

  test('authenticated virtual homes mount the model clock only after verification and remove it when access is revoked', async () => {
    let finishMembership: (value: MembershipSyncResult) => void = () => {};
    mockMembership.mockImplementationOnce(() => new Promise((resolve) => { finishMembership = resolve; }));
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.getByText('Verifying your home…')).toBeTruthy());
    expect(mockModelHomeSyncMount).not.toHaveBeenCalled();
    const result = membershipFor('alice');
    result.rooms = [{ id: 'alice-room', name: 'Grounds', modelRoomId: 'grounds' }];
    result.devices = [{ id: 'alice-gate', name: 'Gate', kind: 'gate', roomId: 'alice-room', modelDeviceId: 'entry-gate', simulationOnly: true, isOn: false }];
    await act(async () => { finishMembership(result); });
    await waitFor(() => expect(screen.getByTestId('registered-route-Main')).toBeTruthy());
    expect(mockModelHomeSyncMount).toHaveBeenCalledTimes(1);
    expect(useHomeStore.getState().devices[0].simulationOnly).toBe(true);
    act(() => { useHomeStore.setState({ membershipReady: false, activeHomeId: null }); });
    expect(mockModelHomeSyncUnmount).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('registered-route-Main')).toBeNull();
  });

  test('a canonical invitation link opens the inbox for an existing member without exchanging credentials', async () => {
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.getByTestId('registered-route-Main')).toBeTruthy());
    await act(async () => { deliverLink({ url: 'vantahome://join-home' }); });
    expect(screen.getByTestId('registered-route-HomeAccess')).toBeTruthy();
    expect(screen.queryByTestId('registered-route-Main')).toBeNull();
    expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(false);
    expect(mockExchangeCode).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  test('an invitation URL carrying tokens cannot alter the authenticated navigation state', async () => {
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.getByTestId('registered-route-Main')).toBeTruthy());
    await act(async () => { deliverLink({ url: 'vantahome://join-home#access_token=other&refresh_token=other' }); });
    expect(screen.getByTestId('registered-route-Main')).toBeTruthy();
    expect(screen.queryByTestId('registered-route-HomeAccess')).toBeNull();
    expect(mockExchangeCode).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  test("password recovery hides feedback even for an already verified account", async () => {
    render(<AppNavigator />);
    await waitFor(() => expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(true));
    const mounts = mockNavigationMount.mock.calls.length;
    await act(async () => { mockAuthChanged("PASSWORD_RECOVERY", sessionFor("alice")); });
    expect(useHomeStore.getState().membershipReady).toBe(true);
    expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(false);
    expect(mockNavigationMount).toHaveBeenCalledTimes(mounts);
    expect(mockModelHomeSyncUnmount).toHaveBeenCalledTimes(1);
  });

  test('unfinished invitation password setup resumes on launch before household access', async () => {
    mockNeedsInvitationPasswordSetup.mockResolvedValueOnce(true);
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.getByTestId('registered-route-PasswordRecovery')).toBeTruthy());
    expect(mockNeedsInvitationPasswordSetup).toHaveBeenCalledWith('alice');
    expect(mockMembership).not.toHaveBeenCalled();
    expect(screen.queryByTestId('registered-route-Main')).toBeNull();
    expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(false);
    expect(mockModelHomeSyncMount).not.toHaveBeenCalled();
  });

  test('an unreadable invitation marker exposes credential setup rather than leaving startup blank', async () => {
    mockNeedsInvitationPasswordSetup.mockRejectedValueOnce(new Error('Secure storage is unavailable.'));
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.getByTestId('registered-route-PasswordRecovery')).toBeTruthy());
    expect(mockMembership).not.toHaveBeenCalled();
    expect(screen.queryByTestId('registered-route-Main')).toBeNull();
  });

  test('a slow enrollment check for another account cannot replace the current navigation', async () => {
    let finish: (value: boolean) => void = () => {};
    mockNeedsInvitationPasswordSetup.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(mockNeedsInvitationPasswordSetup).toHaveBeenCalledWith('alice'));
    await act(async () => { mockAuthChanged('SIGNED_IN', sessionFor('bob')); });
    await waitFor(() => expect(screen.getByTestId('registered-route-Main')).toBeTruthy());
    await act(async () => { finish(true); });
    expect(useHomeStore.getState().authenticatedUserId).toBe('bob');
    expect(screen.queryByTestId('registered-route-PasswordRecovery')).toBeNull();
  });

  test('password setup for a previous identity cannot follow a different signed-in account', async () => {
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(true));
    await act(async () => { mockAuthChanged('PASSWORD_RECOVERY', sessionFor('alice')); });
    expect(screen.getByTestId('registered-route-PasswordRecovery')).toBeTruthy();
    await act(async () => { mockAuthChanged('SIGNED_IN', sessionFor('bob')); });
    await waitFor(() => expect(useHomeStore.getState().activeMemberId).toBe('bob'));
    expect(screen.queryByTestId('registered-route-PasswordRecovery')).toBeNull();
    expect(screen.getByTestId('registered-route-Main')).toBeTruthy();
  });

  test("an unsolicited token callback cannot replace an existing account", async () => {
    render(<AppNavigator />);
    await waitFor(() =>
      expect(useHomeStore.getState().membershipReady).toBe(true),
    );
    await act(async () => {
      deliverLink({
        url: "vantahome://auth-callback#access_token=other&refresh_token=other",
      });
    });
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockExchangeCode).not.toHaveBeenCalled();
    expect(useHomeStore.getState().authenticatedUserId).toBe("alice");
  });

  test("sign-out clears data immediately and sign-in installs only the new registry", async () => {
    render(<AppNavigator />);
    await waitFor(() =>
      expect(useHomeStore.getState().membershipReady).toBe(true),
    );
    expect(selectVisibleDevices(useHomeStore.getState())[0].id).toBe(
      "alice-camera",
    );
    expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(true);
    await act(async () => {
      mockAuthChanged("SIGNED_OUT", null);
      expect(useHomeStore.getState().devices).toEqual([]);
      expect(useHomeStore.getState().profile.email).toBeUndefined();
    });
    expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(false);
    await act(async () => {
      mockAuthChanged("SIGNED_IN", sessionFor("bob"));
    });
    await waitFor(() =>
      expect(useHomeStore.getState().activeMemberId).toBe("bob"),
    );
    expect(
      selectVisibleDevices(useHomeStore.getState()).map((device) => device.id),
    ).toEqual(["bob-camera"]);
    expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(true);
    expect(deviceClient.resetSession).toHaveBeenCalledTimes(3);
  });

  test("a slow response for an old login cannot revive its household", async () => {
    let finish: (value: MembershipSyncResult) => void = () => {};
    mockMembership.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<AppNavigator />);
    await waitFor(() => expect(mockMembership).toHaveBeenCalledWith("alice"));
    await act(async () => {
      mockAuthChanged("SIGNED_IN", sessionFor("bob"));
    });
    await waitFor(() =>
      expect(useHomeStore.getState().activeMemberId).toBe("bob"),
    );
    await act(async () => {
      finish(membershipFor("alice"));
    });
    expect(useHomeStore.getState().activeHomeId).toBe("bob-home");
  });

  test("failed membership leaves private content gated with a working retry", async () => {
    mockMembership.mockRejectedValueOnce(new Error("Offline"));
    const screen = render(<AppNavigator />);
    await waitFor(() =>
      expect(screen.getByText("Unable to verify home access.")).toBeTruthy(),
    );
    expect(screen.getByText("Retry")).toBeTruthy();
    expect(screen.getByText("Sign out")).toBeTruthy();
    expect(selectVisibleDevices(useHomeStore.getState())).toEqual([]);
    expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(false);
    expect(mockFeedbackEnabled).not.toHaveBeenCalledWith(true);
    fireEvent.press(screen.getByText("Retry"));
    await waitFor(() => expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(true));
    expect(screen.queryByText("Unable to verify home access.")).toBeNull();
  });

  test('Retry restarts a stalled verification and ignores the replaced response', async () => {
    let finishOld: (value: MembershipSyncResult | null) => void = () => {};
    mockMembership.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.getByText('Verifying your home…')).toBeTruthy());
    expect(screen.getByTestId('home-verification-screen')).toBeTruthy();
    expect(mockModelHomeSyncMount).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByTestId('registered-route-Main')).toBeTruthy());
    await act(async () => { finishOld(null); });
    expect(screen.queryByTestId('home-verification-screen')).toBeNull();
    expect(screen.queryByTestId('registered-route-HomeAccess')).toBeNull();
    expect(mockMembership).toHaveBeenCalledTimes(2);
    expect(mockModelHomeSyncMount).toHaveBeenCalledTimes(1);
    expect(useHomeStore.getState().activeHomeId).toBe('alice-home');
  });

  test('verification sign-out prevents duplicate requests, exposes failure, and permits another attempt', async () => {
    let failSignOut: (error: Error) => void = () => {};
    mockMembership.mockRejectedValue(new Error('Offline'));
    mockSignOut.mockImplementationOnce(() => new Promise((_, reject) => { failSignOut = reject; }));
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.getByText('Unable to verify home access.')).toBeTruthy());
    // Invoke before React commits disabled buttons to exercise the synchronous tap guard.
    const { onSignOut: signOut, onRetry: retry } = screen.UNSAFE_getByType(HomeVerificationScreen).props;
    act(() => { signOut(); signOut(); retry(); });
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(screen.getByText('Signing out…')).toBeTruthy();
    expect(mockMembership).toHaveBeenCalledTimes(1);
    expect(mockModelHomeSyncMount).not.toHaveBeenCalled();
    await act(async () => { failSignOut(new Error('Local session storage unavailable')); });
    expect(screen.getByText('Unable to sign out on this device. Please try again.')).toBeTruthy();
    expect(screen.queryByText('Signing out…')).toBeNull();
    mockSignOut.mockImplementationOnce(async () => {
      mockAuthChanged('SIGNED_OUT', null);
      return { error: null };
    });
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByTestId('registered-route-Auth')).toBeTruthy());
    expect(screen.queryByTestId('home-verification-screen')).toBeNull();
    expect(mockSignOut).toHaveBeenCalledTimes(2);
    expect(mockFeedbackEnabled).not.toHaveBeenCalledWith(true);
  });

  test('a delayed sign-out session check cannot sign out a newly selected account', async () => {
    let finishSession: (value: { data: { session: Session } }) => void = () => {};
    mockMembership.mockRejectedValue(new Error('Offline'));
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.getByText('Unable to verify home access.')).toBeTruthy());
    mockGetSession.mockImplementationOnce(() => new Promise((resolve) => { finishSession = resolve; }));
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mockGetSession).toHaveBeenCalledTimes(2));
    await act(async () => { mockAuthChanged('SIGNED_IN', sessionFor('bob')); });
    await waitFor(() => expect(mockMembership).toHaveBeenCalledWith('bob'));
    await act(async () => { finishSession({ data: { session: sessionFor('alice') } }); });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(screen.getByText('Sign out')).toBeTruthy();
    expect(screen.queryByText('Unable to sign out on this device. Please try again.')).toBeNull();
    expect(useHomeStore.getState().authenticatedUserId).toBe('bob');
    expect(screen.queryByTestId('registered-route-Main')).toBeNull();
  });

  test('a late sign-out error from the prior account does not enter the new verification screen', async () => {
    let failSignOut: (error: Error) => void = () => {};
    mockMembership.mockRejectedValue(new Error('Offline'));
    mockSignOut.mockImplementationOnce(() => new Promise((_, reject) => { failSignOut = reject; }));
    const screen = render(<AppNavigator />);
    await waitFor(() => expect(screen.getByText('Unable to verify home access.')).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    await act(async () => { mockAuthChanged('SIGNED_IN', sessionFor('bob')); });
    await waitFor(() => expect(mockMembership).toHaveBeenCalledWith('bob'));
    await act(async () => { failSignOut(new Error('Previous account storage failed')); });
    expect(screen.queryByText('Unable to sign out on this device. Please try again.')).toBeNull();
    expect(screen.getByText('Sign out')).toBeTruthy();
    expect(useHomeStore.getState().authenticatedUserId).toBe('bob');
    expect(mockFeedbackEnabled).not.toHaveBeenCalledWith(true);
  });

  test("account changes remount private screen state but ordinary home refresh does not", async () => {
    render(<AppNavigator />);
    await waitFor(() => expect(useHomeStore.getState().membershipReady).toBe(true));
    const mounts = mockNavigationMount.mock.calls.length;
    act(() => {
      useHomeStore.setState({ activeHomeId: null, membershipReady: false });
    });
    expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(false);
    expect(mockNavigationMount).toHaveBeenCalledTimes(mounts);
    act(() => {
      useHomeStore.setState({ activeHomeId: "alice-home", membershipReady: true });
    });
    expect(mockFeedbackEnabled).toHaveBeenLastCalledWith(true);
    expect(mockNavigationMount).toHaveBeenCalledTimes(mounts);
    await act(async () => { mockAuthChanged("SIGNED_IN", sessionFor("bob")); });
    await waitFor(() => expect(useHomeStore.getState().activeMemberId).toBe("bob"));
    expect(mockNavigationMount.mock.calls.length).toBeGreaterThan(mounts);
  });
});
