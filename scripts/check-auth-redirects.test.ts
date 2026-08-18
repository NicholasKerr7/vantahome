const { validateAuthRedirects } = require("./check-auth-redirects.js");

const validInput = {
  expoConfig: { scheme: "vantahome" },
  infoPlist: "<key>CFBundleURLSchemes</key><string>vantahome</string>",
  redirectSource: `
    export const NATIVE_AUTH_CALLBACK_URI = "vantahome://auth-callback";
    export const VOICE_LINK_PATH = "voice-link";
  `,
};

describe("auth redirect release check", () => {
  test("accepts aligned Expo, native, and application redirects", () => {
    expect(validateAuthRedirects(validInput)).toEqual([]);
  });

  test("rejects scheme and callback drift", () => {
    expect(
      validateAuthRedirects({
        expoConfig: { scheme: "other" },
        infoPlist: "<plist />",
        redirectSource: "",
      }),
    ).toHaveLength(4);
  });
});
