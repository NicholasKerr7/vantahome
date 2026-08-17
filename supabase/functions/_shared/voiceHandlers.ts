import { findToken, getVoiceClient, isExpired } from "./voiceAuth.ts";

export async function getVoiceUserId(
  req: Request,
  expectedProvider: "alexa" | "google",
) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!/^[0-9a-f]{48}$/i.test(token)) return null;
  const tokenRow = await findToken(token);
  if (!tokenRow) return null;
  if (isExpired(tokenRow.expires_at)) return null;
  const client = await getVoiceClient(tokenRow.client_id);
  if (!client || client.provider !== expectedProvider) return null;
  return tokenRow.user_id;
}

export function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
