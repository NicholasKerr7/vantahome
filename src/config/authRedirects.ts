import { Platform } from "react-native";
import * as AuthSession from "expo-auth-session";
import { resolveAppVariant } from "./appVariant";

// Expo substitutes direct EXPO_PUBLIC property reads while bundling. Preview
// links must never be consumed by a separately installed production app.
const APP_IDENTITY = resolveAppVariant(process.env.EXPO_PUBLIC_APP_VARIANT);
export const APP_SCHEME = APP_IDENTITY.scheme;
export const AUTH_CALLBACK_PATH = "auth-callback";
export const VOICE_LINK_PATH = "voice-link";
export const HOME_INVITATION_PATH = "join-home";
export const NATIVE_AUTH_CALLBACK_URI = `${APP_SCHEME}://${AUTH_CALLBACK_PATH}`;
export const NATIVE_VOICE_LINK_URI = `${APP_SCHEME}://${VOICE_LINK_PATH}`;
export const NATIVE_HOME_INVITATION_URI = `${APP_SCHEME}://${HOME_INVITATION_PATH}`;

/** Use exact native callbacks and retain origin-bound redirects on the web. */
function makeAppRedirectUri(path: string, native: string) {
  if (Platform.OS !== "web") return native;
  return AuthSession.makeRedirectUri({
    scheme: APP_SCHEME,
    path,
  });
}

/** Return the current build's authentication and password recovery callback. */
export function makeAuthCallbackUri() {
  return makeAppRedirectUri(AUTH_CALLBACK_PATH, NATIVE_AUTH_CALLBACK_URI);
}

/** Keep voice account linking separate from authentication callbacks. */
export function makeVoiceLinkUri() {
  return makeAppRedirectUri(VOICE_LINK_PATH, NATIVE_VOICE_LINK_URI);
}

/** Open invitation entry without carrying credentials, recipient data, or membership. */
export function makeHomeInvitationUri() {
  return makeAppRedirectUri(HOME_INVITATION_PATH, NATIVE_HOME_INVITATION_URI);
}

/** A bare, canonical invitation URL is navigation intent only, never authentication. */
export function isHomeInvitationUrl(url: string) {
  try {
    const parsed = new URL(url);
    const expected = new URL(makeHomeInvitationUri());
    return (
      parsed.protocol === expected.protocol &&
      parsed.hostname === expected.hostname &&
      parsed.port === expected.port &&
      parsed.pathname === expected.pathname &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

/** Reject ambiguous callback parameters before any credential exchange. */
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

/** Accept only this build's exact callback authority and path. */
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
