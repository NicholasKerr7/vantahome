import { useHomeStore } from "../../store/useHomeStore";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  AndroidImportance: { HIGH: "high" },
  AndroidNotificationVisibility: { PUBLIC: "public" },
}));

jest.mock("../remotePush", () => ({
  dispatchRemotePushNotification: jest.fn(() => Promise.resolve(true)),
}));

const Notifications = require("expo-notifications");
const { dispatchRemotePushNotification } = require("../remotePush");
const {
  processPersistentNotification,
  resetNotificationRuntimeState,
  sendLocalNotification,
} = require("../notifications");

const seed = useHomeStore.getState();

function resetStore() {
  useHomeStore.setState({
    profile: { ...seed.profile, securityMode: "home" },
    notifications: [],
    preferences: {
      ...seed.preferences,
      notifications: true,
      notificationQuietHoursEnabled: false,
      notificationCategories: {
        alert: true,
        device: true,
        scene: true,
        automation: true,
        security: true,
        info: true,
      },
      notificationRepeatMinutes: 10,
      notificationOpenDelayMinutes: 5,
    },
  });
}

describe("notifications", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-06T12:00:00.000Z"));
    jest.clearAllMocks();
    resetNotificationRuntimeState();
    resetStore();
    Notifications.getPermissionsAsync.mockResolvedValue({ status: "granted" });
    Notifications.requestPermissionsAsync.mockResolvedValue({
      status: "granted",
    });
    Notifications.scheduleNotificationAsync.mockResolvedValue(
      "os-notification-1",
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("sends a local notification, records it in the inbox, and fans out remotely", async () => {
    const sent = await sendLocalNotification(
      "Power outage",
      "Main power offline.",
      { kind: "power-outage" },
      { category: "alert", id: "notif-1" },
    );

    expect(sent).toBe(true);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "Power outage",
          body: "Main power offline.",
          data: expect.objectContaining({
            appNotificationId: "notif-1",
            category: "alert",
            deliveryOrigin: "local",
          }),
        }),
      }),
    );
    expect(dispatchRemotePushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Power outage",
        body: "Main power offline.",
        category: "alert",
        appNotificationId: "notif-1",
      }),
    );
    expect(useHomeStore.getState().notifications).toEqual([
      expect.objectContaining({
        id: "notif-1",
        title: "Power outage",
        body: "Main power offline.",
        category: "alert",
        osNotificationId: "os-notification-1",
      }),
    ]);
  });

  it("still dispatches remote push when local delivery is muted", async () => {
    useHomeStore.setState({
      preferences: {
        ...useHomeStore.getState().preferences,
        notifications: false,
      },
    });

    const sent = await sendLocalNotification(
      "Quiet local device",
      "Remote household members should still get this.",
      {},
      { category: "security", id: "notif-muted" },
    );

    expect(sent).toBe(false);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(dispatchRemotePushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "security",
        appNotificationId: "notif-muted",
      }),
    );
    expect(useHomeStore.getState().notifications).toEqual([]);
  });

  it("applies open delays and repeat intervals for persistent notifications", async () => {
    const send = jest.fn().mockResolvedValue(true);

    await processPersistentNotification({
      key: "entry-open",
      active: true,
      category: "security",
      delayMinutes: 5,
      repeatMinutes: 10,
      send,
    });
    expect(send).not.toHaveBeenCalled();

    jest.setSystemTime(new Date("2026-04-06T12:05:00.000Z"));
    await processPersistentNotification({
      key: "entry-open",
      active: true,
      category: "security",
      delayMinutes: 5,
      repeatMinutes: 10,
      send,
    });
    expect(send).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date("2026-04-06T12:14:00.000Z"));
    await processPersistentNotification({
      key: "entry-open",
      active: true,
      category: "security",
      delayMinutes: 5,
      repeatMinutes: 10,
      send,
    });
    expect(send).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date("2026-04-06T12:15:00.000Z"));
    await processPersistentNotification({
      key: "entry-open",
      active: true,
      category: "security",
      delayMinutes: 5,
      repeatMinutes: 10,
      send,
    });
    expect(send).toHaveBeenCalledTimes(2);

    await processPersistentNotification({
      key: "entry-open",
      active: false,
      category: "security",
      delayMinutes: 5,
      repeatMinutes: 10,
      send,
    });

    jest.setSystemTime(new Date("2026-04-06T12:16:00.000Z"));
    await processPersistentNotification({
      key: "entry-open",
      active: true,
      category: "security",
      delayMinutes: 5,
      repeatMinutes: 10,
      send,
    });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
