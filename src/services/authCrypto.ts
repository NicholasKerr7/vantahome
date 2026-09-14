import { Platform } from "react-native";
import * as ExpoCrypto from "expo-crypto";

/** Supply only the native WebCrypto operations required by the auth SDK. */
export function ensureSecureAuthCrypto() {
  if (Platform.OS !== "web") {
    const existing = globalThis.crypto;
    const nativeCrypto = existing ?? ({} as Crypto);
    // Do not use getRandomBytes: its development debugger fallback is not a CSPRNG.
    if (typeof nativeCrypto.getRandomValues !== "function")
      Object.defineProperty(nativeCrypto, "getRandomValues", {
        value: (values: Parameters<typeof ExpoCrypto.getRandomValues>[0]) =>
          ExpoCrypto.getRandomValues(values),
      });
    const subtle = existing?.subtle ?? ({} as SubtleCrypto);
    if (typeof subtle.digest !== "function")
      Object.defineProperty(subtle, "digest", {
        value: (algorithm: AlgorithmIdentifier, input: BufferSource) => {
          const name =
            typeof algorithm === "string" ? algorithm : algorithm.name;
          if (name.toUpperCase() !== "SHA-256") {
            throw new Error("Unsupported authentication digest.");
          }
          return ExpoCrypto.digest(
            ExpoCrypto.CryptoDigestAlgorithm.SHA256,
            input,
          );
        },
      });
    if (!nativeCrypto.subtle)
      Object.defineProperty(nativeCrypto, "subtle", { value: subtle });
    if (!existing)
      Object.defineProperty(globalThis, "crypto", {
        value: nativeCrypto,
        configurable: true,
      });
  }
  // Supabase otherwise silently falls back to a plain PKCE challenge.
  if (
    typeof globalThis.crypto?.getRandomValues !== "function" ||
    typeof globalThis.crypto?.subtle?.digest !== "function" ||
    typeof TextEncoder === "undefined" ||
    typeof btoa !== "function"
  ) {
    throw new Error("Secure sign-in is unavailable in this runtime.");
  }
}
