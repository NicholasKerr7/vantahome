function isIpv4(value: string) {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every(
      (part) => /^\d{1,3}$/.test(part) && Number(part) <= 255,
    )
  );
}

function isIpv6(value: string) {
  if (!value.includes(":")) return false;
  if (!/^[0-9a-f:.]+$/i.test(value)) return false;
  const halves = value.split("::");
  if (halves.length > 2) return false;
  const groups = value.split(":").filter(Boolean);
  return groups.length <= 8 && groups.every((group) => group.length <= 4);
}

export function normalizeIp(value: string) {
  const trimmed = value.trim().replace(/^\[|\]$/g, "").toLowerCase();
  if (isIpv4(trimmed) || isIpv6(trimmed)) return trimmed;
  return null;
}

export function resolveTrustedClientIp(
  headers: Headers,
  trustedProxyHops: number,
) {
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 1) return null;
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const chain = forwarded.split(",").map(normalizeIp);
  if (chain.some((item) => item === null) || chain.length < trustedProxyHops) {
    return null;
  }
  return chain[chain.length - trustedProxyHops];
}

export async function hashRateLimitIdentity(identity: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(identity),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
