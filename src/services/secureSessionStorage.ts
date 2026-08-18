import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const SECURE_CHUNK_BYTES = 1800;
const MAX_SECURE_CHUNKS = 128;
const MANIFEST_KIND = "vantahome.secure-store";
let generationCounter = 0;

type SecureManifest = {
  kind: typeof MANIFEST_KIND;
  version: 1;
  generation: string;
  chunks: number;
  length: number;
};

function utf8Bytes(character: string) {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

export function splitSecureValue(value: string) {
  if (value.length === 0) return [""];

  const chunks: string[] = [];
  let chunk = "";
  let chunkBytes = 0;

  for (const character of value) {
    const characterBytes = utf8Bytes(character);
    if (chunk && chunkBytes + characterBytes > SECURE_CHUNK_BYTES) {
      chunks.push(chunk);
      chunk = "";
      chunkBytes = 0;
    }
    chunk += character;
    chunkBytes += characterBytes;
  }
  chunks.push(chunk);

  if (chunks.length > MAX_SECURE_CHUNKS) {
    throw new Error("Secure session exceeds the supported storage size.");
  }
  return chunks;
}

function parseManifest(
  value: string | null,
): SecureManifest | null | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<SecureManifest>;
    if (parsed.kind !== MANIFEST_KIND) return undefined;
    if (
      parsed.version !== 1 ||
      typeof parsed.generation !== "string" ||
      !/^[a-z0-9-]+$/.test(parsed.generation) ||
      !Number.isInteger(parsed.chunks) ||
      (parsed.chunks ?? 0) < 1 ||
      (parsed.chunks ?? 0) > MAX_SECURE_CHUNKS ||
      !Number.isInteger(parsed.length) ||
      (parsed.length ?? -1) < 0
    ) {
      return null;
    }
    return parsed as SecureManifest;
  } catch {
    // A pre-chunking session is stored directly as the legacy string value.
    return undefined;
  }
}

function nextGeneration() {
  generationCounter = (generationCounter + 1) % Number.MAX_SAFE_INTEGER;
  // This identifier only prevents chunk-key collisions; it is not a secret.
  return `${Date.now().toString(36)}-${generationCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function chunkKey(key: string, generation: string, index: number) {
  return `${key}.__chunk.${generation}.${index}`;
}

async function deleteManifestChunks(key: string, manifest: SecureManifest) {
  await Promise.allSettled(
    Array.from({ length: manifest.chunks }, (_, index) =>
      SecureStore.deleteItemAsync(
        chunkKey(key, manifest.generation, index),
        secureOptions,
      ),
    ),
  );
}

/**
 * Supabase's storage contract backed by Keychain/Keystore on native devices.
 * Web retains AsyncStorage because SecureStore is not available there; web
 * sessions must therefore be treated as a lower-trust client surface.
 */
export const secureSessionStorage = {
  async getItem(key: string) {
    if (Platform.OS === "web") return AsyncStorage.getItem(key);
    const storedValue = await SecureStore.getItemAsync(key, secureOptions);
    const manifest = parseManifest(storedValue);
    if (manifest === undefined) return storedValue;
    if (manifest === null) return null;

    const chunks = await Promise.all(
      Array.from({ length: manifest.chunks }, (_, index) =>
        SecureStore.getItemAsync(
          chunkKey(key, manifest.generation, index),
          secureOptions,
        ),
      ),
    );
    if (chunks.some((chunk) => chunk === null)) return null;

    const value = chunks.join("");
    return value.length === manifest.length ? value : null;
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === "web") return AsyncStorage.setItem(key, value);

    const previousValue = await SecureStore.getItemAsync(key, secureOptions);
    const previousManifest = parseManifest(previousValue);
    const chunks = splitSecureValue(value);
    const generation = nextGeneration();
    const manifest: SecureManifest = {
      kind: MANIFEST_KIND,
      version: 1,
      generation,
      chunks: chunks.length,
      length: value.length,
    };
    const targetKeys = chunks.map((_, index) =>
      chunkKey(key, generation, index),
    );

    try {
      await Promise.all(
        chunks.map((chunk, index) =>
          SecureStore.setItemAsync(targetKeys[index], chunk, secureOptions),
        ),
      );
      // Committing the small manifest last keeps the previous session readable
      // if a chunk write is interrupted.
      await SecureStore.setItemAsync(
        key,
        JSON.stringify(manifest),
        secureOptions,
      );
    } catch (error) {
      await Promise.allSettled(
        targetKeys.map((targetKey) =>
          SecureStore.deleteItemAsync(targetKey, secureOptions),
        ),
      );
      throw error;
    }

    if (previousManifest) {
      await deleteManifestChunks(key, previousManifest);
    }
  },
  async removeItem(key: string) {
    if (Platform.OS === "web") return AsyncStorage.removeItem(key);
    const storedValue = await SecureStore.getItemAsync(key, secureOptions);
    const manifest = parseManifest(storedValue);

    // Remove the manifest first so a sign-out fails closed even if cleanup of
    // an encrypted orphan chunk is interrupted.
    await SecureStore.deleteItemAsync(key, secureOptions);
    if (manifest) await deleteManifestChunks(key, manifest);
  },
};
