import { parseAuthProviderAvailability } from "./authProviderAvailability";

describe("auth provider availability", () => {
  test("enables only providers explicitly advertised by GoTrue", () => {
    expect(
      parseAuthProviderAvailability({
        external: { apple: false, google: true, email: true },
      }),
    ).toEqual({ apple: false, google: true, signupAllowed: false });
  });

  test("fails closed for malformed settings", () => {
    expect(parseAuthProviderAvailability(null)).toEqual({
      apple: false,
      google: false,
      signupAllowed: false,
    });
    expect(
      parseAuthProviderAvailability({ external: { apple: "true" } }),
    ).toEqual({ apple: false, google: false, signupAllowed: false });
  });

  test("allows email enrollment only when public signup and email are explicitly enabled", () => {
    expect(parseAuthProviderAvailability({
      disable_signup: false,
      external: { email: true },
    }).signupAllowed).toBe(true);
  });

  test.each([
    null,
    {},
    { external: { email: true } },
    { disable_signup: true, external: { email: true } },
    { disable_signup: "false", external: { email: true } },
    { disable_signup: false, external: { email: false } },
    { disable_signup: false, external: { email: "true" } },
    { disable_signup: false },
  ])("keeps account enrollment closed for disabled or incomplete settings: %j", (settings) => {
    expect(parseAuthProviderAvailability(settings).signupAllowed).toBe(false);
  });
});
