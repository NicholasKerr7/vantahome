const { validateVersionConfig } = require("./check-release-version.js");

const validInput = {
  packageVersion: "1.2.3",
  expoConfig: {
    version: "1.2.3",
    ios: { buildNumber: "7" },
    android: { versionCode: 7 },
  },
  iosInfoPlist: `
    <key>CFBundleShortVersionString</key><string>1.2.3</string>
    <key>CFBundleVersion</key><string>7</string>
  `,
  xcodeProject: `
    MARKETING_VERSION = 1.2.3;
    CURRENT_PROJECT_VERSION = 7;
  `,
};

describe("release version check", () => {
  test("accepts aligned app and native versions", () => {
    expect(validateVersionConfig(validInput)).toEqual([]);
  });

  test("rejects package, platform, and native version drift", () => {
    const errors = validateVersionConfig({
      ...validInput,
      packageVersion: "1.2.2",
      expoConfig: {
        version: "1.2.3",
        ios: { buildNumber: "0" },
        android: { versionCode: 0 },
      },
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        "package.json and app.json versions must match.",
        "expo.ios.buildNumber must be a positive integer string.",
        "expo.android.versionCode must be a positive integer.",
        "Native iOS build number must match app.json.",
        "Xcode build numbers must match app.json.",
      ]),
    );
  });
});
