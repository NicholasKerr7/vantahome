# Authentication redirects and preview packaging

Configuration checkpoint: **2026-10-04**. Preview **37** built successfully and
is installed on the user's **iPhone 16 Pro Max**; the device's app listing
confirms build 37. Its bundle identifier, exact preview URL schemes, signing
profile device coverage, and strict code signature were verified. Production
native source metadata was restored to its original bytes.

Build 36 could not install because its seven-day Apple development profile had
expired at **11:59:51 p.m. on October 3, America/New_York**
(`2026-10-04 03:59:51 UTC`). Build 37 used normal automatic signing to renew the
profile, now expiring at **2:55:16 a.m. on October 11, America/New_York**
(`2026-10-11 06:55:16 UTC`). It retains the authenticated simulation timer fix.

Initial launch encountered developer-trust security error **10002**. The user
subsequently confirmed trusting/verifying the profile, opening Preview, and
completing the Owner invitation email/code, password, household creation, and
model preparation steps on the physical iPhone. Supabase had accepted the
authorized Owner invitation at **2026-10-04 07:00:34 UTC**, using
`vantahome-preview://join-home`. A subsequent read-only staging check confirmed
email confirmation, a recorded sign-in, one owned home, and its 20 rooms and 92
simulation-only devices. The model setup receipt is version 1 with counts 20/92.

The user also confirmed sending the Guest invitation, receiving its email,
signing out of Owner, completing Guest code/password setup, and accepting the
household invitation on the iPhone. Only Living room appeared; Pendant light
control worked and Front entry door control was blocked. Read-only staging
checks confirmed the verified Guest account, recorded sign-in, accepted invite,
Guest membership, exactly one Living-room grant, a 24-hour access deadline,
and no permission overrides.

The user then fully closed and reopened Preview as Guest and confirmed that
Living-room-only access remained. Signing out of Guest and signing back in with
the existing Owner credentials restored the full Owner home. This verifies the
reported round-trip account switch and Guest restrictions after reopening.
Explicit cold/warm callback routing, recovery, foreground/background transitions,
network-loss behavior, and expiry observed at its deadline remain separate
pending checks.

## Explicit native identities

| Build | Public variant | Bundle identifier | Authentication / recovery | Invitation entry |
| --- | --- | --- | --- | --- |
| VantaHome | `production` | `com.anonymous.vantahome` | `vantahome://auth-callback` | `vantahome://join-home` |
| VantaHome Preview | `preview` | `com.anonymous.vantahome.preview` | `vantahome-preview://auth-callback` | `vantahome-preview://join-home` |

`src/config/appVariant.js` defines these identities for the app and packaging
checks. `EXPO_PUBLIC_APP_VARIANT` selects the bundled callback scheme; an unknown
variant fails. Production is the default. Preview and production reject each
other's callbacks, including when both apps are installed. A scheme change
requires a native build with matching Expo, plist, and Xcode metadata; changing
JavaScript alone does not register a native scheme.

`npm run release:auth-redirect-check` checks the resolved variant against Expo
configuration and the checked-in iOS schemes. Production metadata remains the
repository default. Expo Go is not a supported native authentication test target.
On the web, callbacks remain bound to that build's browser origin; a native
allowlist entry does not authorize an arbitrary web callback.

Voice linking uses the selected build's `/voice-link` URI and is validated
separately against each `voice_oauth_clients.redirect_uris` entry. The staging
account-auth configuration described here does not enable voice integrations.

## Hosted staging configuration

Only `vantahome-staging` (`dcevusczjtmdpzrxpdou`) was changed in this rollout:

- Site URL: `vantahome-preview://auth-callback`.
- Redirect allowlist retains `vantahome://auth-callback` and
  `vantahome://join-home`, and adds the exact preview auth and invitation URIs.
- The deployed `home-invite` function accepts the exact preview invitation URI.
  Its staging `VANTAHOME_INVITE_REDIRECT_URL` is
  `vantahome-preview://join-home`.
- Public sign-up remains disabled. Email confirmation and eight-digit invitation
  codes remain enabled. The app reads the public Auth settings and hides public
  owner enrollment when sign-up is disabled or the settings read fails.

Retaining the production URIs in staging's allowlist does not change production
Auth settings. Staging emails now point to Preview; no wildcard scheme or
client-supplied invitation redirect is used.

The public provider settings endpoint controls which Apple/Google buttons are
shown. This rollout does not claim either provider has passed a native sign-in
test; provider credentials and callback registration require their own setup.

## Authentication boundaries

Password recovery explicitly supplies the resolved auth callback instead of
relying on Site URL. OAuth, owner sign-up confirmation, and recovery require a
locally initiated, expiring PKCE flow. The app rejects implicit access/refresh
tokens, duplicate parameters, foreign callbacks, and stale requests. Recovery
finishes on a dedicated password screen before household controls are available.

Invitation links carry navigation intent only. Recipients enter their email and
one-time code, finish password setup, and then accept a server-recorded household
invitation. A bare invitation link grants no account session, role, or room
access. See [Invitation onboarding](INVITATION_ONBOARDING.md).

## Build an authenticated iPhone preview

Keep the environment file **outside the repository and Metro project root**.
Do not add `.env.*` preview files beside app source: during this build, Metro
attempted to compile an in-project dotenv file even with `EXPO_NO_DOTENV=1`.
The packaging helper loads an explicit external file and disables automatic
loading. Use only its supported public fields:

```dotenv
EXPO_PUBLIC_APP_VARIANT=preview
EXPO_PUBLIC_VANTA_MODE=development
EXPO_PUBLIC_SUPABASE_URL=https://dcevusczjtmdpzrxpdou.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<STAGING_ANON_OR_PUBLISHABLE_KEY>
EXPO_PUBLIC_ENABLE_3D_HOME=true
EXPO_PUBLIC_ENABLE_RENDERER_LAB=false
```

Replace the key placeholder with staging's client-public key. Never place a
service-role key, database password, SMTP key, or management credential in this
file or any `EXPO_PUBLIC_*` value. The helper rejects unsupported/duplicate
settings and privileged legacy JWTs, requires the exact staging URL, and keeps
the preview identity separate from production.

Run from the repository with existing native dependencies and an authorized
Apple signing team; replace all path/team placeholders:

```sh
python3 scripts/build-ios-preview.py \
  --env-file /absolute/path/outside-repo/vantahome-preview.env \
  --build-number 37 \
  --team-id YOURTEAMID \
  --derived-data /absolute/path/outside-repo/preview-derived-data \
  --log /absolute/path/outside-repo/preview-build.log
```

Use a newer build number for subsequent installations. The helper obtains an
exclusive packaging lock, temporarily changes Expo/plist/Xcode metadata, runs
redirect/version/dependency checks, and packages an iOS Release build. It restores
the original production metadata on normal completion, failures, and controlled
termination. It does not install the app or deploy Supabase settings. Build
output is under `Build/Products/Release-iphoneos/` in the chosen derived-data path.
Review the completed build before installing it on the intended device.

## Verification still required

Warm and cold Preview auth/invitation links, real invitation delivery and code
entry, password recovery, sign-out/account switching, background/resume, and
network-loss behavior must be exercised on the physical iPhone. The hosted API
checks and local automated tests do not establish these native results. Production
configuration and iPad testing remain outside this rollout.
