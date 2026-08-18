import * as Device from "expo-device";
import * as ScreenOrientation from "expo-screen-orientation";
import { applyDeviceOrientationPolicy } from "../orientation";

let mockDeviceType = 1;
const mockGetDeviceTypeAsync = jest.fn();
const mockSupportsOrientationLockAsync = jest.fn();
const mockLockAsync = jest.fn();
const mockUnlockAsync = jest.fn();

jest.mock("expo-device", () => ({
  DeviceType: {
    UNKNOWN: 0,
    PHONE: 1,
    TABLET: 2,
    DESKTOP: 3,
    TV: 4,
  },
  get deviceType() {
    return mockDeviceType;
  },
  getDeviceTypeAsync: (...args: unknown[]) => mockGetDeviceTypeAsync(...args),
}));

jest.mock("expo-screen-orientation", () => ({
  OrientationLock: { PORTRAIT_UP: 3 },
  supportsOrientationLockAsync: (...args: unknown[]) =>
    mockSupportsOrientationLockAsync(...args),
  lockAsync: (...args: unknown[]) => mockLockAsync(...args),
  unlockAsync: (...args: unknown[]) => mockUnlockAsync(...args),
}));

describe("device orientation service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeviceType = Device.DeviceType.PHONE;
    mockSupportsOrientationLockAsync.mockResolvedValue(true);
    mockLockAsync.mockResolvedValue(undefined);
    mockUnlockAsync.mockResolvedValue(undefined);
  });

  it("locks a phone to upright portrait", async () => {
    await applyDeviceOrientationPolicy();

    expect(mockSupportsOrientationLockAsync).toHaveBeenCalledWith(
      ScreenOrientation.OrientationLock.PORTRAIT_UP,
    );
    expect(mockLockAsync).toHaveBeenCalledWith(
      ScreenOrientation.OrientationLock.PORTRAIT_UP,
    );
    expect(mockUnlockAsync).not.toHaveBeenCalled();
  });

  it("leaves a tablet free to rotate", async () => {
    mockDeviceType = Device.DeviceType.TABLET;

    await applyDeviceOrientationPolicy();

    expect(mockUnlockAsync).toHaveBeenCalledTimes(1);
    expect(mockLockAsync).not.toHaveBeenCalled();
  });
});
