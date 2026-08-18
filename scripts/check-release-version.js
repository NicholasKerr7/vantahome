#!/usr/bin/env node

const fs = require("node:fs");

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

function plistString(plist, key) {
  const match = plist.match(
    new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`),
  );
  return match?.[1];
}

function validateVersionConfig({
  packageVersion,
  expoConfig,
  iosInfoPlist,
  xcodeProject,
}) {
  const errors = [];
  const appVersion = expoConfig?.version;
  const iosBuildNumber = expoConfig?.ios?.buildNumber;
  const androidVersionCode = expoConfig?.android?.versionCode;

  if (!SEMVER_PATTERN.test(packageVersion)) {
    errors.push("package.json version must use semantic versioning.");
  }
  if (appVersion !== packageVersion) {
    errors.push("package.json and app.json versions must match.");
  }
  if (!POSITIVE_INTEGER_PATTERN.test(String(iosBuildNumber ?? ""))) {
    errors.push("expo.ios.buildNumber must be a positive integer string.");
  }
  if (!Number.isInteger(androidVersionCode) || androidVersionCode < 1) {
    errors.push("expo.android.versionCode must be a positive integer.");
  }

  if (iosInfoPlist) {
    if (plistString(iosInfoPlist, "CFBundleShortVersionString") !== appVersion) {
      errors.push("Native iOS marketing version must match app.json.");
    }
    if (plistString(iosInfoPlist, "CFBundleVersion") !== iosBuildNumber) {
      errors.push("Native iOS build number must match app.json.");
    }
  }

  if (xcodeProject) {
    const marketingVersions = [
      ...xcodeProject.matchAll(/MARKETING_VERSION = ([^;]+);/g),
    ].map((match) => match[1]);
    const buildNumbers = [
      ...xcodeProject.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g),
    ].map((match) => match[1]);
    if (
      marketingVersions.length === 0 ||
      marketingVersions.some((version) => version !== appVersion)
    ) {
      errors.push("Xcode marketing versions must match app.json.");
    }
    if (
      buildNumbers.length === 0 ||
      buildNumbers.some((version) => version !== iosBuildNumber)
    ) {
      errors.push("Xcode build numbers must match app.json.");
    }
  }

  return errors;
}

function main() {
  const packageJson = require("../package.json");
  const appJson = require("../app.json");
  const iosInfoPath = "ios/vantahome/Info.plist";
  const xcodeProjectPath = "ios/vantahome.xcodeproj/project.pbxproj";
  const errors = validateVersionConfig({
    packageVersion: packageJson.version,
    expoConfig: appJson.expo,
    iosInfoPlist: fs.existsSync(iosInfoPath)
      ? fs.readFileSync(iosInfoPath, "utf8")
      : undefined,
    xcodeProject: fs.existsSync(xcodeProjectPath)
      ? fs.readFileSync(xcodeProjectPath, "utf8")
      : undefined,
  });
  if (errors.length) {
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log(
    `Release version ${appJson.expo.version} (${appJson.expo.ios.buildNumber} iOS, ${appJson.expo.android.versionCode} Android) is consistent.`,
  );
}

if (require.main === module) main();

module.exports = { plistString, validateVersionConfig };
