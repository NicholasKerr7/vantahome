#!/usr/bin/env node

const fs = require("node:fs");
const { resolveAppVariant } = require("../src/config/appVariant");

/** Extract URL registrations, not unrelated display strings in the native plist. */
function registeredNativeSchemes(infoPlist) {
  return [...infoPlist.matchAll(/<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/g)]
    .flatMap((section) => [...section[1].matchAll(/<string>([^<]+)<\/string>/g)]
      .map((match) => match[1]));
}

/** Reject callback drift for both the default release and isolated preview identity. */
function validateAuthRedirects({ expoConfig, infoPlist, redirectSource, variant }) {
  const identity = resolveAppVariant(variant);
  const otherIdentity = resolveAppVariant(identity.variant === "preview" ? "production" : "preview");
  const errors = [];
  if (expoConfig.scheme !== identity.scheme) {
    errors.push(`Expo scheme must match ${identity.scheme} for this build.`);
  }
  if (expoConfig.ios?.bundleIdentifier !== identity.bundleIdentifier) {
    errors.push(`Expo iOS bundle identifier must match ${identity.bundleIdentifier}.`);
  }
  const nativeSchemes = registeredNativeSchemes(infoPlist);
  if (!nativeSchemes.includes(identity.scheme)) {
    errors.push(`Native iOS URL schemes must include ${identity.scheme}.`);
  }
  if (nativeSchemes.includes(otherIdentity.scheme)) {
    errors.push(`Native iOS must not register the other app's ${otherIdentity.scheme} callback.`);
  }
  if (!/resolveAppVariant\(\s*process\.env\.EXPO_PUBLIC_APP_VARIANT\s*\)/.test(redirectSource)) {
    errors.push("Native callbacks must resolve the explicit build variant through the shared identity helper.");
  }
  for (const [name, path] of [
    ["AUTH_CALLBACK_PATH", "auth-callback"],
    ["VOICE_LINK_PATH", "voice-link"],
    ["HOME_INVITATION_PATH", "join-home"],
  ]) {
    if (!redirectSource.includes(`${name} = "${path}"`)) {
      errors.push(`${name} must retain its dedicated ${path} callback path.`);
    }
  }
  return errors;
}

/** Inspect the actual native metadata immediately before signing a selected variant. */
function main() {
  const errors = validateAuthRedirects({
    expoConfig: require("../app.json").expo,
    infoPlist: fs.readFileSync("ios/vantahome/Info.plist", "utf8"),
    redirectSource: fs.readFileSync("src/config/authRedirects.ts", "utf8"),
    variant: process.env.EXPO_PUBLIC_APP_VARIANT,
  });
  if (errors.length > 0) {
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log(
    `Auth redirects match the registered ${resolveAppVariant(process.env.EXPO_PUBLIC_APP_VARIANT).displayName} native URL scheme.`,
  );
}

if (require.main === module) main();

module.exports = { validateAuthRedirects, registeredNativeSchemes };
