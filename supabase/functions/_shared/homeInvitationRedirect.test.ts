import { getHomeInvitationRedirect } from "./homeInvitationRedirect";

test("defaults to the canonical, credential-free native invitation entry", () => {
  expect(getHomeInvitationRedirect()).toBe("vantahome://join-home");
  expect(getHomeInvitationRedirect("vantahome://join-home")).toBe("vantahome://join-home");
});

test("accepts an operator-configured HTTPS invitation entry page", () => {
  expect(getHomeInvitationRedirect("https://home.example.test/join-home"))
    .toBe("https://home.example.test/join-home");
});

test.each([
  "http://home.example.test/join-home",
  "javascript:alert(1)",
  "vantahome://auth-callback",
  "vantahome://join-home?email=person@example.test",
  "https://home.example.test/auth-callback",
  "https://home.example.test:8443/join-home",
  "https://user:password@home.example.test/join-home",
  "https://home.example.test/join-home?token_hash=secret",
  "https://home.example.test/join-home#access_token=secret",
  "invalid",
])("rejects unsupported invitation redirect configuration: %s", (url) => {
  expect(() => getHomeInvitationRedirect(url)).toThrow("VANTAHOME_INVITE_REDIRECT_URL");
});
