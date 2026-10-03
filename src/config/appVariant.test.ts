import { resolveAppVariant } from "./appVariant";

describe("native app variants", () => {
  test.each([undefined, "", "production"])("preserves production identity for %s", (value) => {
    expect(resolveAppVariant(value)).toEqual({
      variant: "production",
      scheme: "vantahome",
      bundleIdentifier: "com.anonymous.vantahome",
      displayName: "VantaHome",
    });
  });

  test("isolates preview callbacks and installation identity", () => {
    expect(resolveAppVariant("preview")).toEqual({
      variant: "preview",
      scheme: "vantahome-preview",
      bundleIdentifier: "com.anonymous.vantahome.preview",
      displayName: "VantaHome Preview",
    });
    expect(Object.isFrozen(resolveAppVariant("preview"))).toBe(true);
  });

  test.each(["development", "staging", "Preview", " preview", "vantahome"])(
    "rejects unsupported explicit variants: %s",
    (value) => expect(() => resolveAppVariant(value)).toThrow("EXPO_PUBLIC_APP_VARIANT"),
  );
});
