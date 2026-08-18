const mockSecureValues = new Map<string, string>();
const mockGetItemAsync = jest.fn(async (key: string) =>
  mockSecureValues.get(key) ?? null,
);
const mockSetItemAsync = jest.fn(async (key: string, value: string) => {
  mockSecureValues.set(key, value);
});
const mockDeleteItemAsync = jest.fn(async (key: string) => {
  mockSecureValues.delete(key);
});

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "after-first-unlock-this-device-only",
  getItemAsync: (key: string) => mockGetItemAsync(key),
  setItemAsync: (key: string, value: string) =>
    mockSetItemAsync(key, value),
  deleteItemAsync: (key: string) => mockDeleteItemAsync(key),
}));

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import {
  secureSessionStorage,
  splitSecureValue,
} from "../secureSessionStorage";

describe("secure session storage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSecureValues.clear();
  });

  test("round-trips a session without exceeding native value limits", async () => {
    const session = JSON.stringify({
      access_token: "a".repeat(4400),
      refresh_token: "r".repeat(1700),
    });

    await secureSessionStorage.setItem("auth-session", session);

    expect(await secureSessionStorage.getItem("auth-session")).toBe(session);
    for (const value of mockSecureValues.values()) {
      expect(Buffer.byteLength(value, "utf8")).toBeLessThanOrEqual(1800);
    }
    expect(mockSecureValues.get("auth-session")).toContain(
      '"kind":"vantahome.secure-store"',
    );
  });

  test("splits Unicode on code-point boundaries and preserves its bytes", () => {
    const value = `profile-${"🏠é東京".repeat(700)}`;
    const chunks = splitSecureValue(value);

    expect(chunks.join("")).toBe(value);
    expect(
      chunks.every((chunk) => Buffer.byteLength(chunk, "utf8") <= 1800),
    ).toBe(true);
  });

  test("reads a legacy unchunked session", async () => {
    mockSecureValues.set("auth-session", "legacy-session-json");

    expect(await secureSessionStorage.getItem("auth-session")).toBe(
      "legacy-session-json",
    );
  });

  test("rotates generations and removes the previous encrypted chunks", async () => {
    await secureSessionStorage.setItem("auth-session", "a".repeat(4000));
    const previousChunkKeys = [...mockSecureValues.keys()].filter((key) =>
      key.includes(".__chunk."),
    );

    await secureSessionStorage.setItem("auth-session", "b".repeat(4200));

    expect(await secureSessionStorage.getItem("auth-session")).toBe(
      "b".repeat(4200),
    );
    expect(
      previousChunkKeys.every((key) => !mockSecureValues.has(key)),
    ).toBe(true);
  });

  test("keeps the previous generation readable after an interrupted write", async () => {
    const previousSession = "a".repeat(4000);
    await secureSessionStorage.setItem("auth-session", previousSession);
    mockSetItemAsync.mockRejectedValueOnce(new Error("simulated write failure"));

    await expect(
      secureSessionStorage.setItem("auth-session", "b".repeat(4200)),
    ).rejects.toThrow("simulated write failure");

    expect(await secureSessionStorage.getItem("auth-session")).toBe(
      previousSession,
    );
  });

  test("fails closed when a committed chunk is missing", async () => {
    await secureSessionStorage.setItem("auth-session", "a".repeat(4000));
    const chunkKey = [...mockSecureValues.keys()].find((key) =>
      key.includes(".__chunk."),
    );
    expect(chunkKey).toBeDefined();
    mockSecureValues.delete(chunkKey!);

    expect(await secureSessionStorage.getItem("auth-session")).toBeNull();
  });

  test("fails closed when a chunk manifest is malformed", async () => {
    mockSecureValues.set(
      "auth-session",
      JSON.stringify({ kind: "vantahome.secure-store", version: 1 }),
    );

    expect(await secureSessionStorage.getItem("auth-session")).toBeNull();
  });

  test("removes both the manifest and its encrypted chunks", async () => {
    await secureSessionStorage.setItem("auth-session", "a".repeat(4000));

    await secureSessionStorage.removeItem("auth-session");

    expect(mockSecureValues.size).toBe(0);
  });
});
