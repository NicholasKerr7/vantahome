import * as WebBrowser from "expo-web-browser";
import { makeVoiceLinkUri } from "../../config/authRedirects";
import { ensureSecureAuthCrypto } from "../../services/authCrypto";
import { useHomeStore, type IntegrationProvider } from "../../store/useHomeStore";
import { createVoiceLinkController, isVoiceProvider, resolveVoiceConfiguration } from "./voiceLinking";

/** Read only public build configuration; a configured endpoint does not establish operational readiness. */
export function getVoiceLinkConfiguration(provider: IntegrationProvider) {
  if (!isVoiceProvider(provider)) return null;
  return resolveVoiceConfiguration({
    authorizeUrl: process.env.EXPO_PUBLIC_VOICE_AUTHORIZE_URL,
    functionsUrl: process.env.EXPO_PUBLIC_VOICE_FUNCTIONS_URL,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    clientId: provider === "alexa" ? process.env.EXPO_PUBLIC_VOICE_ALEXA_CLIENT_ID : process.env.EXPO_PUBLIC_VOICE_GOOGLE_CLIENT_ID,
    redirectUri: makeVoiceLinkUri(),
  });
}

/** Generate an unpredictable callback binding with the same secure crypto used by sign-in. */
function createVoiceState() {
  ensureSecureAuthCrypto();
  const values = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

/** Share the in-flight lock and session validation between every integration entry point. */
export const linkVoiceAccount = createVoiceLinkController({
  getScope: () => useHomeStore.getState(),
  getConfiguration: getVoiceLinkConfiguration,
  createState: createVoiceState,
  openAuthorization: async (url, redirectUri) => {
    WebBrowser.maybeCompleteAuthSession();
    return WebBrowser.openAuthSessionAsync(url, redirectUri);
  },
  setStatus: (provider, status) => useHomeStore.getState().setIntegrationStatus(provider, status),
  saveAuthorization: (provider) => {
    const state = useHomeStore.getState();
    state.linkIntegration(provider, state.profile.email?.trim() || state.userName?.trim() || "Authorized account");
  },
});
