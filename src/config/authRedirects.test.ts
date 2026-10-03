import {
  NATIVE_AUTH_CALLBACK_URI,
  NATIVE_VOICE_LINK_URI,
  NATIVE_HOME_INVITATION_URI,
  getAuthRedirectParams,
  isAuthCallbackUrl,
  isHomeInvitationUrl,
  makeHomeInvitationUri,
} from "./authRedirects";

describe("auth redirects", () => {
  test("keeps stable native callback URIs", () => {
    expect(NATIVE_AUTH_CALLBACK_URI).toBe("vantahome://auth-callback");
    expect(NATIVE_VOICE_LINK_URI).toBe("vantahome://voice-link");
    expect(NATIVE_HOME_INVITATION_URI).toBe("vantahome://join-home");
  });

  test("recognizes only the app auth callback", () => {
    expect(isAuthCallbackUrl("vantahome://auth-callback?code=abc")).toBe(true);
    expect(isAuthCallbackUrl("vantahome:///auth-callback#type=recovery")).toBe(
      false,
    );
    expect(isAuthCallbackUrl("https://attacker.test/auth-callback")).toBe(
      false,
    );
    expect(isAuthCallbackUrl("vantahome://voice-link?code=abc")).toBe(false);
  });

  test.each([
    "vantahome://other/auth-callback?code=abc",
    "vantahome://auth-callback/other?code=abc",
    "vantahome://user:password@auth-callback?code=abc",
    "vantahome://auth-callback:123?code=abc",
  ])("rejects noncanonical callback components: %s", (url) => {
    expect(isAuthCallbackUrl(url)).toBe(false);
    expect(getAuthRedirectParams(url)).toBeNull();
  });

  test.each([
    "vantahome://auth-callback?code=one&code=two",
    "vantahome://auth-callback?code=one#code=two",
    "vantahome://auth-callback#code=one&code=two",
  ])("rejects ambiguous parameters: %s", (url) => {
    expect(getAuthRedirectParams(url)).toBeNull();
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

describe("household invitation entry", () => {
  test("opens a separate nonsecret invitation path", () => {
    expect(makeHomeInvitationUri()).toBe("vantahome://join-home");
    expect(isHomeInvitationUrl("vantahome://join-home")).toBe(true);
    expect(isAuthCallbackUrl("vantahome://join-home")).toBe(false);
  });

  test.each([
    "vantahome://join-home?code=123456",
    "vantahome://join-home?email=recipient@example.test",
    "vantahome://join-home?token_hash=secret",
    "vantahome://join-home#access_token=secret",
    "vantahome://person:password@join-home",
    "vantahome://join-home:123",
    "vantahome:///join-home",
    "vantahome://join-home/other",
    "https://untrusted.example.test/join-home",
    "not a URL",
  ])("rejects credentials and noncanonical invitation links: %s", (url) => {
    expect(isHomeInvitationUrl(url)).toBe(false);
  });
});

describe("preview callback isolation", () => {
  const originalVariant = process.env.EXPO_PUBLIC_APP_VARIANT;

  afterEach(() => {
    if (originalVariant === undefined) delete process.env.EXPO_PUBLIC_APP_VARIANT;
    else process.env.EXPO_PUBLIC_APP_VARIANT = originalVariant;
  });

  test("generates preview-only authentication, invitation, and voice callbacks", () => {
    process.env.EXPO_PUBLIC_APP_VARIANT = "preview";
    jest.isolateModules(() => {
      const redirects: typeof import("./authRedirects") = require("./authRedirects");
      expect(redirects.makeAuthCallbackUri()).toBe("vantahome-preview://auth-callback");
      expect(redirects.makeHomeInvitationUri()).toBe("vantahome-preview://join-home");
      expect(redirects.makeVoiceLinkUri()).toBe("vantahome-preview://voice-link");
      expect(redirects.isAuthCallbackUrl("vantahome-preview://auth-callback?code=abc")).toBe(true);
      expect(redirects.getAuthRedirectParams("vantahome-preview://auth-callback?code=abc")?.get("code")).toBe("abc");
      expect(redirects.isHomeInvitationUrl("vantahome-preview://join-home")).toBe(true);
      expect(redirects.isAuthCallbackUrl("vantahome://auth-callback?code=abc")).toBe(false);
      expect(redirects.isHomeInvitationUrl("vantahome://join-home")).toBe(false);
    });
  });

  test.each([
    "vantahome-preview:///auth-callback?code=abc",
    "vantahome-preview://auth-callback/other?code=abc",
    "vantahome-preview://auth-callback:123?code=abc",
    "vantahome-preview://user:password@auth-callback?code=abc",
    "vantahome-preview://auth-callback?code=one#code=two",
  ])("keeps canonical callback and duplicate-parameter checks in preview: %s", (url) => {
    process.env.EXPO_PUBLIC_APP_VARIANT = "preview";
    jest.isolateModules(() => {
      const redirects: typeof import("./authRedirects") = require("./authRedirects");
      expect(redirects.getAuthRedirectParams(url)).toBeNull();
    });
  });

  test("production does not consume preview callbacks", () => {
    process.env.EXPO_PUBLIC_APP_VARIANT = "production";
    jest.isolateModules(() => {
      const redirects: typeof import("./authRedirects") = require("./authRedirects");
      expect(redirects.isAuthCallbackUrl("vantahome-preview://auth-callback?code=abc")).toBe(false);
      expect(redirects.isHomeInvitationUrl("vantahome-preview://join-home")).toBe(false);
    });
  });
});
