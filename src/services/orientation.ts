import { Dimensions, Platform } from "react-native";
import * as Device from "expo-device";
import * as ScreenOrientation from "expo-screen-orientation";
import {
  type DeviceFamily,
  shouldLockPhonePortrait,
} from "../config/orientationPolicy";

function getDeviceFamily(deviceType: Device.DeviceType | null): DeviceFamily {
  switch (deviceType) {
    case Device.DeviceType.PHONE:
      return "phone";
    case Device.DeviceType.TABLET:
      return "tablet";
    case Device.DeviceType.DESKTOP:
    case Device.DeviceType.TV:
      return "other";
    default:
      return "unknown";
  }
}

export async function applyDeviceOrientationPolicy() {
  // Browser dimensions remain freely resizable; this policy is for installed apps.
  if (Platform.OS === "web") return;

  let deviceType = Device.deviceType;
  if (deviceType === null || deviceType === Device.DeviceType.UNKNOWN) {
    deviceType = await Device.getDeviceTypeAsync().catch(
      () => Device.DeviceType.UNKNOWN,
    );
  }

  const lockPhonePortrait = shouldLockPhonePortrait(
    getDeviceFamily(deviceType),
    Dimensions.get("screen"),
  );

  if (!lockPhonePortrait) {
    await ScreenOrientation.unlockAsync();
    return;
  }

  const portraitSupported = await ScreenOrientation.supportsOrientationLockAsync(
    ScreenOrientation.OrientationLock.PORTRAIT_UP,
  );
  if (portraitSupported) {
    await ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.PORTRAIT_UP,
    );
  }
}
