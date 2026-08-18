import { Platform } from "react-native";
import * as AuthSession from "expo-auth-session";

export const APP_SCHEME = "vantahome";
export const AUTH_CALLBACK_PATH = "auth-callback";
export const VOICE_LINK_PATH = "voice-link";
export const NATIVE_AUTH_CALLBACK_URI = "vantahome://auth-callback";
export const NATIVE_VOICE_LINK_URI = "vantahome://voice-link";

function makeAppRedirectUri(path: string, native: string) {
  return AuthSession.makeRedirectUri({
    scheme: APP_SCHEME,
    path,
    // Existing native projects cannot reliably infer their production URI.
    ...(Platform.OS === "web" ? {} : { native }),
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
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.search);
    if (parsed.hash) {
      const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
      hashParams.forEach((value, key) => params.set(key, value));
    }
    return params;
  } catch {
    return null;
  }
}

export function isAuthCallbackUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === `${APP_SCHEME}:` &&
      (parsed.hostname === AUTH_CALLBACK_PATH ||
        parsed.pathname.replace(/^\//, "") === AUTH_CALLBACK_PATH)
    );
  } catch {
    return false;
  }
}
