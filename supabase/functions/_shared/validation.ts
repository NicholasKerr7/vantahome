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

export function isSafeJson(value: unknown, depth = 0): boolean {
  if (depth > 5) return false;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.length <= 256 && value.every((item) => isSafeJson(item, depth + 1));
  }
  if (!isPlainObject(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 256 && entries.every(
    ([key, item]) =>
      !["__proto__", "constructor", "prototype"].includes(key) &&
      isSafeJson(item, depth + 1),
  );
}

export async function readJsonObject(
  request: Request,
  maxBytes = 32_768,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestValidationError("Request body is too large.");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new RequestValidationError("Request body is too large.");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new RequestValidationError("Invalid JSON body.");
  }
  if (!isPlainObject(value) || !isSafeJson(value)) {
    throw new RequestValidationError("Invalid request body.");
  }
  return value;
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
