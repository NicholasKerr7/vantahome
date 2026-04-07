import type {
  LocationGeocodedAddress,
  LocationGeofencingEventType,
  LocationRegion,
} from "expo-location";
import { useHomeStore } from "../store/useHomeStore";
import { notifyHomeLeftUnsecured } from "./notifications";
import { collectAwaySecurityIssues } from "./securityAudit";

export const PRESENCE_GEOFENCE_TASK = "vantahome-presence-geofence";
export const DEFAULT_PRESENCE_GEOFENCE_RADIUS_M = 120;
export const PRESENCE_GEOFENCE_RADIUS_OPTIONS = [80, 120, 180, 250] as const;

const AWAY_SECURITY_AUDIT_COOLDOWN_MS = 60_000;

type PresenceProfileSnapshot = {
  locationSharingEnabled?: boolean;
  presenceGeofenceEnabled?: boolean;
  presenceGeofenceLatitude?: number;
  presenceGeofenceLongitude?: number;
  presenceGeofenceRadiusM?: number;
  presenceGeofenceLabel?: string;
  presenceLastSecurityAuditAt?: number;
};

type GeofenceTaskData = {
  eventType?: LocationGeofencingEventType;
  region?: LocationRegion;
};

export type PresenceGeofenceSetupResult =
  | {
      kind: "configured";
      label: string;
      radiusM: number;
    }
  | { kind: "permission-denied" }
  | { kind: "background-permission-denied" }
  | { kind: "task-unavailable" }
  | { kind: "location-unavailable" };

export type PresenceGeofenceSyncResult =
  | { kind: "started" }
  | { kind: "stopped" }
  | { kind: "permission-needed" }
  | { kind: "task-unavailable" };

type ExpoLocationModule = typeof import("expo-location");
type ExpoTaskManagerModule = typeof import("expo-task-manager");

let cachedLocationModule: ExpoLocationModule | null | undefined;
let cachedTaskManagerModule: ExpoTaskManagerModule | null | undefined;

function getLocationModule() {
  if (cachedLocationModule !== undefined) return cachedLocationModule;
  try {
    cachedLocationModule = require("expo-location") as ExpoLocationModule;
  } catch {
    cachedLocationModule = null;
  }
  return cachedLocationModule;
}

function getTaskManagerModule() {
  if (cachedTaskManagerModule !== undefined) return cachedTaskManagerModule;
  try {
    cachedTaskManagerModule =
      require("expo-task-manager") as ExpoTaskManagerModule;
  } catch {
    cachedTaskManagerModule = null;
  }
  return cachedTaskManagerModule;
}

function clampRadius(radius?: number) {
  const safeRadius =
    typeof radius === "number" && Number.isFinite(radius)
      ? radius
      : DEFAULT_PRESENCE_GEOFENCE_RADIUS_M;
  return Math.max(60, Math.min(500, Math.round(safeRadius)));
}

function hasHomeZone(profile: PresenceProfileSnapshot) {
  return (
    typeof profile.presenceGeofenceLatitude === "number" &&
    typeof profile.presenceGeofenceLongitude === "number"
  );
}

function shouldTrackPresence(profile: PresenceProfileSnapshot) {
  return Boolean(
    profile.locationSharingEnabled &&
      profile.presenceGeofenceEnabled &&
      hasHomeZone(profile),
  );
}

function buildPresenceRegion(
  profile: PresenceProfileSnapshot,
): LocationRegion | null {
  if (!shouldTrackPresence(profile)) return null;

  return {
    identifier: "vantahome-home-zone",
    latitude: profile.presenceGeofenceLatitude as number,
    longitude: profile.presenceGeofenceLongitude as number,
    radius: clampRadius(profile.presenceGeofenceRadiusM),
    notifyOnEnter: true,
    notifyOnExit: true,
  };
}

function formatAddressLabel(address?: LocationGeocodedAddress | null) {
  if (!address) return "Current location";
  const primary = [address.name, address.street]
    .filter(Boolean)
    .join(" ")
    .trim();
  const secondary = [address.city, address.region]
    .filter(Boolean)
    .join(", ")
    .trim();

  if (primary && secondary) return `${primary} • ${secondary}`;
  if (primary) return primary;
  if (secondary) return secondary;
  if (address.country) return address.country;
  return "Current location";
}

async function getCurrentLocation() {
  const Location = getLocationModule();
  if (!Location) return null;
  const lastKnown = await Location.getLastKnownPositionAsync({
    maxAge: 1000 * 60 * 10,
    requiredAccuracy: 250,
  });
  return (
    lastKnown ??
    (await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }))
  );
}

function distanceMeters(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
) {
  const earthRadiusM = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLon = toRadians(toLon - fromLon);
  const startLat = toRadians(fromLat);
  const endLat = toRadians(toLat);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2) *
      Math.cos(startLat) *
      Math.cos(endLat);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusM * c;
}

export async function maybeNotifyHomeLeftUnsecured() {
  const state = useHomeStore.getState();
  if (!state.preferences.notifications) return false;
  if (state.household.some((member) => member.status === "home")) return false;

  const issues = collectAwaySecurityIssues(state.devices);
  if (!issues.length) return false;

  const now = Date.now();
  const lastAuditAt = state.profile.presenceLastSecurityAuditAt ?? 0;
  if (now - lastAuditAt < AWAY_SECURITY_AUDIT_COOLDOWN_MS) {
    return false;
  }

  await notifyHomeLeftUnsecured(issues);
  useHomeStore.getState().setProfile({
    presenceLastSecurityAuditAt: now,
  });
  return true;
}

export async function updateHouseholdPresence(
  memberId: string,
  status: "home" | "away",
) {
  const state = useHomeStore.getState();
  const member = state.household.find((entry) => entry.id === memberId);
  if (!member || member.status === status) return false;

  const wasOccupied = state.household.some((entry) => entry.status === "home");
  state.setHouseholdPresence(memberId, status);

  if (status === "away" && wasOccupied) {
    await maybeNotifyHomeLeftUnsecured();
  }
  return true;
}

export async function updateActiveMemberPresence(status: "home" | "away") {
  const state = useHomeStore.getState();
  if (!state.activeMemberId) return false;
  return updateHouseholdPresence(state.activeMemberId, status);
}

export async function syncPresenceFromCurrentLocationIfAuthorized() {
  const Location = getLocationModule();
  if (!Location) return null;
  const state = useHomeStore.getState();
  const region = buildPresenceRegion(state.profile);
  if (!region) return null;

  const permission = await Location.getForegroundPermissionsAsync().catch(
    () => null,
  );
  if (!permission || permission.status !== "granted") {
    return null;
  }

  const currentLocation = await getCurrentLocation().catch(() => null);
  if (!currentLocation) return null;

  const inside =
    distanceMeters(
      region.latitude,
      region.longitude,
      currentLocation.coords.latitude,
      currentLocation.coords.longitude,
    ) <= region.radius;

  await updateActiveMemberPresence(inside ? "home" : "away");
  return inside;
}

export async function syncPresenceGeofencingFromProfile(
  profile: PresenceProfileSnapshot = useHomeStore.getState().profile,
): Promise<PresenceGeofenceSyncResult> {
  const Location = getLocationModule();
  const TaskManager = getTaskManagerModule();
  if (!Location || !TaskManager) {
    return { kind: "task-unavailable" };
  }
  const taskAvailable = await TaskManager.isAvailableAsync().catch(() => false);
  if (!taskAvailable) {
    return { kind: "task-unavailable" };
  }

  const region = buildPresenceRegion(profile);
  const started = await Location.hasStartedGeofencingAsync(
    PRESENCE_GEOFENCE_TASK,
  ).catch(() => false);

  if (!region) {
    if (started) {
      await Location.stopGeofencingAsync(PRESENCE_GEOFENCE_TASK).catch(
        () => {},
      );
    }
    return { kind: "stopped" };
  }

  const permission = await Location.getBackgroundPermissionsAsync().catch(
    () => null,
  );
  if (!permission || permission.status !== "granted") {
    if (started) {
      await Location.stopGeofencingAsync(PRESENCE_GEOFENCE_TASK).catch(
        () => {},
      );
    }
    return { kind: "permission-needed" };
  }

  await Location.startGeofencingAsync(PRESENCE_GEOFENCE_TASK, [region]);
  return { kind: "started" };
}

export async function configurePresenceGeofenceFromCurrentLocation(
  radiusM = DEFAULT_PRESENCE_GEOFENCE_RADIUS_M,
): Promise<PresenceGeofenceSetupResult> {
  const Location = getLocationModule();
  const TaskManager = getTaskManagerModule();
  if (!Location || !TaskManager) {
    return { kind: "task-unavailable" };
  }
  const taskAvailable = await TaskManager.isAvailableAsync().catch(() => false);
  if (!taskAvailable) {
    return { kind: "task-unavailable" };
  }

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") {
    return { kind: "permission-denied" };
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted") {
    return { kind: "background-permission-denied" };
  }

  const currentLocation = await getCurrentLocation().catch(() => null);
  if (!currentLocation) {
    return { kind: "location-unavailable" };
  }

  const [address] = await Location.reverseGeocodeAsync({
    latitude: currentLocation.coords.latitude,
    longitude: currentLocation.coords.longitude,
  }).catch(() => []);

  const label = formatAddressLabel(address);
  useHomeStore.getState().setProfile({
    locationSharingEnabled: true,
    presenceGeofenceEnabled: true,
    presenceGeofenceLatitude: currentLocation.coords.latitude,
    presenceGeofenceLongitude: currentLocation.coords.longitude,
    presenceGeofenceRadiusM: clampRadius(radiusM),
    presenceGeofenceLabel: label,
  });

  await updateActiveMemberPresence("home");
  await syncPresenceGeofencingFromProfile();

  return {
    kind: "configured",
    label,
    radiusM: clampRadius(radiusM),
  };
}

const Location = getLocationModule();
const TaskManager = getTaskManagerModule();

if (
  Location &&
  TaskManager &&
  !TaskManager.isTaskDefined(PRESENCE_GEOFENCE_TASK)
) {
  TaskManager.defineTask<GeofenceTaskData>(
    PRESENCE_GEOFENCE_TASK,
    async ({ data, error }) => {
      if (error) return;

      if (data?.eventType === Location.LocationGeofencingEventType.Enter) {
        await updateActiveMemberPresence("home");
        return;
      }

      if (data?.eventType === Location.LocationGeofencingEventType.Exit) {
        await updateActiveMemberPresence("away");
      }
    },
  );
}
