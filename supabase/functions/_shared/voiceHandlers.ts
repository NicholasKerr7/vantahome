import { findToken, getVoiceClient, isExpired } from "./voiceAuth.ts";

type VoiceIdentity = { userId: string; clientId: string };
type VoiceTokenAuthentication =
  | { identity: VoiceIdentity; error: null }
  | {
    identity: null;
    error: "INVALID_AUTHORIZATION_CREDENTIAL" | "EXPIRED_AUTHORIZATION_CREDENTIAL";
  };

export async function getVoiceTokenAuthentication(
  token: unknown,
  expectedProvider: "alexa" | "google",
  options: { distinguishExpired?: boolean; throwOnStorageError?: boolean } = {},
): Promise<VoiceTokenAuthentication> {
  const invalid: VoiceTokenAuthentication = {
    identity: null,
    error: "INVALID_AUTHORIZATION_CREDENTIAL",
  };
  if (typeof token !== "string" || !/^[0-9a-f]{48}$/i.test(token)) return invalid;
  const tokenRow = options.throwOnStorageError
    ? await findToken(token, { throwOnStorageError: true })
    : await findToken(token);
  if (!tokenRow) return invalid;
  const expired = isExpired(tokenRow.expires_at);
  if (expired && !options.distinguishExpired) return invalid;
  const client = options.throwOnStorageError
    ? await getVoiceClient(tokenRow.client_id, { throwOnStorageError: true })
    : await getVoiceClient(tokenRow.client_id);
  if (!client || client.provider !== expectedProvider) return invalid;
  // Only identify an expired Alexa credential after binding it to Alexa's
  // client. Other providers must not learn whether that credential expired.
  if (expired) return { identity: null, error: "EXPIRED_AUTHORIZATION_CREDENTIAL" };
  return {
    identity: { userId: tokenRow.user_id, clientId: tokenRow.client_id },
    error: null,
  };
}

export async function getVoiceIdentityFromToken(
  token: unknown,
  expectedProvider: "alexa" | "google",
) {
  return (await getVoiceTokenAuthentication(token, expectedProvider)).identity;
}

export async function getVoiceIdentity(
  req: Request,
  expectedProvider: "alexa" | "google",
) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return getVoiceIdentityFromToken(token, expectedProvider);
}

export async function getVoiceUserId(
  req: Request,
  expectedProvider: "alexa" | "google",
) {
  const identity = await getVoiceIdentity(req, expectedProvider);
  return identity?.userId ?? null;
}

export function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
