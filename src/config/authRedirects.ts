import { Platform } from "react-native";
import * as AuthSession from "expo-auth-session";

export const APP_SCHEME = "vantahome";
export const AUTH_CALLBACK_PATH = "auth-callback";
export const VOICE_LINK_PATH = "voice-link";
export const NATIVE_AUTH_CALLBACK_URI = "vantahome://auth-callback";
export const NATIVE_VOICE_LINK_URI = "vantahome://voice-link";

function makeAppRedirectUri(path: string, native: string) {
  if (Platform.OS !== "web") return native;
  return AuthSession.makeRedirectUri({
    scheme: APP_SCHEME,
    path,
  });
}

export function makeAuthCallbackUri() {
  return makeAppRedirectUri(AUTH_CALLBACK_PATH, NATIVE_AUTH_CALLBACK_URI);
}

export function makeVoiceLinkUri() {
  return makeAppRedirectUri(VOICE_LINK_PATH, NATIVE_VOICE_LINK_URI);
}

export function getAuthRedirectParams(url: string) {
  try {
    if (!isAuthCallbackUrl(url)) return null;
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.search);
    if (parsed.hash) {
      const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
      for (const [key, value] of hashParams) {
        if (params.has(key)) return null;
        params.append(key, value);
      }
    }
    const names = Array.from(params.keys());
    if (new Set(names).size !== names.length) return null;
    return params;
  } catch {
    return null;
  }
}

export function isAuthCallbackUrl(url: string) {
  try {
    const parsed = new URL(url);
    const expected = new URL(makeAuthCallbackUri());
    return (
      parsed.protocol === expected.protocol &&
      parsed.hostname === expected.hostname &&
      parsed.port === expected.port &&
      parsed.pathname === expected.pathname &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}
