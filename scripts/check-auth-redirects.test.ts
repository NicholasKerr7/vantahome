const { validateAuthRedirects } = require("./check-auth-redirects.js");

const redirectSource = `
  const APP_IDENTITY = resolveAppVariant(process.env.EXPO_PUBLIC_APP_VARIANT);
  export const AUTH_CALLBACK_PATH = "auth-callback";
  export const VOICE_LINK_PATH = "voice-link";
  export const HOME_INVITATION_PATH = "join-home";
`;

/** Build representative native registration metadata for each signed app identity. */
function nativePlist(schemes: string[]) {
  return `<plist><key>CFBundleURLTypes</key><array><dict><key>CFBundleURLSchemes</key><array>${schemes.map((scheme) => `<string>${scheme}</string>`).join("")}</array></dict></array></plist>`;
}

const productionInput = {
  expoConfig: { scheme: "vantahome", ios: { bundleIdentifier: "com.anonymous.vantahome" } },
  infoPlist: nativePlist(["vantahome", "com.anonymous.vantahome"]),
  redirectSource,
};
const previewInput = {
  variant: "preview",
  expoConfig: { scheme: "vantahome-preview", ios: { bundleIdentifier: "com.anonymous.vantahome.preview" } },
  infoPlist: nativePlist(["vantahome-preview", "com.anonymous.vantahome.preview"]),
  redirectSource,
};

describe("auth redirect release check", () => {
  test.each([productionInput, previewInput])("accepts aligned Expo, native, and application redirects", (input) => {
    expect(validateAuthRedirects(input)).toEqual([]);
  });

  test("rejects scheme and callback drift", () => {
    expect(
      validateAuthRedirects({
        expoConfig: { scheme: "other" },
        infoPlist: "<plist />",
        redirectSource: "",
      }),
    ).toHaveLength(7);
  });

  test("does not mistake an unrelated plist string for a registered URL scheme", () => {
    expect(validateAuthRedirects({
      ...productionInput,
      infoPlist: "<key>CFBundleDisplayName</key><string>vantahome</string>",
    })).toEqual(["Native iOS URL schemes must include vantahome."]);
  });

  test.each([productionInput, previewInput])("rejects an app registering both identities", (input) => {
    expect(validateAuthRedirects({
      ...input,
      infoPlist: nativePlist(["vantahome", "vantahome-preview"]),
    })).toHaveLength(1);
  });

  test("preview packaging fails while native or Expo metadata retains production identity", () => {
    expect(validateAuthRedirects({ ...productionInput, variant: "preview" })).toHaveLength(4);
    expect(validateAuthRedirects({ ...previewInput, infoPlist: productionInput.infoPlist })).toHaveLength(2);
  });

  test("fails on an unsupported explicit build variant", () => {
    expect(() => validateAuthRedirects({ ...productionInput, variant: "staging" }))
      .toThrow("EXPO_PUBLIC_APP_VARIANT");
  });
});
