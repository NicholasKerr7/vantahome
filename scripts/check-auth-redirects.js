#!/usr/bin/env node

const fs = require("node:fs");

const EXPECTED_SCHEME = "vantahome";
const EXPECTED_AUTH_CALLBACK = "vantahome://auth-callback";

function validateAuthRedirects({ expoConfig, infoPlist, redirectSource }) {
  const errors = [];
  if (expoConfig.scheme !== EXPECTED_SCHEME) {
    errors.push(`Expo scheme must remain ${EXPECTED_SCHEME}.`);
  }
  if (!infoPlist.includes(`<string>${EXPECTED_SCHEME}</string>`)) {
    errors.push("Native iOS URL schemes must include vantahome.");
  }
  if (
    !redirectSource.includes(
      `NATIVE_AUTH_CALLBACK_URI = "${EXPECTED_AUTH_CALLBACK}"`,
    )
  ) {
    errors.push("Native auth callback must remain vantahome://auth-callback.");
  }
  if (!redirectSource.includes('VOICE_LINK_PATH = "voice-link"')) {
    errors.push("Voice linking must retain its dedicated callback path.");
  }
  return errors;
}

function main() {
  const errors = validateAuthRedirects({
    expoConfig: require("../app.json").expo,
    infoPlist: fs.readFileSync("ios/vantahome/Info.plist", "utf8"),
    redirectSource: fs.readFileSync("src/config/authRedirects.ts", "utf8"),
  });
  if (errors.length > 0) {
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log(
    "Auth redirects match the registered VantaHome native URL scheme.",
  );
}

if (require.main === module) main();

module.exports = { validateAuthRedirects };
