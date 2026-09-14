#!/usr/bin/env node

const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ORIGINAL_HASH = "caa3f2c8b45dfe1e91db22ae10743af68de8d96f26515132bb52485ec0f037fa";
const PATCHED_HASH = "fc1ca6e1961ba005e554b1bc0de932d6454bf59bfaea03d02c7261dbdcafcdbd";
const ORIGINAL_IMPORT = "const decodeComponent = require('decode-uri-component');";
const PATCHED_IMPORT = "const decodeComponent = require('decode-uri-component').default;";

function patchSource(source) {
  const digest = createHash("sha256").update(source).digest("hex");
  if (digest === PATCHED_HASH) return source;
  if (digest !== ORIGINAL_HASH) {
    throw new Error("Unexpected query-string source; review the compatibility patch before installing.");
  }
  // Only adapt the CJS import to the patched decoder's ESM default export.
  // Do not fork or alter the upstream decoder's security-sensitive algorithm.
  return source.replace(ORIGINAL_IMPORT, PATCHED_IMPORT);
}

function ensureCompatibility({ checkOnly = false } = {}) {
  const moduleRoot = path.resolve(__dirname, "../node_modules");
  const queryDirectory = path.join(moduleRoot, "query-string");
  const decoderDirectory = path.join(moduleRoot, "decode-uri-component");
  const queryPackage = JSON.parse(readFileSync(path.join(queryDirectory, "package.json"), "utf8"));
  const decoderPackage = JSON.parse(readFileSync(path.join(decoderDirectory, "package.json"), "utf8"));
  if (queryPackage.version !== "7.1.3" || decoderPackage.version !== "0.5.0") {
    throw new Error("Unexpected query-string/decoder versions; review the compatibility patch before upgrading.");
  }
  const filename = path.join(queryDirectory, "index.js");
  const source = readFileSync(filename, "utf8");
  const patched = patchSource(source);
  if (patched !== source) {
    if (checkOnly) {
      throw new Error("Query-string compatibility patch is missing. Run npm run postinstall.");
    }
    writeFileSync(filename, patched);
  }
}

if (require.main === module) {
  try {
    if (process.argv.slice(2).some((argument) => argument !== "--check")) {
      throw new Error("Usage: node scripts/patch-query-string.js [--check]");
    }
    ensureCompatibility({ checkOnly: process.argv.includes("--check") });
    console.log("Query-string 7 compatibility with the patched URI decoder verified.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { ensureCompatibility, patchSource, ORIGINAL_IMPORT, PATCHED_IMPORT };
