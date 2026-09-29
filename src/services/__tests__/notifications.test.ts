import type { NotificationPermissionsStatus } from "expo-notifications";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "notification-id"),
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
}));

/** A fresh module resets the cached OS permission between independent cases. */
function loadNotifications() {
  const service = require("../notifications") as typeof import("../notifications");
  const platform = require("expo-notifications") as jest.Mocked<typeof import("expo-notifications")>;
  return { service, platform };
}

beforeEach(() => jest.resetModules());

it("does not request notification permission for an already-ended session", async () => {
  const { service, platform } = loadNotifications();
  await service.sendLocalNotification("Routine", "Private message", undefined, { shouldSend: () => false });
  expect(platform.getPermissionsAsync).not.toHaveBeenCalled();
  expect(platform.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it("does not schedule stale household details after pending OS permission resolves", async () => {
  const { service, platform } = loadNotifications();
  let resolvePermission!: (value: NotificationPermissionsStatus) => void;
  platform.getPermissionsAsync.mockImplementation(() => new Promise((resolve) => { resolvePermission = resolve; }));
  let current = true;
  const pending = service.sendLocalNotification("Routine", "Private message", undefined, { shouldSend: () => current });
  await Promise.resolve();
  current = false;
  resolvePermission({ status: "granted", granted: true, canAskAgain: true, expires: "never" } as NotificationPermissionsStatus);
  await pending;
  expect(platform.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it("schedules once when permission and the originating session remain valid", async () => {
  const { service, platform } = loadNotifications();
  await service.sendLocalNotification("Routine", "Evening ready", { kind: "automation" }, { shouldSend: () => true });
  expect(platform.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  expect(platform.scheduleNotificationAsync).toHaveBeenCalledWith({
    content: { title: "Routine", body: "Evening ready", sound: "default", data: { kind: "automation" } },
    trigger: null,
  });
});

it("preserves notification delivery for existing unguarded callers", async () => {
  const { service, platform } = loadNotifications();
  await service.sendLocalNotification("Power restored", "Main power is back online.");
  expect(platform.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});
