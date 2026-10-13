import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { randomUUID } from "expo-crypto";
import { useHomeStore } from "../store/useHomeStore";
import { isAccountScopeCurrent, type AccountScope } from "../features/account/accountIdentity";

const SESSION_DATA_KEY = 'vantahomeNotificationSession';
const DELIVERY_DATA_KEY = 'vantahomeNotificationDelivery';
const deliveryGuards = new Map<string, { expires: number; shouldSend: () => boolean }>();
let foregroundSession: { token: string; scope: AccountScope } | null = null;

/** Keep account identifiers in memory while tagging OS delivery with an opaque, session-only token. */
function notificationSessionToken(scope: AccountScope): string {
  if (!foregroundSession || !isAccountScopeCurrent(foregroundSession.scope, scope)) {
    deliveryGuards.clear();
    const { authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady } = scope;
    foregroundSession = { token: randomUUID(), scope: {
      authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady,
    } };
  }
  return foregroundSession.token;
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const state = useHomeStore.getState();
    // The OS may call back after scheduling or an account switch; queued details must stay with their sender.
    const enabled = state.preferences.notifications && foregroundSession !== null
      && notification.request.content.data?.[SESSION_DATA_KEY] === foregroundSession.token
      && isAccountScopeCurrent(foregroundSession.scope, state)
      && deliveryStillAllowed(notification.request.content.data?.[DELIVERY_DATA_KEY]);
    return {
      shouldPlaySound: enabled,
      shouldSetBadge: false,
      shouldShowBanner: enabled,
      shouldShowList: enabled,
    };
  },
});

/** Recheck dynamic room grants and foreground state at presentation, not just queue acceptance. */
function deliveryStillAllowed(id: unknown): boolean {
  if (id === undefined) return true;
  if (typeof id !== 'string') return false;
  const guard = deliveryGuards.get(id);
  deliveryGuards.delete(id);
  try { return Boolean(guard && guard.expires > Date.now() && guard.shouldSend()); }
  catch { return false; }
}

let permissionReady: Promise<boolean> | null = null;
let permissionRequested = false;

/** Keep household details private on Android's locked notification surface. */
async function configureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 200, 200, 200],
    enableVibrate: true,
    // Hide household and device details on a locked Android screen.
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

/** Coalesce permission checks while respecting preference changes and later OS permission changes. */
export async function ensureNotificationsReady() {
  if (!useHomeStore.getState().preferences.notifications) return false;
  if (!permissionReady) {
    const scope = useHomeStore.getState();
    const canRequest = () => useHomeStore.getState().preferences.notifications
      && isAccountScopeCurrent(scope, useHomeStore.getState());
    permissionReady = (async () => {
      await configureAndroidChannel();
      if (!canRequest()) return false;
      const current = await Notifications.getPermissionsAsync();
      if (!canRequest()) return false;
      if (current.status === "granted") return true;
      if (current.canAskAgain === false || permissionRequested) return false;
      permissionRequested = true;
      try {
        const requested = await Notifications.requestPermissionsAsync();
        return canRequest() && requested.status === "granted";
      } catch (error) {
        // A failed device call is retryable; a user's refusal is not repeatedly prompted.
        permissionRequested = false;
        throw error;
      }
    })();
  }
  const pending = permissionReady;
  try {
    return await pending;
  } finally {
    if (permissionReady === pending) permissionReady = null;
  }
}

/** Suppress OS notices when disabled without muting in-app reports or bypassing session guards. */
export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  options?: { shouldSend: () => boolean },
) {
  const scope = useHomeStore.getState();
  const shouldSend = () => useHomeStore.getState().preferences.notifications
    && isAccountScopeCurrent(scope, useHomeStore.getState())
    && (!options || options.shouldSend());
  if (!shouldSend()) return;
  const allowed = await ensureNotificationsReady();
  if (!allowed || !shouldSend()) return;
  const sessionToken = notificationSessionToken(scope);
  const deliveryToken = options ? randomUUID() : undefined;
  // Bound callbacks retained for delayed OS presentation; expired notices fail closed.
  for (const [id, guard] of deliveryGuards) if (guard.expires <= Date.now()) deliveryGuards.delete(id);
  if (deliveryGuards.size >= 256) deliveryGuards.delete(deliveryGuards.keys().next().value!);
  if (deliveryToken) deliveryGuards.set(deliveryToken, { expires: Date.now() + 60_000, shouldSend });
  try { await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
      data: { ...data, [SESSION_DATA_KEY]: sessionToken, ...(deliveryToken ? { [DELIVERY_DATA_KEY]: deliveryToken } : {}) },
    },
    trigger: null,
  }); } catch (error) {
    if (deliveryToken) deliveryGuards.delete(deliveryToken);
    throw error;
  }
}
