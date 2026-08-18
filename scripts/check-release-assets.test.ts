const {
  readPngMetadata,
  validateReleaseAssets,
} = require("./check-release-assets.js");

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

const expoConfig = {
  name: "VantaHome",
  icon: "./assets/release/icon.png",
  splash: {
    image: "./assets/release/splash-icon.png",
    backgroundColor: "#050612",
  },
  ios: { icon: "./assets/release/icon.png" },
  android: {
    icon: "./assets/release/icon.png",
    adaptiveIcon: {
      foregroundImage: "./assets/release/adaptive-icon.png",
      backgroundColor: "#050612",
    },
  },
  web: { favicon: "./assets/release/favicon.png" },
};

describe("release asset check", () => {
  test("reads PNG size and alpha channel metadata", () => {
    expect(readPngMetadata(pngHeader(1024, 1024, 2))).toEqual({
      width: 1024,
      height: 1024,
      hasAlpha: false,
    });
    expect(readPngMetadata(pngHeader(1024, 1024, 6)).hasAlpha).toBe(true);
  });

  test("accepts aligned release and native assets", () => {
    expect(
      validateReleaseAssets({
        expoConfig,
        assets: {
          icon: { width: 1024, height: 1024, hasAlpha: false },
          adaptive: { width: 1024, height: 1024, hasAlpha: true },
          splash: { width: 1024, height: 1024, hasAlpha: true },
          favicon: { width: 48, height: 48, hasAlpha: false },
          iconDigest: "icon",
          splashDigest: "splash",
        },
        native: {
          displayName: "VantaHome",
          iconDigest: "icon",
          splashDigests: ["splash", "splash", "splash"],
        },
      }),
    ).toEqual([]);
  });

  test("rejects transparent app icons and stale native copies", () => {
    const errors = validateReleaseAssets({
      expoConfig,
      assets: {
        icon: { width: 1024, height: 1024, hasAlpha: true },
        adaptive: { width: 1024, height: 1024, hasAlpha: true },
        splash: { width: 1024, height: 1024, hasAlpha: true },
        favicon: { width: 48, height: 48, hasAlpha: true },
        iconDigest: "new-icon",
        splashDigest: "new-splash",
      },
      native: {
        displayName: "VantaHome",
        iconDigest: "old-icon",
        splashDigests: ["old-splash"],
      },
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        "App icon must be an opaque 1024x1024 PNG.",
        "Native iOS icon must match the release icon.",
        "Native iOS splash images must match the release splash.",
      ]),
    );
  });
});
