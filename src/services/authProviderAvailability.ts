export type AuthProviderAvailability = {
  apple: boolean;
  google: boolean;
};

export function parseAuthProviderAvailability(value: unknown) {
  const external =
    value && typeof value === "object" && "external" in value
      ? (value as { external?: unknown }).external
      : null;
  const providers =
    external && typeof external === "object"
      ? (external as Record<string, unknown>)
      : {};
  return {
    apple: providers.apple === true,
    google: providers.google === true,
  } satisfies AuthProviderAvailability;
}

export async function fetchAuthProviderAvailability() {
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!baseUrl || !apiKey) return { apple: false, google: false };

  try {
    const response = await fetch(`${baseUrl}/auth/v1/settings`, {
      headers: { apikey: apiKey },
    });
    if (!response.ok) return { apple: false, google: false };
    return parseAuthProviderAvailability(await response.json());
  } catch {
    return { apple: false, google: false };
  }
}
