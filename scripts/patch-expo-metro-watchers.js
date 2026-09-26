#!/usr/bin/env node

const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");

const PATCHES = {
  "waitForMetroToObserveTypeScriptFile.js": {
    originalHash: "aed7e130a2c8bb5e6bc4a89f525086c368a4ed73cf1c4d2dc1318ada8622c570",
    patchedHash: "a8c71c5b30ef896117c1df008db1a5507c61e0349c9e5b50d3e36fa288b94b3d",
    listeners: 3,
  },
  "metroWatchTypeScriptFiles.js": {
    originalHash: "219f8d99e0717a3884958045d1d5cba7f3e87efc935798e4685e522219d329ba",
    patchedHash: "e889cf0c5590022215fac2d77fb5719939a52a40372ba754cba2f5c575e87627",
    listeners: 1,
  },
};

const ORIGINAL_LISTENER = "const listener = ({ eventsQueue })=>{";
const PATCHED_LISTENER = "const listener = (event)=>{\n        const eventsQueue = getMetroWatchEvents(event);";

// Keep this generated helper literal stable: its exact bytes are included in
// the reviewed patched hashes, independently of Jest/Babel's own transforms.
const WATCH_EVENT_ADAPTER = `
/** Adapt Metro 0.83.8 change batches to Expo SDK 54's legacy watcher contract. */
function getMetroWatchEvents(event) {
    if (Array.isArray(event?.eventsQueue)) return event.eventsQueue;
    const { changes, rootDir } = event ?? {};
    if (!changes || typeof rootDir !== 'string') {
        throw new Error('Unsupported Metro watcher event; review Expo compatibility.');
    }
    const events = [];
    const resolve = require('path').resolve;
    for (const [collection, type] of [
        ['addedFiles', 'add'], ['modifiedFiles', 'change'], ['removedFiles', 'delete']
    ]) {
        const entries = changes[collection];
        if (!entries || typeof entries[Symbol.iterator] !== 'function') {
            throw new Error('Unsupported Metro file changes; review Expo compatibility.');
        }
        for (const [filePath, metadata] of entries) {
            events.push({
                type,
                filePath: resolve(rootDir, filePath),
                metadata: {
                    type: metadata?.isSymlink ? 'l' : 'f',
                    modifiedTime: metadata?.modifiedTime ?? null,
                    size: null
                }
            });
        }
    }
    for (const [collection, type] of [
        ['addedDirectories', 'add'], ['removedDirectories', 'delete']
    ]) {
        const entries = changes[collection];
        if (!entries || typeof entries[Symbol.iterator] !== 'function') {
            throw new Error('Unsupported Metro directory changes; review Expo compatibility.');
        }
        for (const filePath of entries) {
            events.push({
                type,
                filePath: resolve(rootDir, filePath),
                metadata: { type: 'd', modifiedTime: null, size: null }
            });
        }
    }
    return events;
}
`;

/** Adapt only the two reviewed CLI sources, preserving their watcher logic. */
function patchSource(filename, source) {
  const patch = PATCHES[filename];
  if (!patch) throw new Error("Unknown Expo watcher compatibility target.");
  const digest = createHash("sha256").update(source).digest("hex");
  if (digest === patch.patchedHash) return source;
  if (digest !== patch.originalHash || source.split(ORIGINAL_LISTENER).length - 1 !== patch.listeners) {
    throw new Error("Unexpected Expo watcher source; review the compatibility patch before installing.");
  }
  const patched = source
    .replace('"use strict";', `"use strict";${WATCH_EVENT_ADAPTER}`)
    .replaceAll(ORIGINAL_LISTENER, PATCHED_LISTENER);
  if (createHash("sha256").update(patched).digest("hex") !== patch.patchedHash) {
    throw new Error("Unexpected Expo watcher patch output; review its source hashes.");
  }
  return patched;
}

/** Resolve Expo's actual CLI and Metro wrapper even when npm nests dependencies. */
function resolveCompatibilityTargets() {
  const projectRequire = createRequire(path.resolve(__dirname, "../package.json"));
  const expoRequire = createRequire(projectRequire.resolve("expo/package.json"));
  const cliPackage = expoRequire.resolve("@expo/cli/package.json");
  const cliRequire = createRequire(cliPackage);
  const metroRequire = createRequire(cliRequire.resolve("@expo/metro/package.json"));
  if (
    JSON.parse(readFileSync(cliPackage, "utf8")).version !== "54.0.27" ||
    metroRequire("metro-file-map/package.json").version !== "0.83.8"
  ) {
    throw new Error("Unexpected Expo CLI/Metro versions; review the watcher compatibility patch before upgrading.");
  }
  return path.join(path.dirname(cliPackage), "build/src/start/server/metro");
}

/** Check every source before writing so unknown dependencies never receive a partial patch. */
function ensureCompatibility({ checkOnly = false } = {}) {
  const directory = resolveCompatibilityTargets();
  const updates = Object.keys(PATCHES).map((name) => {
    const filename = path.join(directory, name);
    const source = readFileSync(filename, "utf8");
    return { filename, source, patched: patchSource(name, source) };
  });
  const missing = updates.filter(({ source, patched }) => source !== patched);
  if (checkOnly && missing.length > 0) {
    throw new Error("Expo watcher compatibility patch is missing. Run npm run postinstall.");
  }
  for (const { filename, patched } of missing) writeFileSync(filename, patched);
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some((argument) => argument !== "--check")) {
      throw new Error("Usage: node scripts/patch-expo-metro-watchers.js [--check]");
    }
    ensureCompatibility({ checkOnly: args.includes("--check") });
    console.log("Expo SDK 54 watcher compatibility with patched Metro verified.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  ensureCompatibility, patchSource, resolveCompatibilityTargets, PATCHES,
  ORIGINAL_LISTENER, PATCHED_LISTENER, WATCH_EVENT_ADAPTER,
};
