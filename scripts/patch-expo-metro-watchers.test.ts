const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { EventEmitter } = require("node:events");
const {
  ensureCompatibility, patchSource, resolveCompatibilityTargets, PATCHES,
  ORIGINAL_LISTENER, PATCHED_LISTENER, WATCH_EVENT_ADAPTER,
} = require("./patch-expo-metro-watchers.js");

type FileChange = [string, { isSymlink: boolean; modifiedTime: number | null }];
type Changes = {
  addedFiles: Iterable<FileChange>;
  modifiedFiles: Iterable<FileChange>;
  removedFiles: Iterable<FileChange>;
  addedDirectories: Iterable<string>;
  removedDirectories: Iterable<string>;
};
type WatchEvent = {
  type: "add" | "change" | "delete";
  filePath: string;
  metadata?: { type: "f" | "d" | "l"; modifiedTime?: number | null; size?: number | null };
};
type Runner = ReturnType<typeof createRunner>;
type WatcherExports = {
  observeFileChanges: (runner: Runner, files: string[], callback: () => void) => () => void;
  observeAnyFileChanges: (runner: Runner, callback: (events: WatchEvent[]) => void) => () => void;
  waitForMetroToObserveTypeScriptFile: (root: string, runner: Runner, callback: () => void) => () => void;
  metroWatchTypeScriptFiles: (options: {
    metro: Runner["metro"];
    server: Runner["server"];
    projectRoot: string;
    callback: (event: WatchEvent) => void;
    tsconfig?: boolean;
    throttle?: boolean;
    eventTypes?: WatchEvent["type"][];
  }) => () => void;
};

const projectRoot = path.resolve("/fixture/project");

/** Read the installed guarded source without importing broader CLI/environment code. */
function loadWatchers(name = "waitForMetroToObserveTypeScriptFile.js") {
  const filename = path.join(resolveCompatibilityTargets(), name);
  const source = patchSource(name, fs.readFileSync(filename, "utf8"));
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, require: createRequire(filename),
  }, { filename });
  return module.exports as WatcherExports;
}

/** Load the real installer against a fake filesystem to test guards without changing dependencies. */
function loadInstaller(read: (filename: string, encoding: string) => string) {
  const filename = path.resolve(__dirname, "patch-expo-metro-watchers.js");
  const localRequire = createRequire(filename);
  const write = jest.fn();
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports, console, __dirname: path.dirname(filename),
    require: (name: string) => name === "node:fs"
      ? { ...fs, readFileSync: read, writeFileSync: write }
      : localRequire(name),
  }, { filename });
  return {
    ...module.exports as { ensureCompatibility: (options?: { checkOnly?: boolean }) => void },
    write,
  };
}

/** Recover reviewed originals in memory while leaving installed patched files untouched. */
function readOriginal(filename: string, encoding: string): string {
  const source = fs.readFileSync(filename, encoding);
  return Object.hasOwn(PATCHES, path.basename(filename))
    ? source.replace(WATCH_EVENT_ADAPTER, "").replaceAll(PATCHED_LISTENER, ORIGINAL_LISTENER)
    : source;
}

/** Provide a realistic watcher/server lifecycle without starting Metro or reading app configuration. */
function createRunner() {
  const watcher = new EventEmitter();
  const server = new EventEmitter();
  const metro = { getBundler: () => ({ getBundler: () => ({ getWatcher: () => watcher }) }) };
  return { watcher, server, metro };
}

/** Build a complete Metro 0.83.8 change event; file paths are relative to rootDir. */
function changeEvent(changes: Partial<Changes> = {}) {
  return {
    rootDir: projectRoot,
    changes: {
      addedFiles: [], modifiedFiles: [], removedFiles: [],
      addedDirectories: [], removedDirectories: [], ...changes,
    },
  };
}

/** Model the public metadata supplied by the patched Metro file map. */
function fileChange(filename: string, isSymlink = false): FileChange {
  return [filename, { isSymlink, modifiedTime: 123 }];
}

describe("Expo SDK 54 watcher compatibility", () => {
  test.each(Object.keys(PATCHES))("patches only reviewed %s source and is idempotent", (name) => {
    const patched = fs.readFileSync(path.join(resolveCompatibilityTargets(), name), "utf8");
    const original = patched.replace(WATCH_EVENT_ADAPTER, "")
      .replaceAll(PATCHED_LISTENER, ORIGINAL_LISTENER);
    expect(patchSource(name, original)).toBe(patched);
    expect(patchSource(name, patched)).toBe(patched);
    expect(() => patchSource(name, `${original}\n// unknown change`)).toThrow("Unexpected Expo watcher source");
    expect(() => patchSource(name, `${patched}\n// unknown change`)).toThrow("Unexpected Expo watcher source");
  });

  test("verifies installed patches and refuses an unreviewed target", () => {
    expect(() => ensureCompatibility({ checkOnly: true })).not.toThrow();
    expect(() => patchSource("unknown.js", "source")).toThrow("Unknown Expo watcher");
  });

  test("check mode detects skipped lifecycle scripts without writing", () => {
    const installer = loadInstaller(readOriginal);
    expect(() => installer.ensureCompatibility({ checkOnly: true })).toThrow("patch is missing");
    expect(installer.write).not.toHaveBeenCalled();
  });

  test("installer reviews both sources before writing either file", () => {
    const installer = loadInstaller((filename, encoding) => {
      const source = readOriginal(filename, encoding);
      return filename.endsWith("metroWatchTypeScriptFiles.js") ? `${source}\n// unknown change` : source;
    });
    expect(() => installer.ensureCompatibility()).toThrow("Unexpected Expo watcher source");
    expect(installer.write).not.toHaveBeenCalled();
  });

  test("installer only writes the two reviewed sources", () => {
    const installer = loadInstaller(readOriginal);
    installer.ensureCompatibility();
    expect(installer.write).toHaveBeenCalledTimes(2);
    for (const name of Object.keys(PATCHES)) {
      const filename = path.join(resolveCompatibilityTargets(), name);
      expect(installer.write).toHaveBeenCalledWith(filename, fs.readFileSync(filename, "utf8"));
    }
  });

  test("installer rejects CLI version drift before writing", () => {
    const installer = loadInstaller((filename, encoding) => {
      const source = readOriginal(filename, encoding);
      return filename.endsWith("@expo/cli/package.json")
        ? JSON.stringify({ ...JSON.parse(source), version: "54.0.28" }) : source;
    });
    expect(() => installer.ensureCompatibility()).toThrow("Unexpected Expo CLI/Metro versions");
    expect(installer.write).not.toHaveBeenCalled();
  });

  test("TypeScript startup detection only reacts to added project files and unsubscribes once", () => {
    const runner = createRunner();
    const callback = jest.fn();
    loadWatchers().waitForMetroToObserveTypeScriptFile(projectRoot, runner, callback);
    runner.watcher.emit("change", changeEvent({
      modifiedFiles: [fileChange("existing.ts")],
      addedFiles: [fileChange("node_modules/vendor/index.ts"), fileChange("notes.md")],
      addedDirectories: ["directory.ts"],
    }));
    expect(callback).not.toHaveBeenCalled();
    runner.watcher.emit("change", changeEvent({ addedFiles: [fileChange("new.tsx")] }));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(runner.watcher.listenerCount("change")).toBe(0);
    runner.watcher.emit("change", changeEvent({ addedFiles: [fileChange("another.ts")] }));
    expect(callback).toHaveBeenCalledTimes(1);
    runner.server.emit("close");
  });

  test("TypeScript startup detection recognizes the root tsconfig using an absolute path", () => {
    const runner = createRunner();
    const callback = jest.fn();
    loadWatchers().waitForMetroToObserveTypeScriptFile(projectRoot, runner, callback);
    runner.watcher.emit("change", changeEvent({ addedFiles: [fileChange("child/tsconfig.json")] }));
    expect(callback).not.toHaveBeenCalled();
    runner.watcher.emit("change", changeEvent({ addedFiles: [fileChange("tsconfig.json")] }));
    expect(callback).toHaveBeenCalledTimes(1);
    runner.server.emit("close");
  });

  test("specific-file observation preserves add/change/delete and ignores unrelated paths/directories", () => {
    const runner = createRunner();
    const callback = jest.fn();
    loadWatchers().observeFileChanges(runner, [path.join(projectRoot, "settings.json")], callback);
    runner.watcher.emit("change", changeEvent({
      addedFiles: [fileChange("nested/settings.json")], addedDirectories: ["settings.json"],
    }));
    expect(callback).not.toHaveBeenCalled();
    for (const collection of ["addedFiles", "modifiedFiles", "removedFiles"]) {
      runner.watcher.emit("change", changeEvent({ [collection]: [fileChange("settings.json")] }));
    }
    expect(callback).toHaveBeenCalledTimes(3);
    runner.server.emit("close");
    expect(runner.watcher.listenerCount("change")).toBe(0);
  });

  test("any-file observation preserves complete legacy events, symlinks, and directory metadata", () => {
    const runner = createRunner();
    const callback = jest.fn();
    const off = loadWatchers().observeAnyFileChanges(runner, callback);
    runner.watcher.emit("change", changeEvent({
      addedFiles: new Map([fileChange("src/new.ts")]),
      modifiedFiles: [fileChange("../shared/link.ts", true)],
      removedFiles: [fileChange("old.ts")],
      addedDirectories: new Set(["src/new"]), removedDirectories: ["old"],
    }));
    expect(callback).toHaveBeenCalledWith([
      { type: "add", filePath: path.resolve(projectRoot, "src/new.ts"), metadata: { type: "f", modifiedTime: 123, size: null } },
      { type: "change", filePath: path.resolve(projectRoot, "../shared/link.ts"), metadata: { type: "l", modifiedTime: 123, size: null } },
      { type: "delete", filePath: path.resolve(projectRoot, "old.ts"), metadata: { type: "f", modifiedTime: 123, size: null } },
      { type: "add", filePath: path.resolve(projectRoot, "src/new"), metadata: { type: "d", modifiedTime: null, size: null } },
      { type: "delete", filePath: path.resolve(projectRoot, "old"), metadata: { type: "d", modifiedTime: null, size: null } },
    ]);
    const legacyEvents = [{ type: "add", filePath: path.join(projectRoot, "legacy.ts") }];
    runner.watcher.emit("change", { eventsQueue: legacyEvents });
    expect(callback.mock.calls[1][0]).toBe(legacyEvents);
    off();
    off();
    expect(runner.watcher.listenerCount("change")).toBe(0);
    runner.server.emit("close");
  });

  test("route/type-generation watcher retains extension, declaration, and event-type filtering", () => {
    const runner = createRunner();
    const callback = jest.fn();
    loadWatchers("metroWatchTypeScriptFiles.js").metroWatchTypeScriptFiles({
      ...runner, projectRoot, callback, tsconfig: true, eventTypes: ["change", "delete"],
    });
    runner.watcher.emit("change", changeEvent({
      addedFiles: [fileChange("excluded.ts")],
      modifiedFiles: [
        fileChange("node_modules/vendor.ts"), fileChange("types.d.ts"),
        fileChange("readme.md"), fileChange("screen.tsx"), fileChange("tsconfig.json"),
      ],
      removedFiles: [fileChange("removed.ts")], addedDirectories: ["directory.ts"],
    }));
    expect(callback.mock.calls.map(([event]) => [event.type, event.filePath])).toEqual([
      ["change", path.join(projectRoot, "screen.tsx")],
      ["change", path.join(projectRoot, "tsconfig.json")],
      ["delete", path.join(projectRoot, "removed.ts")],
    ]);
    runner.server.emit("close");
    expect(runner.watcher.listenerCount("change")).toBe(0);
    expect(runner.watcher.listenerCount("add")).toBe(0);
  });

  test("route/type-generation watcher retains throttling and legacy event support", () => {
    const runner = createRunner();
    const callback = jest.fn();
    const off = loadWatchers("metroWatchTypeScriptFiles.js").metroWatchTypeScriptFiles({
      ...runner, projectRoot, callback, throttle: true,
    });
    runner.watcher.emit("change", changeEvent({ addedFiles: [fileChange("first.ts"), fileChange("second.ts")] }));
    expect(callback).toHaveBeenCalledTimes(1);
    const event = { type: "add", filePath: path.join(projectRoot, "legacy.ts"), metadata: { type: "f" } };
    runner.watcher.emit("add", { eventsQueue: [event] });
    expect(callback).toHaveBeenLastCalledWith(event);
    off();
    runner.server.emit("close");
    expect(runner.watcher.listenerCount("add")).toBe(0);
  });

  test("empty changes remain valid and unknown event shapes fail clearly instead of silently dropping changes", () => {
    const runner = createRunner();
    const callback = jest.fn();
    loadWatchers().observeAnyFileChanges(runner, callback);
    runner.watcher.emit("change", changeEvent());
    expect(callback).toHaveBeenCalledWith([]);
    expect(() => runner.watcher.emit("change", {})).toThrow("Unsupported Metro watcher event");
    expect(() => runner.watcher.emit("change", { rootDir: projectRoot, changes: {} }))
      .toThrow("Unsupported Metro file changes");
    runner.server.emit("close");
  });
});
