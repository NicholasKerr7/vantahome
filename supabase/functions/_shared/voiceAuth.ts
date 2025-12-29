import { getSupabaseAdmin } from './supabaseAdmin.ts';

export type VoiceClient = {
  id: string;
  name: string;
  provider: 'alexa' | 'google';
  client_secret_hash: string;
  redirect_uris: string[];
};

export type VoiceToken = {
  access_token: string;
  refresh_token: string | null;
  client_id: string;
  user_id: string;
  expires_at: string;
};

export function randomToken(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashSecret(secret: string) {
  const data = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function getVoiceClient(clientId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('voice_oauth_clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle();
  if (error || !data) return null;
  return data as VoiceClient;
}

export async function verifyClientSecret(client: VoiceClient, secret: string) {
  const hashed = await hashSecret(secret);
  return hashed === client.client_secret_hash;
}

export async function findToken(accessToken: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('voice_oauth_tokens')
    .select('*')
    .eq('access_token', accessToken)
    .maybeSingle();
  if (error || !data) return null;
  return data as VoiceToken;
}

export function isExpired(expiresAt: string) {
  return new Date(expiresAt).getTime() <= Date.now();
}
