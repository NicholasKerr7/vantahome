import {
  getSecurityNotificationDelayMinutes,
  getSecurityNotificationRepeatMinutes,
  shouldSecurityBypassQuietHours,
} from "../securityModes";

describe("securityModes", () => {
  it("tightens security timing for away and night modes", () => {
    expect(getSecurityNotificationDelayMinutes("home", 10)).toBe(10);
    expect(getSecurityNotificationDelayMinutes("away", 10)).toBe(0);
    expect(getSecurityNotificationDelayMinutes("night", 5)).toBe(0);
  });

  it("caps repeat reminders and bypasses quiet hours when secured", () => {
    expect(getSecurityNotificationRepeatMinutes("home", 30)).toBe(30);
    expect(getSecurityNotificationRepeatMinutes("away", 30)).toBe(10);
    expect(getSecurityNotificationRepeatMinutes("night", 0)).toBe(10);
    expect(shouldSecurityBypassQuietHours("home")).toBe(false);
    expect(shouldSecurityBypassQuietHours("away")).toBe(true);
    expect(shouldSecurityBypassQuietHours("night")).toBe(true);
  });
});
