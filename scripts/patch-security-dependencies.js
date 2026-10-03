#!/usr/bin/env node

const { createHash } = require("node:crypto");
const { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const patches = [require("./security-patches/braces"), require("./security-patches/node-forge")];

const PROJECT_ROOT = path.resolve(__dirname, "..");

/** Hash exact package bytes; never patch an unreviewed upstream variant. */
function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

/** Find every physical installed copy, including nested dependencies omitted from an audit graph. */
function installedCopies(root, names) {
  const found = new Map(names.map((name) => [name, []]));
  const modules = [path.join(root, "node_modules")];
  while (modules.length) {
    const directory = modules.pop();
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const candidates = entry.name.startsWith("@") && entry.isDirectory()
        ? readdirSync(path.join(directory, entry.name)).map((name) => path.join(directory, entry.name, name))
        : [path.join(directory, entry.name)];
      for (const candidate of candidates) {
        const packageName = candidate.slice(directory.length + 1).split(path.sep).join("/");
        const stat = lstatSync(candidate);
        // Workspace links are not dependencies to traverse. Reviewed patch targets must be real directories.
        if (stat.isSymbolicLink()) {
          if (found.has(packageName)) throw new Error(`Linked security dependency is not supported: ${packageName}`);
          continue;
        }
        if (!stat.isDirectory()) continue;
        if (found.has(packageName)) found.get(packageName).push(path.relative(root, candidate).split(path.sep).join("/"));
        modules.push(path.join(candidate, "node_modules"));
      }
    }
  }
  return found;
}

/** Validate the lockfile and all copies before writing; checks cannot silently install a missing patch. */
function ensureSecurityPatches({ root = PROJECT_ROOT, checkOnly = false } = {}) {
  const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8"));
  if (lock.lockfileVersion !== 3 || !lock.packages) throw new Error("Unsupported lockfile for security patches.");
  const installed = installedCopies(root, patches.map((patch) => patch.name));
  const updates = [];
  const verified = [];
  for (const patch of patches) {
    const nodes = Object.keys(lock.packages).filter((name) => name.endsWith(`node_modules/${patch.name}`)).sort();
    const copies = installed.get(patch.name).sort();
    if (!nodes.length || JSON.stringify(nodes) !== JSON.stringify(copies)) {
      throw new Error(`Installed ${patch.name} copies do not match the lockfile; reinstall and review dependency changes.`);
    }
    for (const node of nodes) {
      const directory = path.resolve(root, node);
      if (!directory.startsWith(path.resolve(root) + path.sep)) throw new Error("Invalid dependency location in lockfile.");
      const metadata = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
      if (metadata.name !== patch.name || metadata.version !== patch.version || lock.packages[node].version !== patch.version) {
        throw new Error(`Unexpected ${patch.name} version; review its security patch before upgrading.`);
      }
      for (const file of patch.files) {
        const filename = path.join(directory, file.path);
        if (lstatSync(filename).isSymbolicLink()) throw new Error(`Linked security source is not supported: ${node}/${file.path}`);
        const source = readFileSync(filename, "utf8");
        const hash = sha256(source);
        if (hash === file.patchedHash) continue;
        if (hash !== file.originalHash) throw new Error(`Unexpected security source: ${node}/${file.path}`);
        const patched = file.patch(source);
        if (sha256(patched) !== file.patchedHash) throw new Error(`Security patch output mismatch: ${node}/${file.path}`);
        updates.push({ filename, patched });
      }
    }
    verified.push({ name: patch.name, version: patch.version, advisory: patch.advisory, nodes });
  }
  if (checkOnly && updates.length) throw new Error("Security source patches are missing. Run npm run patch:dependencies.");
  for (const update of updates) writeFileSync(update.filename, update.patched);
  return verified;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some((arg) => arg !== "--check")) throw new Error("Usage: node scripts/patch-security-dependencies.js [--check]");
    const verified = ensureSecurityPatches({ checkOnly: args.includes("--check") });
    for (const item of verified) console.log(`Verified local security patch: ${item.name}@${item.version} (${item.nodes.length} installed copies).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { ensureSecurityPatches, installedCopies, sha256 };
