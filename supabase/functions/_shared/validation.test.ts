import {
  boundedString,
  isSafeJson,
  readFormObject,
  readJsonObject,
  RequestValidationError,
} from "./validation";

function requestWithBody(body: string, contentLength?: number) {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-length" && contentLength !== undefined
          ? String(contentLength)
          : null,
    },
    text: async () => body,
  } as Request;
}

describe("edge request validation", () => {
  test("accepts bounded plain JSON", async () => {
    await expect(
      readJsonObject(requestWithBody('{"deviceId":"safe"}'), 128),
    ).resolves.toEqual({ deviceId: "safe" });
  });

  test("rejects oversized and prototype-bearing JSON", async () => {
    await expect(
      readJsonObject(requestWithBody('{"ok":true}', 4_096), 128),
    ).rejects.toBeInstanceOf(RequestValidationError);
    expect(isSafeJson(JSON.parse('{"__proto__":"polluted"}'))).toBe(false);
  });

  test("rejects duplicate or excessive form fields", async () => {
    await expect(
      readFormObject(requestWithBody("code=one&code=two")),
    ).rejects.toBeInstanceOf(RequestValidationError);
    await expect(
      readFormObject(requestWithBody("a=1&b=2"), 128, 1),
    ).rejects.toBeInstanceOf(RequestValidationError);
  });

  test("normalizes bounded strings", () => {
    expect(boundedString("  Vanta Home  ", "name", 32)).toBe("Vanta Home");
    expect(() => boundedString("", "name", 32)).toThrow(
      RequestValidationError,
    );
  });
});
