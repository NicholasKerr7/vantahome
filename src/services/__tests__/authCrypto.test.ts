import { ensureSecureAuthCrypto } from "../authCrypto";
import * as ExpoCrypto from "expo-crypto";
import {
  generatePKCEChallenge,
  getCodeChallengeAndMethod,
} from "@supabase/auth-js/dist/main/lib/helpers";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  getRandomValues: jest.fn((values: Uint32Array) =>
    require("crypto").randomFillSync(values),
  ),
  digest: jest.fn(
    async (_algorithm: string, input: ArrayBuffer | Uint8Array) => {
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
      const result = require("crypto")
        .createHash("sha256")
        .update(Buffer.from(bytes))
        .digest();
      return new Uint8Array(result).buffer;
    },
  ),
}));

let originalCrypto: PropertyDescriptor | undefined;
beforeEach(() => {
  originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    value: undefined,
    configurable: true,
  });
  jest.clearAllMocks();
});
afterEach(() => {
  if (originalCrypto)
    Object.defineProperty(globalThis, "crypto", originalCrypto);
  else Reflect.deleteProperty(globalThis, "crypto");
  jest.restoreAllMocks();
});

test("the actual auth SDK uses native random values and S256 without Math.random", async () => {
  ensureSecureAuthCrypto();
  jest.spyOn(Math, "random").mockImplementation(() => {
    throw new Error("Insecure random fallback");
  });
  const storage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  };
  const [challenge, method] = await getCodeChallengeAndMethod(
    storage,
    "test-pkce",
  );
  expect(ExpoCrypto.getRandomValues).toHaveBeenCalledTimes(1);
  expect(ExpoCrypto.digest).toHaveBeenCalledWith(
    "SHA-256",
    expect.any(Uint8Array),
  );
  expect(method).toBe("s256");
  expect(challenge).toHaveLength(43);
});

test("the native SHA-256 bridge matches the standard PKCE challenge vector", async () => {
  ensureSecureAuthCrypto();
  expect(
    await generatePKCEChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
  ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("missing native randomness fails closed instead of switching to plain PKCE", async () => {
  ensureSecureAuthCrypto();
  (ExpoCrypto.getRandomValues as jest.Mock).mockImplementationOnce(() => {
    throw new Error("Native randomness unavailable");
  });
  await expect(
    getCodeChallengeAndMethod(
      { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
      "test-pkce",
    ),
  ).rejects.toThrow("Native randomness unavailable");
});

test("a complete existing WebCrypto implementation keeps its original receiver", async () => {
  const existing = require("crypto").webcrypto as Crypto;
  Object.defineProperty(globalThis, "crypto", {
    value: existing,
    configurable: true,
  });
  ensureSecureAuthCrypto();
  expect(globalThis.crypto).toBe(existing);
  expect(globalThis.crypto.randomUUID()).toMatch(/^[a-f0-9-]{36}$/);
  expect(
    await globalThis.crypto.subtle.digest("SHA-512", new Uint8Array([1])),
  ).toHaveProperty("byteLength", 64);
  expect(ExpoCrypto.getRandomValues).not.toHaveBeenCalled();
});
