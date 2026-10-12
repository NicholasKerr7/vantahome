const {
  readPngMetadata,
  validateReleaseAssets,
  validateArrivalMedia,
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
  const poster = "./assets/release/arrival-native-poster.png";
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
        "Native iOS splash images must match the composited native arrival poster.",
      ]),
    );
  });

  test("rejects a poster crop or backdrop that would jump when the app takes over", () => {
    const fixture = releaseFixture();
    fixture.assets.splash.height = 1024;
    fixture.native.splashContentMode = "scaleAspectFill";
    fixture.native.splashBackgroundColor = "#ffffff";
    expect(validateReleaseAssets(fixture)).toEqual(expect.arrayContaining([
      "Native arrival composite must be a 1024x768 PNG matching the runtime frame.",
      "Native iOS splash must contain the poster across the full view on brand navy.",
    ]));
  });

  test("requires all native image scales and full-view constraints", () => {
    const fixture = releaseFixture();
    fixture.native.splashDigests = [];
    fixture.native.splashEdges = ["top", "leading"];
    expect(validateReleaseAssets(fixture)).toEqual(expect.arrayContaining([
      "Native iOS splash images must match the composited native arrival poster.",
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

  test("rejects the uncomposited runtime poster as the operating-system splash", () => {
    const fixture = releaseFixture();
    fixture.expoConfig.splash.image = "./assets/brand/motion/vantahome-arrival-poster.png";
    expect(validateReleaseAssets(fixture)).toContain("Expo release asset paths are inconsistent.");
  });
});

/** Model a decoded two-clip delivery with distinct opening and completed stills. */
function arrivalFixture() {
  const packagedNames = [
    "vantahome-arrival-enter.mp4", "vantahome-arrival-hold.mp4",
    "vantahome-arrival-hold.png", "vantahome-arrival-poster.png",
  ];
  return {
    masterDigest: "1c3533ce82c3fa7bb12c45ab7e0b1123a12561d9ec06326f41da9744e32b5f9d",
    packagedNames,
    files: Object.fromEntries(packagedNames.map((filename) => [filename, {
      digest: filename, bytes: 200_000, width: 1024, height: 768,
    }])),
    nativePoster: { digest: "native-composite", bytes: 180_000, width: 1024, height: 768 },
    manifest: {
      nativeSplashComposite: {
        filename: "assets/release/arrival-native-poster.png", sha256: "native-composite",
        bytes: 180_000, width: 1024, height: 768,
        sourcePosterSha256: "vantahome-arrival-poster.png",
      },
      assets: packagedNames.map((filename) => ({
        filename, sha256: filename, bytes: 200_000,
        probe: {
          streams: [{ codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p", width: 1024, height: 768 }],
          format: { duration: "2.000000" },
        },
      })),
    },
  };
}

describe("bundled cinematic arrival", () => {
  test("accepts a bounded silent delivery without changing the approved icon", () => {
    expect(validateArrivalMedia(arrivalFixture())).toEqual([]);
  });

  test("rejects stale resolve clips even when the new manifest omits them", () => {
    const fixture = arrivalFixture();
    fixture.packagedNames.push("vantahome-arrival-resolve.mp4");
    expect(validateArrivalMedia(fixture)).toContain(
      "Arrival must package only the entrance, completed hold, and their two still frames; remove obsolete clips.",
    );
  });

  test("rejects stale probe evidence when the media bytes change", () => {
    const fixture = arrivalFixture();
    fixture.files["vantahome-arrival-enter.mp4"].digest = "different-export";
    expect(validateArrivalMedia(fixture)).toContain(
      "Arrival build record does not match packaged bytes: vantahome-arrival-enter.mp4.",
    );
  });

  test("rejects soundtrack-bearing or overly long startup clips", () => {
    const fixture = arrivalFixture();
    fixture.manifest.assets[0].probe.streams.push({
      codec_type: "audio", codec_name: "aac", pix_fmt: "", width: 0, height: 0,
    });
    fixture.manifest.assets[1].probe.format.duration = "12";
    expect(validateArrivalMedia(fixture)).toEqual(expect.arrayContaining([
      "Arrival clip must be silent 1024x768 H.264/yuv420p, up to 3 seconds: vantahome-arrival-enter.mp4.",
      "Arrival clip must be silent 1024x768 H.264/yuv420p, up to 3 seconds: vantahome-arrival-hold.mp4.",
    ]));
  });

  test("bounds download size and protects distinct static fallback poses", () => {
    const fixture = arrivalFixture();
    fixture.files["vantahome-arrival-enter.mp4"].bytes = 4 * 1024 * 1024;
    fixture.files["vantahome-arrival-hold.png"].digest = fixture.files["vantahome-arrival-poster.png"].digest;
    expect(validateArrivalMedia(fixture)).toEqual(expect.arrayContaining([
      "The four bundled arrival assets must total no more than 3 MiB.",
      "Opening and completed arrival stills must represent distinct poses.",
    ]));
  });

  test("rejects master replacement and a wrongly framed completed still", () => {
    const fixture = arrivalFixture();
    fixture.masterDigest = "replaced-master";
    fixture.files["vantahome-arrival-hold.png"].height = 1024;
    expect(validateArrivalMedia(fixture)).toEqual(expect.arrayContaining([
      "Approved VantaHome icon master must remain unchanged.",
      "Arrival still must be 1024x768: vantahome-arrival-hold.png.",
    ]));
  });

  test("binds the native composite to the exact decoded opening rather than the hold still", () => {
    const fixture = arrivalFixture();
    fixture.manifest.nativeSplashComposite.sourcePosterSha256 = fixture.files["vantahome-arrival-hold.png"].digest;
    expect(validateArrivalMedia(fixture)).toContain(
      "Native splash composite must match its recorded 1024x768 asset and decoded opening-poster source.",
    );
  });

  test("rejects an out-of-date or wrongly framed native composite", () => {
    const fixture = arrivalFixture();
    fixture.nativePoster.digest = "previous-generation";
    fixture.nativePoster.height = 1024;
    expect(validateArrivalMedia(fixture)).toContain(
      "Native splash composite must match its recorded 1024x768 asset and decoded opening-poster source.",
    );
  });
});
