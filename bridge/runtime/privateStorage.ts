import { closeSync, constants, lstatSync, mkdirSync, openSync, type Stats } from "node:fs";
import { resolve } from "node:path";

/** A predictable code keeps private paths and SQLite diagnostics out of responses. */
export class BridgeStorageError extends Error {
  /** Publish a fixed failure category without retaining host paths or raw database errors. */
  constructor(readonly code: "storage_unavailable" | "invalid_journal" | "runtime_busy" | "scope_mismatch") {
    super(code);
    this.name = "BridgeStorageError";
  }
}

/** Require a private, owned directory; never silently chmod somebody else's files. */
export function preparePrivateDirectory(directory: string): string {
  const path = resolve(directory);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 ||
      (process.getuid && stat.uid !== process.getuid())) throw new BridgeStorageError("storage_unavailable");
  return path;
}

/** SQLite databases and sidecars must not be symlinks, shared files, or readable by others. */
export function verifyPrivateFile(path: string, create = false): void {
  if (create) {
    try { closeSync(openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)); }
    catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    }
  }
  let stat: Stats;
  try { stat = lstatSync(path); }
  catch (error) {
    if (!create && error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 ||
      (process.getuid && stat.uid !== process.getuid())) throw new BridgeStorageError("storage_unavailable");
}
