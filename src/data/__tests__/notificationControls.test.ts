import {
  defaultNotificationCategorySettings,
  formatQuietHoursSummary,
  getNotificationDeliveryState,
  getNotificationOpenDelayMinutes,
  getNotificationRepeatMinutes,
  isQuietHoursActive,
  normalizeNotificationCategorySettings,
} from "../notificationControls";

describe("notificationControls", () => {
  it("fills in missing category toggles with defaults", () => {
    expect(
      normalizeNotificationCategorySettings({
        security: false,
      }),
    ).toEqual({
      ...defaultNotificationCategorySettings,
      security: false,
    });
  });

  it("detects overnight quiet hours correctly", () => {
    const preferences = {
      notifications: true,
      notificationQuietHoursEnabled: true,
      notificationQuietHoursStartHour: 22,
      notificationQuietHoursEndHour: 7,
    };

    expect(
      isQuietHoursActive(preferences, new Date("2026-04-06T23:30:00")),
    ).toBe(true);
    expect(
      isQuietHoursActive(preferences, new Date("2026-04-07T06:59:00")),
    ).toBe(true);
    expect(
      isQuietHoursActive(preferences, new Date("2026-04-07T12:00:00")),
    ).toBe(false);
  });

  it("returns delivery state based on category and quiet hours", () => {
    const muted = getNotificationDeliveryState(
      {
        notifications: true,
        notificationCategories: { security: false },
      },
      "security",
      new Date("2026-04-06T18:00:00"),
    );

    const quietHours = getNotificationDeliveryState(
      {
        notifications: true,
        notificationQuietHoursEnabled: true,
        notificationQuietHoursStartHour: 22,
        notificationQuietHoursEndHour: 7,
      },
      "alert",
      new Date("2026-04-06T23:00:00"),
    );

    const allowed = getNotificationDeliveryState(
      {
        notifications: true,
      },
      "alert",
      new Date("2026-04-06T18:00:00"),
    );

    expect(muted).toBe("muted");
    expect(quietHours).toBe("quiet-hours");
    expect(allowed).toBe("allowed");
  });

  it("uses sane defaults for repeat, open delay, and summary", () => {
    expect(getNotificationRepeatMinutes({})).toBe(15);
    expect(getNotificationOpenDelayMinutes({})).toBe(5);
    expect(formatQuietHoursSummary({ notifications: true })).toBe(
      "Quiet hours off",
    );
  });
});
