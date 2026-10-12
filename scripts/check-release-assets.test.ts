const {
  readPngMetadata,
  validateReleaseAssets,
} = require("./check-release-assets.js");

/** Build only the PNG header needed by the asset metadata reader. */
function pngHeader(width: number, height: number, colorType: number) {
  const buffer = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = colorType;
  return buffer;
}

/** Keep each mutation isolated so checks cannot pass because another test changed the fixture. */
function releaseFixture() {
  const poster = "./assets/brand/motion/vantahome-arrival-poster.png";
  const systemIcon = "./assets/release/splash-icon.png";
  const pluginOptions = {
    image: poster,
    backgroundColor: "#050612",
    resizeMode: "contain",
    ios: { enableFullScreenImage_legacy: true },
    android: { image: systemIcon, imageWidth: 200 },
  };
  return {
    expoConfig: {
      name: "VantaHome",
      icon: "./assets/release/icon.png",
      splash: {
        image: poster,
        backgroundColor: "#050612",
        resizeMode: "contain",
      },
      ios: { icon: "./assets/release/icon.png" },
      android: {
        icon: "./assets/release/icon.png",
        adaptiveIcon: {
          foregroundImage: "./assets/release/adaptive-icon.png",
          backgroundColor: "#050612",
        },
        splash: { image: systemIcon, backgroundColor: "#050612" },
      },
      web: { favicon: "./assets/release/favicon.png" },
      plugins: [["expo-splash-screen", pluginOptions]],
    },
    assets: {
      icon: { width: 1024, height: 1024, hasAlpha: false },
      adaptive: { width: 1024, height: 1024, hasAlpha: false },
      splash: { width: 1024, height: 768, hasAlpha: false },
      androidSplash: { width: 1024, height: 1024, hasAlpha: true },
      favicon: { width: 48, height: 48, hasAlpha: false },
      iconDigest: "icon",
      adaptiveDigest: "icon",
      splashDigest: "splash",
    },
    native: {
      displayName: "VantaHome",
      iconDigest: "icon",
      splashDigests: ["splash", "splash", "splash"],
      splashContentMode: "scaleAspectFit",
      splashEdges: ["top", "leading", "trailing", "bottom"],
      splashBackgroundColor: "#050612",
    },
  };
}

describe("release asset check", () => {
  test("reads PNG size and alpha channel metadata", () => {
    expect(readPngMetadata(pngHeader(1024, 768, 2))).toEqual({
      width: 1024,
      height: 768,
      hasAlpha: false,
    });
    expect(readPngMetadata(pngHeader(1024, 1024, 6)).hasAlpha).toBe(true);
  });

  test("accepts aligned arrival framing and unchanged app identity", () => {
    expect(validateReleaseAssets(releaseFixture())).toEqual([]);
  });

  test("rejects transparent app icons and stale native copies", () => {
    const fixture = releaseFixture();
    fixture.assets.icon.hasAlpha = true;
    fixture.assets.adaptive.hasAlpha = true;
    fixture.native.iconDigest = "old-icon";
    fixture.native.splashDigests = ["old-splash", "old-splash", "old-splash"];
    expect(validateReleaseAssets(fixture)).toEqual(
      expect.arrayContaining([
        "App icon must be an opaque 1024x1024 PNG.",
        "Adaptive foreground must be an opaque 1024x1024 PNG matching the app icon.",
        "Native iOS icon must match the release icon.",
        "Native iOS splash images must match the arrival poster.",
      ]),
    );
  });

  test("rejects a poster crop or backdrop that would jump when the app takes over", () => {
    const fixture = releaseFixture();
    fixture.assets.splash.height = 1024;
    fixture.native.splashContentMode = "scaleAspectFill";
    fixture.native.splashBackgroundColor = "#ffffff";
    expect(validateReleaseAssets(fixture)).toEqual(expect.arrayContaining([
      "Arrival poster must be a 1024x768 PNG matching the film frame.",
      "Native iOS splash must contain the poster across the full view on brand navy.",
    ]));
  });

  test("requires all native image scales and full-view constraints", () => {
    const fixture = releaseFixture();
    fixture.native.splashDigests = [];
    fixture.native.splashEdges = ["top", "leading"];
    expect(validateReleaseAssets(fixture)).toEqual(expect.arrayContaining([
      "Native iOS splash images must match the arrival poster.",
      "Native iOS splash must contain the poster across the full view on brand navy.",
    ]));
  });

  test("requires the reproducible native splash plugin configuration", () => {
    const fixture = releaseFixture();
    fixture.expoConfig.plugins = [];
    expect(validateReleaseAssets(fixture)).toContain(
      "Splash plugin must preserve full-view iOS arrival framing and the Android system icon.",
    );
  });
});
