import {
  boundedString,
  isSafeJson,
  readFormObject,
  readJsonObject,
  RequestValidationError,
} from "./validation";

function requestWithBody(body: string, contentLength?: number) {
  return new Request("https://edge.example.test", {
    method: "POST",
    headers: contentLength === undefined ? {} : { "Content-Length": String(contentLength) },
    body,
  });
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

  test.each(["__proto__", "constructor", "prototype"])("rejects unsafe form key %s", async (key) => {
    await expect(readFormObject(requestWithBody(`${key}=value`)))
      .rejects.toBeInstanceOf(RequestValidationError);
  });

  test.each([
    ["JSON", readJsonObject],
    ["form", readFormObject],
  ])("cancels an oversized %s stream with missing or false length headers", async (_name, read) => {
    for (const contentLength of [undefined, 1]) {
      let produced = 0;
      const cancel = jest.fn();
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          produced += 1;
          controller.enqueue(new TextEncoder().encode("x".repeat(64)));
          if (produced === 100) controller.close();
        },
        cancel,
      });
      const request = new Request("https://edge.example.test", {
        method: "POST", body: stream, duplex: "half",
        headers: contentLength === undefined ? {} : { "Content-Length": String(contentLength) },
      } as RequestInit);
      await expect(read(request, 128)).rejects.toBeInstanceOf(RequestValidationError);
      expect(produced).toBeLessThan(100);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(stream.locked).toBe(false);
    }
  });

  test("counts UTF-8 bytes and accepts multibyte characters split between chunks", async () => {
    const raw = '{"name":"é"}';
    const bytes = new TextEncoder().encode(raw);
    await expect(readJsonObject(requestWithBody(raw), bytes.length - 1))
      .rejects.toBeInstanceOf(RequestValidationError);
    let index = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index === bytes.length) controller.close();
        else controller.enqueue(bytes.slice(index, ++index));
      },
    });
    await expect(readJsonObject(new Request("https://edge.example.test", {
      method: "POST", body, duplex: "half",
    } as RequestInit), bytes.length)).resolves.toEqual({ name: "é" });
  });

  test("retains default nesting and per-container limits", async () => {
    let nested: unknown = true;
    for (let depth = 0; depth < 7; depth += 1) nested = { child: nested };
    await expect(readJsonObject(requestWithBody(JSON.stringify(nested))))
      .rejects.toBeInstanceOf(RequestValidationError);
    expect(isSafeJson({ values: Array(257).fill(0) }, 0, 10)).toBe(false);
    expect(isSafeJson(JSON.parse('{"safe":{"constructor":{}}}'), 0, 10)).toBe(false);
    expect(isSafeJson({ value: Infinity }, 0, 10)).toBe(false);
  });

  test("normalizes bounded strings", () => {
    expect(boundedString("  Vanta Home  ", "name", 32)).toBe("Vanta Home");
    expect(() => boundedString("", "name", 32)).toThrow(
      RequestValidationError,
    );
  });
});
