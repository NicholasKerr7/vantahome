const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isSafeJson(value: unknown, depth = 0, maxDepth = 5): boolean {
  if (depth > maxDepth) return false;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.length <= 256 && value.every((item) => isSafeJson(item, depth + 1, maxDepth));
  }
  if (!isPlainObject(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 256 && entries.every(
    ([key, item]) =>
      !["__proto__", "constructor", "prototype"].includes(key) &&
      isSafeJson(item, depth + 1, maxDepth),
  );
}

async function readBoundedText(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await request.body?.cancel().catch(() => undefined);
    throw new RequestValidationError("Request body is too large.");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let receivedBytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      // Enforce the actual stream size, including missing or false length headers,
      // before decoding or retaining the chunk that crosses the boundary.
      if (receivedBytes > maxBytes) {
        throw new RequestValidationError("Request body is too large.");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof RequestValidationError) throw error;
    throw new RequestValidationError("Unable to read request body.");
  } finally {
    reader.releaseLock();
  }
}

export async function readJsonObject(
  request: Request,
  maxBytes = 32_768,
  maxDepth = 5,
): Promise<Record<string, unknown>> {
  const raw = await readBoundedText(request, maxBytes);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new RequestValidationError("Invalid JSON body.");
  }
  if (!isPlainObject(value) || !isSafeJson(value, 0, maxDepth)) {
    throw new RequestValidationError("Invalid request body.");
  }
  return value;
}

export async function readFormObject(
  request: Request,
  maxBytes = 8_192,
  maxFields = 16,
): Promise<Record<string, string>> {
  const raw = await readBoundedText(request, maxBytes);

  const params = new URLSearchParams(raw);
  const entries: Record<string, string> = {};
  let fieldCount = 0;
  for (const [key, value] of params.entries()) {
    fieldCount += 1;
    if (
      fieldCount > maxFields ||
      key.length > 64 ||
      ["__proto__", "constructor", "prototype"].includes(key) ||
      Object.prototype.hasOwnProperty.call(entries, key)
    ) {
      throw new RequestValidationError("Invalid form body.");
    }
    entries[key] = value;
  }
  return entries;
}

export function boundedString(
  value: unknown,
  field: string,
  maxLength: number,
  required = true,
) {
  if (typeof value !== "string") {
    if (!required) return "";
    throw new RequestValidationError(`${field} is required.`);
  }
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maxLength) {
    throw new RequestValidationError(`${field} is invalid.`);
  }
  return normalized;
}
