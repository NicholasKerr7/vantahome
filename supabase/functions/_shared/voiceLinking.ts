import { RequestValidationError } from "./validation.ts";

const oauthQueryFields = ["client_id", "redirect_uri", "response_type", "state", "format"];

export function validateAuthorizationQuery(params: URLSearchParams) {
  for (const field of oauthQueryFields) {
    if (params.getAll(field).length > 1) {
      throw new RequestValidationError("Duplicate OAuth parameter.");
    }
  }
  if (params.has("format") && params.get("format") !== "json") {
    throw new RequestValidationError("Unsupported response format.");
  }
}

// OAuth bindings are opaque. Trimming a redirect or state changes the request
// that was validated and can break the provider's state verification.
export function exactOAuthString(value: unknown, maxLength: number, required = true): string {
  if (typeof value !== "string" || value.length > maxLength || (required && !value)) {
    throw new RequestValidationError("Invalid OAuth parameter.");
  }
  return value;
}

export function isCanonicalVoiceRedirect(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !value.includes("#") && url.toString() === value;
  } catch {
    return false;
  }
}

export function resolveVoiceLinkingOrigin(requestOrigin: string | null, configured: string | undefined):
  { allowed: true; origin: string } | { allowed: false; status: 403 | 503 } {
  try {
    if (!configured) return { allowed: false, status: 503 };
    const url = new URL(configured);
    const host = url.hostname.replace(/\.$/, "");
    const loopback = host === "localhost" || host.endsWith(".localhost") ||
      /^127\./.test(host) || ["[::1]", "[::]", "0.0.0.0"].includes(host);
    if (url.protocol !== "https:" || configured !== url.origin || loopback) {
      return { allowed: false, status: 503 };
    }
    if (requestOrigin !== configured) return { allowed: false, status: 403 };
    return { allowed: true, origin: configured };
  } catch {
    return { allowed: false, status: 503 };
  }
}

export function voiceLinkingHeaders(extra: HeadersInit, allowedOrigin: string | null) {
  const headers = new Headers(extra);
  // Shared rate-limit responses carry wildcard CORS. Never inherit it into
  // the opt-in password-bearing browser API, including its failure paths.
  for (const key of [...headers.keys()]) {
    if (key.startsWith("access-control-")) headers.delete(key);
  }
  const vary = new Set((headers.get("Vary") ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  vary.add("Origin");
  headers.set("Vary", [...vary].join(", "));
  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Access-Control-Expose-Headers", "x-request-id, x-ratelimit-remaining, retry-after");
  }
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  return headers;
}

export function isVoiceLinkingPreflightAllowed(request: Request) {
  const method = request.headers.get("access-control-request-method");
  const requestedHeaders = request.headers.get("access-control-request-headers");
  return (method === "GET" || method === "POST") &&
    (requestedHeaders === null || requestedHeaders.split(",").every((header) => header.trim().toLowerCase() === "content-type"));
}
