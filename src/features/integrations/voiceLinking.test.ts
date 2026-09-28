import {
  createVoiceLinkController, resolveVoiceConfiguration, validateVoiceCallback,
  type VoiceLinkDependencies, type VoiceLinkScope,
} from "./voiceLinking";
import { integrationStatusLabel } from "./integrationCatalog";

const redirectUri = "vantahome://voice-link";
const state = "f".repeat(64);
const configuration = { authorizeUrl: "https://link.example.test/index.html", clientId: "alexa-client", redirectUri };

/** Each test owns an isolated session and browser result, without network or account credentials. */
function fixture() {
  let scope: VoiceLinkScope = { authenticatedUserId: "owner", activeHomeId: "home", activeMemberId: "member", sessionEpoch: 1, membershipReady: true };
  const dependencies: VoiceLinkDependencies = {
    getScope: () => scope,
    getConfiguration: () => configuration,
    createState: () => state,
    openAuthorization: jest.fn(async () => ({ type: "success", url: `${redirectUri}?code=sample-code&state=${state}` })),
    setStatus: jest.fn(),
    saveAuthorization: jest.fn(),
  };
  return { dependencies, run: createVoiceLinkController(dependencies), updateScope: (next: Partial<VoiceLinkScope>) => { scope = { ...scope, ...next }; } };
}

describe("voice authorization configuration", () => {
  it("requires a secure public endpoint and configured client", () => {
    expect(resolveVoiceConfiguration({ authorizeUrl: configuration.authorizeUrl, clientId: "client", redirectUri })).toEqual({ ...configuration, clientId: "client" });
    expect(resolveVoiceConfiguration({ supabaseUrl: "https://project.supabase.co/", clientId: "client", redirectUri })?.authorizeUrl).toBe("https://project.functions.supabase.co/voice-authorize");
    expect(resolveVoiceConfiguration({ functionsUrl: "https://functions.example.test/", clientId: "client", redirectUri })?.authorizeUrl).toBe("https://functions.example.test/voice-authorize");
    expect(resolveVoiceConfiguration({ authorizeUrl: configuration.authorizeUrl, redirectUri })).toBeNull();
  });

  it.each(["http://link.example.test", "https://user:secret@link.example.test", "https://link.example.test/?token=secret", "https://link.example.test/#secret", "invalid"])("rejects unsafe endpoint %s", (authorizeUrl) => {
    expect(resolveVoiceConfiguration({ authorizeUrl, clientId: "client", redirectUri })).toBeNull();
  });
});

describe("voice callback validation", () => {
  it("accepts only a code bound to the expected callback and attempt", () => {
    expect(validateVoiceCallback(`${redirectUri}?code=sample&state=${state}`, redirectUri, state)).toBe("authorization-saved");
  });

  it.each([
    `other://voice-link?code=sample&state=${state}`,
    `vantahome://other?code=sample&state=${state}`,
    `${redirectUri}/other?code=sample&state=${state}`,
    `${redirectUri}?code=sample&state=wrong`,
    `${redirectUri}?code=sample&state=${state}&state=${state}`,
    `${redirectUri}?code=sample&code=other&state=${state}`,
    `${redirectUri}?state=${state}`,
    `${redirectUri}?code=%20%20&state=${state}`,
    `${redirectUri}?code=sample&state=${state}#fragment`,
    `vantahome://user@voice-link?code=sample&state=${state}`,
    "malformed",
  ])("rejects invalid callback without accepting progress", (url) => {
    expect(validateVoiceCallback(url, redirectUri, state)).toBe("invalid-callback");
  });

  it("returns fixed denial feedback instead of exposing provider error text", () => {
    expect(validateVoiceCallback(`${redirectUri}?error=access_denied&error_description=private&state=${state}`, redirectUri, state)).toBe("provider-denied");
  });
});

describe("voice authorization controller", () => {
  it("records authorization only after validating a callback", async () => {
    const { run, dependencies } = fixture();
    expect(await run("alexa")).toBe("authorization-saved");
    expect(dependencies.setStatus).toHaveBeenCalledWith("alexa", "linking");
    expect(dependencies.saveAuthorization).toHaveBeenCalledWith("alexa");
    const url = new URL((dependencies.openAuthorization as jest.Mock).mock.calls[0][0]);
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri);
  });

  it.each(["homekit", "matter"] as const)("never opens a browser for planned provider %s", async (provider) => {
    const { run, dependencies } = fixture();
    expect(await run(provider)).toBe("unavailable");
    expect(dependencies.openAuthorization).not.toHaveBeenCalled();
    expect(dependencies.setStatus).not.toHaveBeenCalled();
  });

  it.each([
    { authenticatedUserId: "another" }, { activeHomeId: "another" }, { activeMemberId: "another" },
    { sessionEpoch: 2 }, { membershipReady: false },
  ])("ignores callback after account scope changes: %j", async (change) => {
    const { run, dependencies, updateScope } = fixture();
    dependencies.openAuthorization = jest.fn(async () => {
      updateScope(change);
      return { type: "success", url: `${redirectUri}?code=sample&state=${state}` };
    });
    expect(await run("alexa")).toBe("stale-session");
    expect(dependencies.saveAuthorization).not.toHaveBeenCalled();
    expect(dependencies.setStatus).toHaveBeenCalledTimes(1);
  });

  it("does not authorize an unauthenticated demo or unconfigured provider", async () => {
    const { run, dependencies, updateScope } = fixture();
    updateScope({ authenticatedUserId: null });
    expect(await run("alexa")).toBe("sign-in-required");
    dependencies.getConfiguration = () => null;
    expect(await run("google")).toBe("unavailable");
    expect(dependencies.openAuthorization).not.toHaveBeenCalled();
  });

  it.each(["cancel", "dismiss"])("clears pending status on browser %s", async (type) => {
    const { run, dependencies } = fixture();
    dependencies.openAuthorization = jest.fn(async () => ({ type }));
    expect(await run("alexa")).toBe("cancelled");
    expect(dependencies.setStatus).toHaveBeenLastCalledWith("alexa", "not-linked");
    expect(dependencies.saveAuthorization).not.toHaveBeenCalled();
  });

  it("handles malformed callbacks and browser failures without storing codes or raw errors", async () => {
    const { run, dependencies } = fixture();
    dependencies.openAuthorization = jest.fn(async () => ({ type: "success", url: "invalid" }));
    expect(await run("alexa")).toBe("invalid-callback");
    dependencies.openAuthorization = jest.fn(async () => { throw new Error("secret raw error"); });
    expect(await run("alexa")).toBe("failed");
    expect(dependencies.saveAuthorization).not.toHaveBeenCalled();
  });

  it("serializes browser attempts across providers and releases the lock", async () => {
    const { run, dependencies } = fixture();
    let finish!: (value: { type: string }) => void;
    dependencies.openAuthorization = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
    const first = run("alexa");
    expect(await run("google")).toBe("busy");
    finish({ type: "cancel" });
    await first;
    dependencies.openAuthorization = jest.fn(async () => ({ type: "cancel" }));
    expect(await run("google")).toBe("cancelled");
  });

  it("does not start without unpredictable state", async () => {
    const { run, dependencies } = fixture();
    dependencies.createState = () => "weak";
    expect(await run("alexa")).toBe("failed");
    expect(dependencies.openAuthorization).not.toHaveBeenCalled();
  });
});

describe("honest integration status", () => {
  it("does not equate saved authorization or configured URLs with verified control", () => {
    expect(integrationStatusLabel("alexa", "linked", true)).toBe("Authorization saved");
    expect(integrationStatusLabel("google", "not-linked", true)).toBe("Verification pending");
    expect(integrationStatusLabel("google", "not-linked", false)).toBe("Setup required");
    expect(integrationStatusLabel("homekit", "linked", true)).toBe("Planned");
    expect(integrationStatusLabel("matter", "linked", true)).toBe("Planned");
    expect(integrationStatusLabel("bridge")).toBe("Bridge setup pending");
  });
});
