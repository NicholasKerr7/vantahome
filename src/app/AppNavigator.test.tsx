import React from "react";
import { Linking } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import type { Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockGetSession = jest.fn();
const mockSetSession = jest.fn();
const mockExchangeCode = jest.fn();
const mockMembership = jest.fn();
const mockNavigationMount = jest.fn();
let mockAuthChanged: (event: string, session: Session | null) => void;

jest.mock("../services/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      setSession: (tokens: unknown) => mockSetSession(tokens),
      exchangeCodeForSession: (code: string) => mockExchangeCode(code),
      signOut: jest.fn(async () => ({ error: null })),
      onAuthStateChange: (callback: typeof mockAuthChanged) => {
        mockAuthChanged = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  },
}));
jest.mock("../services/membership", () => ({
  ...jest.requireActual("../services/membership"),
  syncMembershipFromSupabase: (...args: unknown[]) => mockMembership(...args),
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
    Screen: () => null,
  }),
}));
jest.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModalProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock("../screens/AuthScreen", () => () => null);
jest.mock("../screens/AuthRequiredScreen", () => () => null);
jest.mock("../screens/OnboardingScreen", () => () => null);
jest.mock("../components/BottomTabs", () => () => null);
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

import AppNavigator from "./AppNavigator";
import {
  hydrateHomeAccount,
  selectVisibleDevices,
  useHomeStore,
} from "../store/useHomeStore";
import { deviceClient } from "../services/deviceClient";
import type { MembershipSyncResult } from "../services/membership";

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
  let deliverLink: (event: { url: string }) => void;
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await hydrateHomeAccount(null);
    mockGetSession.mockResolvedValue({
      data: { session: sessionFor("alice") },
    });
    mockMembership.mockImplementation(async (id: string) => membershipFor(id));
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
    jest.restoreAllMocks();
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
    await act(async () => {
      mockAuthChanged("SIGNED_OUT", null);
      expect(useHomeStore.getState().devices).toEqual([]);
      expect(useHomeStore.getState().profile.email).toBeUndefined();
    });
    await act(async () => {
      mockAuthChanged("SIGNED_IN", sessionFor("bob"));
    });
    await waitFor(() =>
      expect(useHomeStore.getState().activeMemberId).toBe("bob"),
    );
    expect(
      selectVisibleDevices(useHomeStore.getState()).map((device) => device.id),
    ).toEqual(["bob-camera"]);
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
  });

  test("account changes remount private screen state but ordinary home refresh does not", async () => {
    render(<AppNavigator />);
    await waitFor(() => expect(useHomeStore.getState().membershipReady).toBe(true));
    const mounts = mockNavigationMount.mock.calls.length;
    act(() => {
      useHomeStore.setState({ activeHomeId: null, membershipReady: false });
      useHomeStore.setState({ activeHomeId: "alice-home", membershipReady: true });
    });
    expect(mockNavigationMount).toHaveBeenCalledTimes(mounts);
    await act(async () => { mockAuthChanged("SIGNED_IN", sessionFor("bob")); });
    await waitFor(() => expect(useHomeStore.getState().activeMemberId).toBe("bob"));
    expect(mockNavigationMount.mock.calls.length).toBeGreaterThan(mounts);
  });
});
