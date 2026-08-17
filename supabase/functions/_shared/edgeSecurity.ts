import { getSupabaseAdmin } from "./supabaseAdmin.ts";
import {
  hashRateLimitIdentity,
  resolveTrustedClientIp,
} from "./edgeSecurityCore.ts";

export type EdgeRequestContext = {
  endpoint: string;
  requestId: string;
  method: string;
  startedAt: number;
  clientIp: string | null;
};

export type RateLimitPolicy = {
  maxRequests: number;
  windowSeconds: number;
  actorId?: string;
  requireClientIp?: boolean;
  includeClientIp?: boolean;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  reason?: "missing_client_ip" | "missing_secret" | "storage_error";
};

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function createEdgeRequestContext(
  request: Request,
  endpoint: string,
): EdgeRequestContext {
  const configuredHops = Number(Deno.env.get("TRUSTED_PROXY_HOPS") ?? "0");
  const suppliedRequestId = request.headers.get("x-request-id") ?? "";
  return {
    endpoint,
    requestId: REQUEST_ID_PATTERN.test(suppliedRequestId)
      ? suppliedRequestId
      : crypto.randomUUID(),
    method: request.method,
    startedAt: Date.now(),
    clientIp: resolveTrustedClientIp(request.headers, configuredHops),
  };
}

export async function enforceEdgeRateLimit(
  context: EdgeRequestContext,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const secret = Deno.env.get("RATE_LIMIT_HASH_SECRET") ?? "";
  if (secret.length < 32) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 0,
      reason: "missing_secret",
    };
  }
  if (policy.requireClientIp && !context.clientIp) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 0,
      reason: "missing_client_ip",
    };
  }

  const identities = [
    ...(context.clientIp && policy.includeClientIp !== false
      ? [`ip:${context.clientIp}`]
      : []),
    ...(policy.actorId ? [`actor:${policy.actorId}`] : []),
  ];
  if (!identities.length) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 0,
      reason: "missing_client_ip",
    };
  }

  try {
    const admin = getSupabaseAdmin();
    let remaining = policy.maxRequests;
    let retryAfterSeconds = 0;
    for (const identity of identities) {
      const keyHash = await hashRateLimitIdentity(identity, secret);
      const { data, error } = await admin.rpc("consume_edge_rate_limit", {
        limit_endpoint: context.endpoint,
        limit_key_hash: keyHash,
        limit_max_requests: policy.maxRequests,
        limit_window_seconds: policy.windowSeconds,
      });
      if (error || !data?.[0]) {
        throw error ?? new Error("Missing rate-limit result");
      }
      remaining = Math.min(remaining, data[0].remaining);
      retryAfterSeconds = Math.max(retryAfterSeconds, data[0].retry_after_seconds);
      if (!data[0].allowed) {
        return { allowed: false, remaining, retryAfterSeconds };
      }
    }
    return { allowed: true, remaining, retryAfterSeconds };
  } catch {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 0,
      reason: "storage_error",
    };
  }
}

export function finalizeEdgeResponse(
  context: EdgeRequestContext,
  response: Response,
  outcome: string,
  rateLimit?: RateLimitResult,
) {
  response.headers.set("x-request-id", context.requestId);
  if (rateLimit) {
    response.headers.set("x-ratelimit-remaining", String(rateLimit.remaining));
    if (rateLimit.retryAfterSeconds > 0) {
      response.headers.set("retry-after", String(rateLimit.retryAfterSeconds));
    }
  }
  console.log(
    JSON.stringify({
      type: "edge_operation",
      endpoint: context.endpoint,
      requestId: context.requestId,
      method: context.method,
      status: response.status,
      outcome,
      durationMs: Date.now() - context.startedAt,
      region: Deno.env.get("DENO_REGION") ?? "local",
      clientIpResolved: context.clientIp !== null,
      rateLimitReason: rateLimit?.reason ?? null,
    }),
  );
  return response;
}

export function rateLimitResponse(
  context: EdgeRequestContext,
  result: RateLimitResult,
) {
  const misconfigured = result.reason !== undefined;
  return finalizeEdgeResponse(
    context,
    new Response(
      JSON.stringify({
        error: misconfigured
          ? "Abuse protection unavailable."
          : "Too many requests.",
      }),
      {
        status: misconfigured ? 503 : 429,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      },
    ),
    misconfigured ? "rate_limit_unavailable" : "rate_limited",
    result,
  );
}
