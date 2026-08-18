import { shouldLockPhonePortrait } from "./orientationPolicy";

describe("orientation policy", () => {
  it("locks phones to portrait regardless of their current orientation", () => {
    expect(
      shouldLockPhonePortrait("phone", { width: 390, height: 844 }),
    ).toBe(true);
    expect(
      shouldLockPhonePortrait("phone", { width: 844, height: 390 }),
    ).toBe(true);
  });

  it("allows tablets to rotate", () => {
    expect(
      shouldLockPhonePortrait("tablet", { width: 820, height: 1180 }),
    ).toBe(false);
    expect(
      shouldLockPhonePortrait("tablet", { width: 1180, height: 820 }),
    ).toBe(false);
  });

  it("uses the shortest physical edge when device type is unavailable", () => {
    expect(
      shouldLockPhonePortrait("unknown", { width: 844, height: 390 }),
    ).toBe(true);
    expect(
      shouldLockPhonePortrait("unknown", { width: 1024, height: 600 }),
    ).toBe(false);
  });
});
