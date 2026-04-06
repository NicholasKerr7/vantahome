import * as Location from "expo-location";
import {
  DEFAULT_UTILITY_LOCATION_ID,
  resolveUtilityLocationFromGeo,
  type UtilityLocationId,
  type UtilityLocationStatus,
} from "../data/utilityRates";

export type DeviceUtilityLocationResult =
  | {
      kind: "resolved";
      locationId: UtilityLocationId | null;
      resolvedLabel: string | null;
      status: UtilityLocationStatus;
    }
  | {
      kind: "permission-denied";
    }
  | {
      kind: "unavailable";
    };

export type DeviceUtilityLocationPatch = {
  utilityLocation: UtilityLocationId;
  utilityLocationResolvedLabel: string;
  utilityLocationStatus: UtilityLocationStatus;
};

async function resolveUtilityLocationFromDevice(): Promise<DeviceUtilityLocationResult> {
  try {
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 1000 * 60 * 15,
      requiredAccuracy: 500,
    });
    const currentPosition =
      lastKnown ??
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }));
    const [address] = await Location.reverseGeocodeAsync({
      latitude: currentPosition.coords.latitude,
      longitude: currentPosition.coords.longitude,
    });

    if (!address) {
      return { kind: "unavailable" };
    }

    const resolution = resolveUtilityLocationFromGeo(address);
    return {
      kind: "resolved",
      locationId: resolution.locationId,
      resolvedLabel: resolution.resolvedLabel,
      status: resolution.status,
    };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function requestUtilityLocationFromDevice(): Promise<DeviceUtilityLocationResult> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    return { kind: "permission-denied" };
  }
  return resolveUtilityLocationFromDevice();
}

export async function refreshUtilityLocationFromDeviceIfAuthorized(): Promise<DeviceUtilityLocationResult | null> {
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    return null;
  }
  return resolveUtilityLocationFromDevice();
}

export function buildUtilityLocationPatchFromDeviceResult(
  result: Extract<DeviceUtilityLocationResult, { kind: "resolved" }>,
  manualLocationId?: UtilityLocationId | null,
): DeviceUtilityLocationPatch {
  return {
    utilityLocation:
      result.locationId ??
      manualLocationId ??
      DEFAULT_UTILITY_LOCATION_ID,
    utilityLocationResolvedLabel: result.resolvedLabel ?? "",
    utilityLocationStatus: result.status,
  };
}
