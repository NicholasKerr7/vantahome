# Phase 3: Alexa + Google Smart Home

This phase adds OAuth2 account linking + fulfillment endpoints using Supabase Edge Functions.

## 1) Apply migration

Run the new migration to add OAuth and command tables:

- `supabase/migrations/002_voice_oauth.sql`

## 2) Deploy Edge Functions

```bash
supabase functions deploy
```

These functions require `SUPABASE_SERVICE_ROLE_KEY` in the function environment.
Their `verify_jwt = false` gateway settings are intentionally scoped in
`supabase/config.toml`: OAuth clients and provider-bound VantaHome access tokens
are authenticated by the handlers instead of as Supabase user sessions.

## 3) Seed voice OAuth clients

Add a client for Alexa and Google in `voice_oauth_clients`. Secrets are stored as SHA-256 hashes.

Example (replace IDs, secrets, redirect URIs):

```sql
insert into voice_oauth_clients (id, name, provider, client_secret_hash, redirect_uris)
values
  (
    'alexa-client-id',
    'Alexa Smart Home',
    'alexa',
    '<sha256-of-client-secret>',
    array['https://pitangui.amazon.com/api/skill/link/MY_SKILL_ID']
  ),
  (
    'google-client-id',
    'Google Smart Home',
    'google',
    '<sha256-of-client-secret>',
    array['https://oauth-redirect.googleusercontent.com/r/YOUR_PROJECT_ID']
  );
```

To hash a secret:

```bash
python - <<'PY'
import hashlib
secret = 'your-client-secret'
print(hashlib.sha256(secret.encode()).hexdigest())
PY
```

## 4) Configure account linking

### Alexa

- **Authorization URI**: `https://<PROJECT>.functions.supabase.co/voice-authorize`
- **Token URI**: `https://<PROJECT>.functions.supabase.co/voice-token`
- **Client ID**: `alexa-client-id`
- **Client Secret**: (your raw secret)
- **Scope**: optional (ignored)

### Google

- **Authorization URI**: `https://<PROJECT>.functions.supabase.co/voice-authorize`
- **Token URI**: `https://<PROJECT>.functions.supabase.co/voice-token`
- **Client ID**: `google-client-id`
- **Client Secret**: (your raw secret)

## 5) Fulfillment endpoints

- **Alexa Smart Home**: `https://<PROJECT>.functions.supabase.co/alexa-smart-home`
- **Google Smart Home**: `https://<PROJECT>.functions.supabase.co/google-smart-home`

Both expect `Authorization: Bearer <access_token>` issued by `voice-token`.

## Notes

- The OAuth login form uses email/password. If you sign in only with Google/Apple, set a password in Supabase to link voice assistants.
- Fulfillment queues authorized commands into `device_commands`; only the
  trusted bridge may write observed state into `device_state`.
- You can build a local bridge (MQTT/HA) to consume `device_commands` and apply them to devices.
