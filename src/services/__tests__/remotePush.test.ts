import AsyncStorage from "@react-native-async-storage/async-storage";
import { useHomeStore } from "../../store/useHomeStore";
import {
  disableRemotePushRegistration,
  startRemotePushInboxSync,
  syncRemotePushRegistration,
} from "../remotePush";
import {
  dispatchRemotePushNotification,
  registerPushDevice,
} from "../cloudRegistry";

const mockAddNotificationReceivedListener = jest.fn();
const mockAddNotificationResponseReceivedListener = jest.fn();
const mockGetLastNotificationResponseAsync = jest.fn();
const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) =>
    mockRequestPermissionsAsync(...args),
  getExpoPushTokenAsync: (...args: unknown[]) =>
    mockGetExpoPushTokenAsync(...args),
  addNotificationReceivedListener: (...args: unknown[]) =>
    mockAddNotificationReceivedListener(...args),
  addNotificationResponseReceivedListener: (...args: unknown[]) =>
    mockAddNotificationResponseReceivedListener(...args),
  getLastNotificationResponseAsync: (...args: unknown[]) =>
    mockGetLastNotificationResponseAsync(...args),
}));

jest.mock("../cloudRegistry", () => ({
  registerPushDevice: jest.fn(),
  dispatchRemotePushNotification: jest.fn(),
}));

const mockGetSession = jest.fn();

jest.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

describe("remotePush", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });
    mockGetPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockRequestPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockGetExpoPushTokenAsync.mockResolvedValue({
      data: "ExponentPushToken[test]",
    });
    mockAddNotificationReceivedListener.mockImplementation((handler) => ({
      remove: jest.fn(),
      handler,
    }));
    mockAddNotificationResponseReceivedListener.mockImplementation((handler) => ({
      remove: jest.fn(),
      handler,
    }));
    mockGetLastNotificationResponseAsync.mockResolvedValue(null);
    (registerPushDevice as jest.Mock).mockResolvedValue({ device: { id: "1" } });
    (dispatchRemotePushNotification as jest.Mock).mockResolvedValue({
      sent: 1,
      tickets: 1,
    });
    useHomeStore.setState({ notifications: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("registers the current installation with the Expo push token", async () => {
    const result = await syncRemotePushRegistration({
      preferences: useHomeStore.getState().preferences,
      timezone: "America/Denver",
    });

    expect(result.kind).toBe("registered");
    expect(registerPushDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        expoPushToken: "ExponentPushToken[test]",
        preferenceState: expect.objectContaining({
          notifications: true,
          timezone: "America/Denver",
        }),
      }),
    );
  });

  it("disables the current installation on sign out", async () => {
    await syncRemotePushRegistration({
      preferences: useHomeStore.getState().preferences,
      timezone: "America/Denver",
    });
    await disableRemotePushRegistration();

    expect(registerPushDevice).toHaveBeenLastCalledWith(
      expect.objectContaining({
        disabled: true,
        expoPushToken: null,
      }),
    );
  });

  it("adds remote notifications to the inbox and ignores local ones", async () => {
    startRemotePushInboxSync();

    const receivedHandler =
      mockAddNotificationReceivedListener.mock.calls[0][0];
    receivedHandler({
      request: {
        identifier: "remote-1",
        content: {
          title: "Remote title",
          body: "Remote body",
          data: {
            deliveryOrigin: "remote",
            appNotificationId: "remote-id",
            category: "security",
            isNew: true,
          },
        },
      },
    });
    receivedHandler({
      request: {
        identifier: "local-1",
        content: {
          title: "Local title",
          body: "Local body",
          data: {
            deliveryOrigin: "local",
            appNotificationId: "local-id",
            category: "info",
          },
        },
      },
    });

    const notifications = useHomeStore.getState().notifications;
    expect(notifications.find((entry) => entry.id === "remote-id")).toEqual(
      expect.objectContaining({
        title: "Remote title",
        body: "Remote body",
        category: "security",
      }),
    );
    expect(notifications.find((entry) => entry.id === "local-id")).toBeUndefined();
  });
});
