import { findToken, isExpired } from './voiceAuth.ts';

export async function getVoiceUserId(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const tokenRow = await findToken(token);
  if (!tokenRow) return null;
  if (isExpired(tokenRow.expires_at)) return null;
  return tokenRow.user_id;
}

export function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
