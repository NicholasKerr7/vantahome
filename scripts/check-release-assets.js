#!/usr/bin/env node

const fs = require("node:fs");
const crypto = require("node:crypto");

const PNG_SIGNATURE = "89504e470d0a1a0a";
const NATIVE_ARRIVAL_POSTER = "./assets/release/arrival-native-poster.png";
const ANDROID_SPLASH = "./assets/release/splash-icon.png";
const BRAND_NAVY = "#050612";
const APPROVED_MASTER_SHA256 = "1c3533ce82c3fa7bb12c45ab7e0b1123a12561d9ec06326f41da9744e32b5f9d";
const ARRIVAL_ASSETS = [
  "vantahome-arrival-enter.mp4",
  "vantahome-arrival-hold.mp4",
  "vantahome-arrival-hold.png",
  "vantahome-arrival-poster.png",
];
const ARRIVAL_BYTE_LIMIT = 3 * 1024 * 1024;

/** Read dimensions and channel metadata without decoding a release image. */
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

/** Compare the exact shipped artwork across native and JavaScript bundles. */
function digest(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Guard app identity and the static-to-motion arrival's framing and backdrop. */
function validateReleaseAssets({ expoConfig, assets, native }) {
  const errors = [];
  const icon = assets.icon;
  const adaptive = assets.adaptive;
  const splash = assets.splash;
  const androidSplash = assets.androidSplash;
  const favicon = assets.favicon;
  const splashPlugin = expoConfig.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
  )?.[1];

  if (expoConfig.name !== "VantaHome") {
    errors.push("Expo display name must be VantaHome.");
  }
  if (icon.width !== 1024 || icon.height !== 1024 || icon.hasAlpha) {
    errors.push("App icon must be an opaque 1024x1024 PNG.");
  }
  if (
    adaptive.width !== 1024 ||
    adaptive.height !== 1024 ||
    adaptive.hasAlpha ||
    assets.adaptiveDigest !== assets.iconDigest
  ) {
    errors.push(
      "Adaptive foreground must be an opaque 1024x1024 PNG matching the app icon.",
    );
  }
  if (splash.width !== 1024 || splash.height !== 768) {
    errors.push("Native arrival composite must be a 1024x768 PNG matching the runtime frame.");
  }
  if (
    androidSplash?.width !== 1024 ||
    androidSplash?.height !== 1024 ||
    !androidSplash?.hasAlpha
  ) {
    errors.push("Android system splash must use the padded transparent 1024x1024 icon.");
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
    expoConfig.splash?.image !== NATIVE_ARRIVAL_POSTER ||
    expoConfig.android?.splash?.image !== ANDROID_SPLASH
  ) {
    errors.push("Expo release asset paths are inconsistent.");
  }
  if (
    expoConfig.splash?.backgroundColor !== BRAND_NAVY ||
    expoConfig.android?.splash?.backgroundColor !== BRAND_NAVY ||
    expoConfig.android?.adaptiveIcon?.backgroundColor !== BRAND_NAVY
  ) {
    errors.push("Splash and adaptive-icon backgrounds must use brand navy.");
  }
  if (
    expoConfig.splash?.resizeMode !== "contain" ||
    splashPlugin?.image !== NATIVE_ARRIVAL_POSTER ||
    splashPlugin?.backgroundColor !== BRAND_NAVY ||
    splashPlugin?.resizeMode !== "contain" ||
    splashPlugin?.ios?.enableFullScreenImage_legacy !== true ||
    splashPlugin?.android?.image !== ANDROID_SPLASH ||
    splashPlugin?.android?.imageWidth !== 200
  ) {
    errors.push("Splash plugin must preserve full-view iOS arrival framing and the Android system icon.");
  }
  if (native.displayName !== expoConfig.name) {
    errors.push("Native iOS display name must match Expo config.");
  }
  if (native.iconDigest !== assets.iconDigest) {
    errors.push("Native iOS icon must match the release icon.");
  }
  if (
    native.splashDigests.length !== 3 ||
    native.splashDigests.some((value) => value !== assets.splashDigest)
  ) {
    errors.push("Native iOS splash images must match the composited native arrival poster.");
  }
  if (
    native.splashContentMode !== "scaleAspectFit" ||
    !["top", "leading", "trailing", "bottom"].every(
      (edge) => native.splashEdges?.includes(edge),
    ) ||
    native.splashBackgroundColor !== BRAND_NAVY
  ) {
    errors.push("Native iOS splash must contain the poster across the full view on brand navy.");
  }
  return errors;
}

/** Verify packaged media against its decoded build record without requiring FFmpeg in CI. */
function validateArrivalMedia({ manifest, files, packagedNames, masterDigest, nativePoster }) {
  const errors = [];
  if (masterDigest !== APPROVED_MASTER_SHA256) {
    errors.push("Approved VantaHome icon master must remain unchanged.");
  }
  const records = Array.isArray(manifest?.assets) ? manifest.assets : [];
  const expectedNames = [...ARRIVAL_ASSETS].sort().join("\n");
  if (
    [...packagedNames].sort().join("\n") !== expectedNames ||
    records.map((record) => record.filename).sort().join("\n") !== expectedNames
  ) {
    errors.push("Arrival must package only the entrance, completed hold, and their two still frames; remove obsolete clips.");
  }
  let totalBytes = 0;
  for (const filename of ARRIVAL_ASSETS) {
    const file = files[filename];
    const record = records.find((candidate) => candidate.filename === filename);
    if (!file || !record) {
      errors.push(`Arrival media is missing: ${filename}.`);
      continue;
    }
    totalBytes += file.bytes;
    if (file.bytes !== record.bytes || file.digest !== record.sha256) {
      errors.push(`Arrival build record does not match packaged bytes: ${filename}.`);
    }
    if (filename.endsWith(".png")) {
      if (file.width !== 1024 || file.height !== 768) {
        errors.push(`Arrival still must be 1024x768: ${filename}.`);
      }
      continue;
    }
    // Hash agreement above binds the recorded format/decode results to the shipped file.
    // This guard does not substitute for the build script's full video decode.
    const streams = record.probe?.streams ?? [];
    const stream = streams[0];
    const duration = Number(record.probe?.format?.duration);
    if (
      streams.length !== 1 ||
      stream?.codec_type !== "video" ||
      stream?.codec_name !== "h264" ||
      stream?.pix_fmt !== "yuv420p" ||
      stream?.width !== 1024 || stream?.height !== 768 ||
      !Number.isFinite(duration) || duration <= 0 || duration > 3
    ) {
      errors.push(`Arrival clip must be silent 1024x768 H.264/yuv420p, up to 3 seconds: ${filename}.`);
    }
  }
  if (totalBytes > ARRIVAL_BYTE_LIMIT) {
    errors.push("The four bundled arrival assets must total no more than 3 MiB.");
  }
  if (
    files["vantahome-arrival-hold.png"] && files["vantahome-arrival-poster.png"] &&
    files["vantahome-arrival-hold.png"].digest === files["vantahome-arrival-poster.png"].digest
  ) {
    errors.push("Opening and completed arrival stills must represent distinct poses.");
  }
  // Storyboards cannot apply the runtime SVG veil. Bind their baked composite
  // to the exact decoded opening still without adding a fifth runtime asset.
  const composite = manifest?.nativeSplashComposite;
  if (
    !nativePoster || !composite ||
    composite.filename !== configuredPath(NATIVE_ARRIVAL_POSTER) ||
    composite.sha256 !== nativePoster.digest || composite.bytes !== nativePoster.bytes ||
    composite.width !== 1024 || composite.height !== 768 ||
    nativePoster.width !== composite.width || nativePoster.height !== composite.height ||
    composite.sourcePosterSha256 !== files["vantahome-arrival-poster.png"]?.digest
  ) {
    errors.push("Native splash composite must match its recorded 1024x768 asset and decoded opening-poster source.");
  }
  return errors;
}

/** Convert Expo's relative asset paths to paths accepted by the filesystem. */
function configuredPath(value) {
  return value.replace(/^\.\//, "");
}

/** Read metadata and checksum from the same image bytes. */
function loadPng(path) {
  const buffer = fs.readFileSync(path);
  return { ...readPngMetadata(buffer), digest: digest(buffer), bytes: buffer.length };
}

/** Load only the bounded runtime arrival inventory; original production films stay outside the bundle. */
function loadArrivalMedia() {
  const directory = "assets/brand/motion";
  const packagedNames = fs.readdirSync(directory).filter((name) => /^vantahome-arrival-.*\.(?:mp4|png)$/.test(name));
  const files = {};
  for (const filename of ARRIVAL_ASSETS) {
    const path = `${directory}/${filename}`;
    if (!fs.existsSync(path)) continue;
    const buffer = fs.readFileSync(path);
    files[filename] = {
      bytes: buffer.length,
      digest: digest(buffer),
      ...(filename.endsWith(".png") ? readPngMetadata(buffer) : {}),
    };
  }
  return {
    manifest: JSON.parse(fs.readFileSync(`${directory}/arrival.production.json`, "utf8")),
    files,
    packagedNames,
    masterDigest: digest(fs.readFileSync("assets/brand/vantahome-icon-master.png")),
  };
}

/** Inspect checked-in storyboard geometry and the actual named background color. */
function loadNativeSplashPresentation() {
  const storyboard = fs.readFileSync("ios/vantahome/SplashScreen.storyboard", "utf8");
  const colors = JSON.parse(fs.readFileSync(
    "ios/vantahome/Images.xcassets/SplashScreenBackground.colorset/Contents.json",
    "utf8",
  ));
  const components = colors.colors[0].color.components;
  const splashBackgroundColor = `#${["red", "green", "blue"].map((channel) => {
    const value = Number(components[channel]);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error("Native splash background has an invalid color component.");
    }
    return Math.round(value * 255).toString(16).padStart(2, "0");
  }).join("")}`;
  return {
    splashBackgroundColor,
    splashContentMode: storyboard.match(
      /<imageView[^>]*id="EXPO-SplashScreen"[^>]*contentMode="([^"]+)"/,
    )?.[1],
    splashEdges: Array.from(storyboard.matchAll(
      /<constraint firstItem="EXPO-SplashScreen" firstAttribute="([^"]+)" secondItem="EXPO-ContainerView" secondAttribute="\1"/g,
    ), (match) => match[1]),
  };
}

/** Validate the committed release assets; never regenerate artwork implicitly. */
function main() {
  const expoConfig = require("../app.json").expo;
  const icon = loadPng(configuredPath(expoConfig.icon));
  const adaptive = loadPng(
    configuredPath(expoConfig.android.adaptiveIcon.foregroundImage),
  );
  const splash = loadPng(configuredPath(expoConfig.splash.image));
  const androidSplash = loadPng(configuredPath(expoConfig.android.splash.image));
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
      androidSplash,
      favicon,
      iconDigest: icon.digest,
      adaptiveDigest: adaptive.digest,
      splashDigest: splash.digest,
    },
    native: {
      ...loadNativeSplashPresentation(),
      displayName,
      iconDigest: digest(nativeIcon),
      splashDigests: nativeSplashPaths.map((path) =>
        digest(fs.readFileSync(path)),
      ),
    },
  });
  errors.push(...validateArrivalMedia({ ...loadArrivalMedia(), nativePoster: splash }));
  if (errors.length) {
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log("Release icons, four arrival assets, native splash composite, and platform framing are valid.");
}

if (require.main === module) main();

module.exports = { readPngMetadata, validateReleaseAssets, validateArrivalMedia };
