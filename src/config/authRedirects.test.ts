import {
  NATIVE_AUTH_CALLBACK_URI,
  NATIVE_VOICE_LINK_URI,
  getAuthRedirectParams,
  isAuthCallbackUrl,
} from "./authRedirects";

describe("auth redirects", () => {
  test("keeps stable native callback URIs", () => {
    expect(NATIVE_AUTH_CALLBACK_URI).toBe("vantahome://auth-callback");
    expect(NATIVE_VOICE_LINK_URI).toBe("vantahome://voice-link");
  });

  test("recognizes only the app auth callback", () => {
    expect(isAuthCallbackUrl("vantahome://auth-callback?code=abc")).toBe(true);
    expect(isAuthCallbackUrl("vantahome:///auth-callback#type=recovery")).toBe(
      true,
    );
    expect(isAuthCallbackUrl("https://attacker.test/auth-callback")).toBe(
      false,
    );
    expect(isAuthCallbackUrl("vantahome://voice-link?code=abc")).toBe(false);
  });

  test("combines query and fragment parameters", () => {
    const params = getAuthRedirectParams(
      "vantahome://auth-callback?type=recovery#access_token=a&refresh_token=b",
    );
    expect(params?.get("type")).toBe("recovery");
    expect(params?.get("access_token")).toBe("a");
    expect(params?.get("refresh_token")).toBe("b");
    expect(getAuthRedirectParams("not a URL")).toBeNull();
  });
});
