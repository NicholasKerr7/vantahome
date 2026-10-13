import type { NotificationPermissionsStatus } from "expo-notifications";

let mockState = {
  preferences: { notifications: true },
  authenticatedUserId: 'alice', accountUserId: 'alice',
  activeHomeId: 'home', accountHomeId: 'home', sessionEpoch: 1, membershipReady: true,
};
jest.mock('../../store/useHomeStore', () => ({ useHomeStore: { getState: () => mockState } }));
jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: jest.fn(() => `notice-${++sequence}`) };
});

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

beforeEach(() => {
  jest.resetModules();
  mockState.preferences.notifications = true;
  mockState.sessionEpoch = 1;
});

it('does not ask for OS permission or schedule while notifications are disabled', async () => {
  const { service, platform } = loadNotifications();
  mockState.preferences.notifications = false;
  await expect(service.ensureNotificationsReady()).resolves.toBe(false);
  await service.sendLocalNotification('Routine', 'Evening ready');
  expect(platform.getPermissionsAsync).not.toHaveBeenCalled();
  expect(platform.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(platform.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('silences foreground presentation when the user turns notifications off', async () => {
  const { service, platform } = loadNotifications();
  await service.sendLocalNotification('Routine', 'Evening ready');
  const handler = platform.setNotificationHandler.mock.calls[0][0];
  const notification = { request: { content: platform.scheduleNotificationAsync.mock.calls[0][0].content } } as
    Parameters<NonNullable<typeof handler>['handleNotification']>[0];
  expect(await handler?.handleNotification(notification)).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
  mockState.preferences.notifications = false;
  expect(await handler?.handleNotification(notification)).toEqual({
    shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false,
  });
});

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
    content: { title: "Routine", body: "Evening ready", sound: "default", data: { kind: "automation", vantahomeNotificationSession: expect.any(String), vantahomeNotificationDelivery: expect.any(String) } },
    trigger: null,
  });
});

it('suppresses queued foreground delivery after switching accounts even when both allow notifications', async () => {
  const { service, platform } = loadNotifications();
  await service.sendLocalNotification('Routine', 'Private account details');
  const handler = platform.setNotificationHandler.mock.calls[0][0];
  const notification = { request: { content: platform.scheduleNotificationAsync.mock.calls[0][0].content } } as
    Parameters<NonNullable<typeof handler>['handleNotification']>[0];
  mockState = { ...mockState, sessionEpoch: mockState.sessionEpoch + 1 };
  expect(await handler?.handleNotification(notification)).toMatchObject({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false });
  await service.sendLocalNotification('Routine', 'Current account details');
  expect(await handler?.handleNotification(notification)).toMatchObject({ shouldShowBanner: false, shouldPlaySound: false });
  const current = { request: { content: platform.scheduleNotificationAsync.mock.calls[1][0].content } } as
    Parameters<NonNullable<typeof handler>['handleNotification']>[0];
  expect(await handler?.handleNotification(current)).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
});

it('does not present an unscoped legacy notice in the current foreground account', async () => {
  const { platform } = loadNotifications();
  const handler = platform.setNotificationHandler.mock.calls[0][0];
  const notification = { request: { content: { data: {} } } } as
    Parameters<NonNullable<typeof handler>['handleNotification']>[0];
  expect(await handler?.handleNotification(notification)).toMatchObject({ shouldShowBanner: false, shouldPlaySound: false });
});

it("preserves notification delivery for existing unguarded callers", async () => {
  const { service, platform } = loadNotifications();
  await service.sendLocalNotification("Power restored", "Main power is back online.");
  expect(platform.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});

it.each(['preference', 'session'] as const)('cancels a pending notification when its %s changes', async (change) => {
  const { service, platform } = loadNotifications();
  let resolvePermission!: (value: NotificationPermissionsStatus) => void;
  platform.getPermissionsAsync.mockImplementation(() => new Promise((resolve) => { resolvePermission = resolve; }));
  const pending = service.sendLocalNotification('Routine', 'Private message');
  await Promise.resolve();
  if (change === 'preference') mockState.preferences.notifications = false;
  else mockState = { ...mockState, sessionEpoch: mockState.sessionEpoch + 1 };
  resolvePermission({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' } as NotificationPermissionsStatus);
  await pending;
  expect(platform.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(platform.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('rechecks OS permission after a previously denied attempt', async () => {
  const { service, platform } = loadNotifications();
  platform.getPermissionsAsync.mockResolvedValueOnce({ status: 'denied', canAskAgain: false } as NotificationPermissionsStatus);
  await service.sendLocalNotification('Routine', 'First attempt');
  expect(platform.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(platform.scheduleNotificationAsync).not.toHaveBeenCalled();
  await service.sendLocalNotification('Routine', 'After allowing in device settings');
  expect(platform.getPermissionsAsync).toHaveBeenCalledTimes(2);
  expect(platform.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});

it('retries a failed permission lookup instead of caching a rejected promise', async () => {
  const { service, platform } = loadNotifications();
  platform.getPermissionsAsync.mockRejectedValueOnce(new Error('Device unavailable'));
  await expect(service.ensureNotificationsReady()).rejects.toThrow('Device unavailable');
  await expect(service.ensureNotificationsReady()).resolves.toBe(true);
});

it('does not repeatedly prompt after refusal but recognizes a later OS grant', async () => {
  const { service, platform } = loadNotifications();
  platform.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true } as NotificationPermissionsStatus);
  platform.requestPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true } as NotificationPermissionsStatus);
  await expect(service.ensureNotificationsReady()).resolves.toBe(false);
  await expect(service.ensureNotificationsReady()).resolves.toBe(false);
  expect(platform.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  platform.getPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true } as NotificationPermissionsStatus);
  await expect(service.ensureNotificationsReady()).resolves.toBe(true);
});

it('rechecks device grants at foreground presentation after OS scheduling has accepted a notice', async () => {
  const { service, platform } = loadNotifications();
  let roomVisible = true;
  await service.sendLocalNotification('Reported CO₂ above limit', 'Private room', { kind: 'condition' }, { shouldSend: () => roomVisible });
  const handler = platform.setNotificationHandler.mock.calls[0][0];
  const notification = { request: { content: platform.scheduleNotificationAsync.mock.calls[0][0].content } } as
    Parameters<NonNullable<typeof handler>['handleNotification']>[0];
  roomVisible = false;
  expect(await handler?.handleNotification(notification)).toMatchObject({ shouldShowBanner: false, shouldPlaySound: false });
  roomVisible = true;
  expect(await handler?.handleNotification(notification)).toMatchObject({ shouldShowBanner: false, shouldPlaySound: false });
});

it('consumes a permitted delivery guard once and never puts grant data in the OS payload', async () => {
  const { service, platform } = loadNotifications();
  const allowed = jest.fn(() => true);
  await service.sendLocalNotification('Simulated condition', 'Example', { kind: 'condition' }, { shouldSend: allowed });
  const handler = platform.setNotificationHandler.mock.calls[0][0];
  const content = platform.scheduleNotificationAsync.mock.calls[0][0].content;
  expect(content?.data).toEqual({ kind: 'condition', vantahomeNotificationSession: expect.any(String), vantahomeNotificationDelivery: expect.any(String) });
  const notification = { request: { content } } as Parameters<NonNullable<typeof handler>['handleNotification']>[0];
  expect(await handler?.handleNotification(notification)).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
  expect(await handler?.handleNotification(notification)).toMatchObject({ shouldShowBanner: false, shouldPlaySound: false });
});

it('fails closed when a foreground delivery guard expires or throws', async () => {
  const { service, platform } = loadNotifications();
  const allowed = jest.fn(() => true);
  await service.sendLocalNotification('Condition', 'Example', undefined, { shouldSend: allowed });
  const handler = platform.setNotificationHandler.mock.calls[0][0];
  const first = { request: { content: platform.scheduleNotificationAsync.mock.calls[0][0].content } } as
    Parameters<NonNullable<typeof handler>['handleNotification']>[0];
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001);
  expect(await handler?.handleNotification(first)).toMatchObject({ shouldShowBanner: false, shouldPlaySound: false });
  clock.mockRestore();
  await service.sendLocalNotification('Condition', 'Next example', undefined, { shouldSend: allowed });
  allowed.mockImplementation(() => { throw new Error('Grant lookup unavailable'); });
  const second = { request: { content: platform.scheduleNotificationAsync.mock.calls[1][0].content } } as
    Parameters<NonNullable<typeof handler>['handleNotification']>[0];
  expect(await handler?.handleNotification(second)).toMatchObject({ shouldShowBanner: false, shouldPlaySound: false });
});

it('removes a retained delivery guard when OS scheduling fails', async () => {
  const { service, platform } = loadNotifications();
  platform.scheduleNotificationAsync.mockRejectedValueOnce(new Error('OS unavailable'));
  await expect(service.sendLocalNotification('Condition', 'Example', undefined, { shouldSend: () => true })).rejects.toThrow('OS unavailable');
  const handler = platform.setNotificationHandler.mock.calls[0][0];
  const notification = { request: { content: platform.scheduleNotificationAsync.mock.calls[0][0].content } } as
    Parameters<NonNullable<typeof handler>['handleNotification']>[0];
  expect(await handler?.handleNotification(notification)).toMatchObject({ shouldShowBanner: false, shouldPlaySound: false });
});
