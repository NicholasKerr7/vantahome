import { createClient } from "@supabase/supabase-js";
import { secureSessionStorage } from "./secureSessionStorage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  // When env vars are absent, we fall back to null and skip Supabase wiring.
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          storage: secureSessionStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: "pkce",
        },
      })
    : null;

/** Verify captured tokens without letting an obsolete Auth error clear the app's current login. */
export const accountAuthVerifier = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: 'vantahome-token-verifier',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;
