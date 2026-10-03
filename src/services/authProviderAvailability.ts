export type AuthProviderAvailability = {
  apple: boolean;
  google: boolean;
  signupAllowed: boolean;
};

/** Advertise only explicitly enabled providers and email account enrollment. */
export function parseAuthProviderAvailability(value: unknown) {
  const settings = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const external = settings.external;
  const providers =
    external && typeof external === "object"
      ? (external as Record<string, unknown>)
      : {};
  return {
    apple: providers.apple === true,
    google: providers.google === true,
    signupAllowed: settings.disable_signup === false && providers.email === true,
  } satisfies AuthProviderAvailability;
}

/** Read public Auth settings; unavailable configuration keeps enrollment closed. */
export async function fetchAuthProviderAvailability(): Promise<AuthProviderAvailability> {
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!baseUrl || !apiKey) return parseAuthProviderAvailability(null);

  try {
    const response = await fetch(`${baseUrl}/auth/v1/settings`, {
      headers: { apikey: apiKey },
    });
    if (!response.ok) return parseAuthProviderAvailability(null);
    return parseAuthProviderAvailability(await response.json());
  } catch {
    return parseAuthProviderAvailability(null);
  }
}
