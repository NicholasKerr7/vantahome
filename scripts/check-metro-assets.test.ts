const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { getAssetData, getAssetSize } = require("metro/private/Assets");
const manifest = require("../package.json");
const lockfile = require("../package-lock.json");

const repository = path.resolve(__dirname, "..");

/** Create only the PNG header needed to exercise Metro's dimension parser. */
function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(buffer);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  return buffer;
}

describe("Expo's patched Metro asset pipeline", () => {
  test("keeps the reviewed Metro family aligned without a vulnerable image-size copy", () => {
    const overrides = manifest.overrides["@expo/metro"];
    const packages = Object.entries(lockfile.packages) as Array<[string, { version: string }]>;
    expect(Object.keys(overrides)).toHaveLength(14);
    for (const [name, version] of Object.entries(overrides)) {
      expect(version).toBe("0.83.8");
      expect(require(`${name}/package.json`).version).toBe(version);
      const copies = packages.filter(([location]) =>
        location.endsWith(`/node_modules/${name}`) || location === `node_modules/${name}`,
      );
      expect(copies.length).toBeGreaterThan(0);
      expect(copies.every(([, pkg]) => pkg.version === version)).toBe(true);
    }
    expect(require("ob1/package.json").version).toBe("0.83.8");
    expect(packages.filter(([location]) =>
      /(?:^|\/)node_modules\/image-size$/.test(location),
    )).toEqual([]);
    expect(require("metro/package.json").dependencies["image-size"]).toBeUndefined();
  });

  test.each<[string, number]>([
    ["icon.png", 1024],
    ["adaptive-icon.png", 1024],
    ["splash-icon.png", 1024],
    ["favicon.png", 48],
  ])("preserves actual release asset dimensions for %s", async (filename, size) => {
    const assetPath = path.join(repository, "assets/release", filename);
    const expected = { width: size, height: size };
    expect(getAssetSize("png", fs.readFileSync(assetPath), assetPath)).toEqual(expected);
    await expect(getAssetData(assetPath, `assets/release/${filename}`, [], "ios", "/assets"))
      .resolves.toEqual(expect.objectContaining({
        ...expected, __packager_asset: true, scales: [1], type: "png",
      }));
  });

  test("preserves SVG viewBox/units and non-image asset handling", () => {
    expect(getAssetSize("svg", Buffer.from('<svg viewBox="0 0 240 120"></svg>'), "icon.svg"))
      .toEqual({ width: 240, height: 120 });
    expect(getAssetSize("svg", Buffer.from('<svg width="2in" height="1in"></svg>'), "icon.svg"))
      .toEqual({ width: 192, height: 96 });
    expect(getAssetSize("ttf", Buffer.from("font fixture"), "font.ttf")).toBeNull();
  });

  test("preserves scaled and platform-specific assets through the asynchronous file pipeline", async () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "vantahome-metro-assets-"));
    try {
      fs.writeFileSync(path.join(fixture, "light@2x.png"), pngHeader(64, 32));
      fs.writeFileSync(path.join(fixture, "light@2x.ios.png"), pngHeader(80, 40));
      const assetPath = path.join(fixture, "light@2x.png");
      await expect(getAssetData(assetPath, "light@2x.png", [], "web", "/assets"))
        .resolves.toEqual(expect.objectContaining({ width: 32, height: 16, scales: [2] }));
      await expect(getAssetData(assetPath, "light@2x.png", [], "ios", "/assets"))
        .resolves.toEqual(expect.objectContaining({ width: 40, height: 20, scales: [2] }));
    } finally {
      // Remove only this test's newly created directory, never repository assets.
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  test.each([
    Buffer.alloc(0),
    pngHeader(0, 20),
    pngHeader(20, 0),
    pngHeader(20, 20).subarray(0, 18),
    Buffer.from("not an image"),
  ])("rejects empty, truncated, or invalid image dimensions", (buffer) => {
    expect(() => getAssetSize("png", buffer, "invalid.png")).toThrow();
  });

  test("rejects bounded malformed ICNS, JXL, HEIF, JPEG, and WebP samples before a process deadline", () => {
    // Exercise actual Metro in an isolated process so a parser regression cannot
    // hang Jest. Unsupported formats disguised as PNG must not enter old parsers.
    expect(execFileSync(process.execPath, ["-e", `
      const assert = require('node:assert/strict');
      const { getAssetSize } = require('metro/private/Assets');
      const samples = [
        ['png', '69636e730000001049434f4e00000000'],
        ['png', '0000000c4a584c200d0a870a00000010667479706a786c2000000000000000006a786c70'],
        ['png', '00000010667479706865696300000000000000306d6574610000000000000024697072700000001c6970636f0000000069737065000000000000000100000001'],
        ['jpg', 'ffd8ffe00000'],
        ['webp', '5249464614000000574542504a554e4b00000000'],
      ];
      for (const [type, hex] of samples) {
        assert.throws(() => getAssetSize(type, Buffer.from(hex, 'hex'), 'malformed.' + type));
      }
      process.stdout.write('rejected');
    `], { cwd: repository, timeout: 2000, encoding: "utf8" })).toBe("rejected");
  });
});
