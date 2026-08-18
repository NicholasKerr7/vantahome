import { parseAuthProviderAvailability } from "./authProviderAvailability";

describe("auth provider availability", () => {
  test("enables only providers explicitly advertised by GoTrue", () => {
    expect(
      parseAuthProviderAvailability({
        external: { apple: false, google: true, email: true },
      }),
    ).toEqual({ apple: false, google: true });
  });

  test("fails closed for malformed settings", () => {
    expect(parseAuthProviderAvailability(null)).toEqual({
      apple: false,
      google: false,
    });
    expect(
      parseAuthProviderAvailability({ external: { apple: "true" } }),
    ).toEqual({ apple: false, google: false });
  });
});
