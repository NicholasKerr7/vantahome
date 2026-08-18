#!/usr/bin/env node

const fs = require("node:fs");
const crypto = require("node:crypto");

const PNG_SIGNATURE = "89504e470d0a1a0a";

function readPngMetadata(buffer) {
  if (buffer.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
    throw new Error("Asset is not a PNG file.");
  }
  const colorType = buffer[25];
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    hasAlpha: colorType === 4 || colorType === 6 || buffer.includes("tRNS"),
  };
}

function digest(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function validateReleaseAssets({ expoConfig, assets, native }) {
  const errors = [];
  const icon = assets.icon;
  const adaptive = assets.adaptive;
  const splash = assets.splash;
  const favicon = assets.favicon;

  if (expoConfig.name !== "VantaHome") {
    errors.push("Expo display name must be VantaHome.");
  }
  if (icon.width !== 1024 || icon.height !== 1024 || icon.hasAlpha) {
    errors.push("App icon must be an opaque 1024x1024 PNG.");
  }
  if (
    adaptive.width !== 1024 ||
    adaptive.height !== 1024 ||
    !adaptive.hasAlpha
  ) {
    errors.push("Adaptive foreground must be a transparent 1024x1024 PNG.");
  }
  if (splash.width !== 1024 || splash.height !== 1024 || !splash.hasAlpha) {
    errors.push("Splash image must be a transparent 1024x1024 PNG.");
  }
  if (
    favicon.width !== favicon.height ||
    favicon.width < 32 ||
    favicon.width > 512
  ) {
    errors.push("Favicon must be a square PNG between 32px and 512px.");
  }
  if (
    expoConfig.icon !== "./assets/release/icon.png" ||
    expoConfig.ios?.icon !== expoConfig.icon ||
    expoConfig.android?.icon !== expoConfig.icon
  ) {
    errors.push("Expo platform icons must use the validated release icon.");
  }
  if (
    expoConfig.android?.adaptiveIcon?.foregroundImage !==
      "./assets/release/adaptive-icon.png" ||
    expoConfig.web?.favicon !== "./assets/release/favicon.png" ||
    expoConfig.splash?.image !== "./assets/release/splash-icon.png"
  ) {
    errors.push("Expo release asset paths are inconsistent.");
  }
  if (
    expoConfig.splash?.backgroundColor !== "#050612" ||
    expoConfig.android?.adaptiveIcon?.backgroundColor !== "#050612"
  ) {
    errors.push("Splash and adaptive-icon backgrounds must use brand navy.");
  }
  if (native.displayName !== expoConfig.name) {
    errors.push("Native iOS display name must match Expo config.");
  }
  if (native.iconDigest !== assets.iconDigest) {
    errors.push("Native iOS icon must match the release icon.");
  }
  if (native.splashDigests.some((value) => value !== assets.splashDigest)) {
    errors.push("Native iOS splash images must match the release splash.");
  }
  return errors;
}

function configuredPath(value) {
  return value.replace(/^\.\//, "");
}

function loadPng(path) {
  const buffer = fs.readFileSync(path);
  return { ...readPngMetadata(buffer), digest: digest(buffer) };
}

function main() {
  const expoConfig = require("../app.json").expo;
  const icon = loadPng(configuredPath(expoConfig.icon));
  const adaptive = loadPng(
    configuredPath(expoConfig.android.adaptiveIcon.foregroundImage),
  );
  const splash = loadPng(configuredPath(expoConfig.splash.image));
  const favicon = loadPng(configuredPath(expoConfig.web.favicon));
  const infoPlist = fs.readFileSync("ios/vantahome/Info.plist", "utf8");
  const displayName = infoPlist.match(
    /<key>CFBundleDisplayName<\/key>\s*<string>([^<]+)<\/string>/,
  )?.[1];
  const nativeIcon = fs.readFileSync(
    "ios/vantahome/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png",
  );
  const nativeSplashPaths = ["image.png", "image@2x.png", "image@3x.png"].map(
    (name) =>
      `ios/vantahome/Images.xcassets/SplashScreenLegacy.imageset/${name}`,
  );
  const errors = validateReleaseAssets({
    expoConfig,
    assets: {
      icon,
      adaptive,
      splash,
      favicon,
      iconDigest: icon.digest,
      splashDigest: splash.digest,
    },
    native: {
      displayName,
      iconDigest: digest(nativeIcon),
      splashDigests: nativeSplashPaths.map((path) =>
        digest(fs.readFileSync(path)),
      ),
    },
  });
  if (errors.length) {
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log("Release icons, splash, favicon, and native iOS copies are valid.");
}

if (require.main === module) main();

module.exports = { readPngMetadata, validateReleaseAssets };
