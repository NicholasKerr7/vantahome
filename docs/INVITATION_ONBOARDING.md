# Household account entry and invitations

VantaHome uses individual accounts with household invitations. Account authentication
does not grant membership. New owners explicitly create their home; invitees review
and accept a pending database invitation after authenticating. Existing accounts
sign in normally and review their invitation inbox.

**Current staging checkpoint — 2026-10-04:** migrations 001–018 are deployed;
preview callbacks and the invitation function use `vantahome-preview`. Public
sign-up remains disabled and invitation OTP length remains eight digits. The
hosted API permission sweep passed 32 checks with disposable accounts. Preview
**37** is installed on the user's **iPhone 16 Pro Max**, confirmed by the device's
app listing. The user confirmed resolving developer trust and completing the
Owner email/code, password, household creation, and model preparation steps on
the physical iPhone. A read-only staging check confirmed email verification, a
recorded sign-in, one home with Owner membership, 20 rooms, and 92 simulation-only
devices; the version-1 setup receipt records 20/92. The user also completed Guest
enrollment and household acceptance: only Living room appeared, its Pendant
light worked, and Front entry door control was blocked. Staging confirms the
accepted invitation, Guest membership, one Living-room grant, the 24-hour
deadline, and no permission overrides. The user also confirmed that Guest
restrictions survived fully closing and reopening Preview, and signing back in
with the existing Owner credentials restored the full home. Explicit callback
routing, recovery, other lifecycle checks, and network loss remain pending.
Production is unchanged.

## New invitee flow

1. An Owner or Admin with effective `member.invite` permission calls
   `home-invite` for the selected `homeId`. Non-admin invitation overrides do not
   grant this authority; only the owner may invite another Admin. The server
   checks membership and selected rooms before sending mail and never accepts a
   client-supplied email redirect. Guests and Tenants require an explicit room
   selection; the app no longer assigns the first room automatically.
2. Supabase creates the invited Auth account and sends the configured invitation
   template. The message contains `{{ .Token }}`, a one-time code whose length
   follows the project's hosted email OTP setting.
3. The recipient opens VantaHome's **Accept invitation** entry and enters their
   invited email address and code. The email's bare
   `vantahome-preview://join-home` link opens Preview (`vantahome://join-home` for
   production), but contains no authentication credentials or home role.
4. While signed out, an explicit submit calls `verifyInvitationCode`, which uses
   `verifyOtp({ email, token, type: 'invite' })`. It shares the authentication
   exchange lock, checks the resulting email, and removes a cancelled or
   mismatched invitation session. A signed-in account cannot be silently replaced.
5. The app presents password setup before household access. The root navigator
   activates that step before verification because the SDK emits `SIGNED_IN`
   before the verification promise resolves. Secure storage records the
   pre-verification intent and then binds it to the verified user so restarting
   the app resumes setup. Email-only intent expires after one hour; bound setup
   continuity expires after 30 days. Startup checks the server-verified user and
   confirmed email, with a five-second read deadline. Unavailable storage routes
   to password setup rather than silently skipping it. Successful password setup
   removes only that account's marker; signing out does not erase other accounts'
   unfinished setup.
6. The recipient reviews the available household invitation and accepts it.
   `respond_home_invite` verifies the authenticated recipient and applies
   membership, room grants, and any Guest access deadline transactionally. An
   email link cannot grant access. The recipient sees the deadline before
   accepting; invitation expiry and accepted-access expiry are separate checks.

The existing PKCE checks for OAuth, signup, and password recovery remain in
place. Neither `token_hash` nor access/refresh tokens from invitation URLs are
accepted. Expired, consumed, and incorrect codes fail without a session fallback.

## Required hosted configuration

These files prepare the integration; a client build or Edge Function deployment
does **not** update the hosted Supabase email template or SMTP settings.

- In Supabase **Authentication → Email Templates → Invite user**, install the
  contents of `supabase/templates/invite.html`. Preserve the project's email OTP
  length: both hosted VantaHome projects used eight digits when inspected on
  2026-10-03. The client accepts Supabase's supported six-to-ten-digit format;
  the server verifies the exact configured token. Do not shorten the hosted code
  to work around a client input limit.
  The template intentionally uses `{{ .Token }}` and the bare `{{ .RedirectTo }}`;
  do not replace it with `{{ .ConfirmationURL }}`. The latter uses an implicit
  invitation flow that is incompatible with this app's local PKCE safeguards.
- Add the exact invitation and auth callback URLs for the intended build to the
  project's redirect allowlist. Staging uses `vantahome-preview://join-home` and
  `vantahome-preview://auth-callback`, while retaining its prior production-scheme
  entries. Preview registers `vantahome-preview`; production registers
  `vantahome`. The bundled `EXPO_PUBLIC_APP_VARIANT` and native metadata must
  agree. See [Authentication redirects](AUTH_REDIRECTS.md) for the external
  environment file and repeatable iPhone packaging recipe.
- Production native invitation entry remains the server default. Staging
  explicitly sets the Edge Function secret `VANTAHOME_INVITE_REDIRECT_URL` to
  `vantahome-preview://join-home`; only the exact supported native URIs are
  accepted. For a deployed web app, set that secret to its operator-controlled
  `https://YOUR-APP-HOST/join-home` URL and add that exact URL to Supabase's redirect
  allowlist. This is deployment configuration, never request-body input. Only
  HTTPS `/join-home` pages without credentials, query strings, fragments, or
  nonstandard ports are accepted. Configure the web server to serve the app at
  this path; do not use an unowned host or an open redirect.
- Configure and verify the production SMTP sender and intended delivery/rate
  limits before relying on invitations. Local CLI Auth uses the checked-in
  `[auth.email.template.invite]` configuration.
- Apply the repository's pending database migrations, including
  `014_recipient_invitation_names.sql`, before rolling out this client. Its
  authenticated-only `list_my_home_invitations()` RPC returns pending invitation
  metadata and the server's `homes.name` as `home_name` only for the current
  recipient, using the confirmed `auth.users` email and constrained recipient ID.
  The client fails closed if this RPC is absent; it does not replace the missing
  migration with an anonymous-home fallback. Source files and local tests do not
  install the migration in a hosted project.
- This source revision additionally requires `015_guest_access_expiry.sql` and
  `016_model_scene_bindings.sql`, plus the updated `home-invite` Edge Function.
  Migration 015 adds deadline columns and updates the invitation projection,
  acceptance transaction, and authorization helpers. Migration 016 adds explicit
  room/device model identifiers and the protected `set_model_room_binding` RPC.
  Apply them before this client queries their columns. Migration
  `017_model_simulation_setup.sql` adds the owner-only catalog setup and immutable
  `devices.simulation_only` boundary. Migration
  `018_scoped_room_memberships.sql` replaces grants atomically inside the selected
  household. The current client requires all migrations through 018; it does not
  fall back to unscoped direct room-access writes.

The existing-account case (`email_exists` or `user_already_exists`) resolves the
exact Auth account server-side and records a household invitation. It sends no
new invitation-code email. The API distinguishes delivery as `email_code`,
`in_app`, or `none` for an already accepted member so the UI need not claim an
email was sent. Existing users sign in with their current account and check their
inbox. Expired initial invitations require the homeowner to issue a fresh
invitation; this flow does not expose an unauthenticated resend endpoint.

## Verification before production

Use a separately authorized disposable Supabase project to verify actual email
delivery, correct email/code acceptance, expiry/replay rejection, password setup,
an already signed-in account, existing-account invitations, household acceptance,
and the owned web/native redirect paths. Do not test by emailing real household
members or modifying production Auth settings without the relevant authorization.
Unit and handler tests cover local validation and state boundaries; they do not
prove a hosted template, SMTP sender, or deployed invitation is configured.

Supabase documents [email OTP length bounds](https://supabase.com/docs/guides/local-development/cli/config#auth.email.otp_length),
[email template variables](https://supabase.com/docs/guides/auth/auth-email-templates),
[OTP verification](https://supabase.com/docs/reference/javascript/auth-verifyotp),
and [the invitation API](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).

## Hosted staging checkpoint — 2026-10-03

Both `vantahome-staging` and the production VantaHome project reported
`ACTIVE_HEALTHY` during the initial account/email setup. The following initial
changes were applied only to staging (`dcevusczjtmdpzrxpdou`); the later room-access
rollout is recorded below:

- Applied migration `014_recipient_invitation_names.sql`; migration history at
  this initial checkpoint ran through `014`.
- Deployed `home-bootstrap`, `home-invite`, and `home-invite-respond`, each at
  version 16 with JWT verification enabled.
- Added the exact `vantahome://join-home` redirect alongside the existing
  `vantahome://auth-callback` entry. Eight-digit OTP, email confirmation, and
  existing sign-up policies were preserved.

Remote checks confirmed the invitation RPC exists, authenticated execution is
granted, anonymous execution is denied, and its restricted function settings
match the migration. Anonymous requests to the RPC and all three account
functions returned HTTP 401. The rate-limit hashing secret is present. These
checks do not establish successful sign-in or email delivery.

The owner registered `vantahome.app`, and staging email configuration is now
complete. Resend verified `auth-staging.vantahome.app` in North Virginia
(`us-east-1`); receiving and tracking remain disabled. Public DNS checks confirmed
the generated DKIM TXT at `resend._domainkey.auth-staging` and DNS-only CNAMEs
`rsend.auth-staging` → `rsend.forge.rmta.net` and `send.auth-staging` →
`send.forge.rmta.net`. The scoped `_dmarc.auth-staging` TXT is
`v=DMARC1; p=none;`; it does not enforce rejection of unauthenticated messages.

The **VantaHome staging SMTP** key has Sending access restricted to that domain.
Its secret was saved only in staging Supabase, never in the repository or local
files. A management API read verified `smtp.resend.com:465`, username `resend`,
sender `no-reply@auth-staging.vantahome.app`, display name **VantaHome Preview**,
and a configured password. Limits remain 30 email messages per hour and a
60-second minimum interval.

The hosted invitation template now exactly matches `supabase/templates/invite.html`,
with subject **Your VantaHome invitation**. Eight-digit OTP, required email
confirmation, and disabled public sign-up were preserved. No test, invitation,
or recovery emails were sent; actual delivery and the complete account flow
remained unverified at that initial checkpoint. Public sign-up stays disabled
for the current preview; an authorized operator can invite the intended owner
account instead of opening public enrollment. Auth account invitation alone does
not create a household role: after verification and password setup, that person
explicitly creates their own home or accepts an existing household invitation.

Preview 34 used `vantahome-preview` while the former client had hard-coded
production callbacks. The current source resolves an explicit app variant, and
the current Preview build uses matching native/JavaScript preview identity plus
staging account configuration. Production metadata is restored after packaging.
Preview 37 has replaced the earlier installed build. The user confirmed the
Owner account flow after resolving developer trust; the October 4 checkpoint
below separates that evidence from remaining native tests.

Authenticated accounts do not inherit the offline device catalog. An empty
owner-created home now offers **Prepare my 3D home** to create the authored
20-space/92-device virtual registry. These UUID rows have explicit model bindings
and support room-limited invitations. Real hardware remains separate.

Production remains unchanged, without custom SMTP. No release was promoted:
its recorded migration history remains through `011`, so it also needs review
of migrations `012` and `013` before the new invitation migration.


## Earlier room access staging checkpoint — 2026-10-03

The invitation form now separates identity from a paged access review. The
administrator chooses every room for a Guest or Tenant, including any shared
spaces. **Member still means whole-home room access**; assigning a bedroom does
not restrict a Member. See [Room access](ROOM_ACCESS.md) for the complete role
matrix and model connection steps.

Guests may receive one hour, 24 hours, seven days, or no automatic expiry.
Temporary access starts when the invitation is sent, not when it is accepted.
The server accepts future Guest deadlines up to 30 days; Tenant and other roles
remain permanent. Expiry blocks room/device reads and new commands, including
voice authorization, without a scheduler or deleting membership. The owner can
still review the expired person. A deliberate fresh invitation may renew an
expired Guest with its new rooms and deadline; old room grants and permission
overrides are cleared during that acceptance. Existing active membership cannot
be overwritten by a stale invitation.

Rooms and devices in the cloud use UUIDs. An administrator explicitly maps them
to authored model IDs; display names never create a mapping or grant access.
The renderer checks the mapped room, device kind, visible-device permission,
and action permissions. These model controls continue to run an isolated
simulation; a mapping does not connect physical equipment.

Migrations **015** and **016** were subsequently applied to staging only, using
an explicit `dcevusczjtmdpzrxpdou` target and `--skip-vault`. The reviewed dry-run
listed only these two migrations, with no seeds or roles. The updated
**home-invite** function was **ACTIVE, version 17, JWT verification enabled**
at that checkpoint. `home-invite-respond` and `home-bootstrap` were version 16
with JWT verification enabled; their existing RPC calls use the updated database functions.

Read-only post-deployment checks confirmed staging migration history **001–016**,
the four nullable expiry/model columns, both Guest-only expiry constraints, both
model ID format constraints, and both per-home unique mapping indexes. All six
participating tables retain RLS. The authorization/acceptance helpers include the
Guest deadline, their anonymous execution is denied, and the model-binding RPC
checks administrator authority. No real accounts, memberships, invitations,
emails, or model bindings were created by the rollout. Existing SMTP and Auth
configuration were not modified. Production was not accessed or deployed in
this rollout and remains at its previously recorded 011 checkpoint.

At that earlier checkpoint, the iPhone and two-account invitation flow had not
been tested. The then-current local database run applied 001–016 and passed 323
pgTAP assertions. The subsequent authenticated milestone below supersedes that
schema/test checkpoint without claiming native or email completion.

## Authenticated staging milestone — 2026-10-03

Migrations **017** and **018** were deployed only to the explicit staging project,
with `--skip-vault` and no seed/role deployment. Staging migration history is now
**001–018**. The updated `home-invite` function and its deployment-controlled
redirect use the exact preview invitation scheme. Staging's Site URL is
`vantahome-preview://auth-callback`; its allowlist adds both preview auth and join
URLs while preserving the existing production-scheme entries. SMTP/template
configuration, required email confirmation, disabled public sign-up, and
eight-digit OTP are retained. No production configuration was promoted.

The app reads hosted sign-up availability and hides new-account enrollment when
closed or unavailable. Owner creation remains a separate explicit action after
an authenticated account is established. The HomeAccess screen separates its
invitation review from the named-home form, with touch momentum, restrained
overscroll, and accessible overflow for enlarged text and errors.

For an empty owner home, `create_model_simulation` transactionally adds 20 authored
spaces and 92 virtual devices with explicit UUID-to-model connections. Setup is
owner-only and idempotent, and refuses a registry containing existing rooms or
devices. Virtual entries retain `simulation_only=true`; neither a client update
nor a device observation can turn them into physical control destinations. The
physical command queue independently rejects virtual targets. No device-state
observations or real camera streams are created by setup.

Native room cards, full controls, and model hotspots use current permitted model
bindings. Their simulated state remains separate per account/home/member and on
the device. Room changes use a home-scoped atomic RPC; action overrides also take
the explicit active home and expected signed-in actor. Editing one household's
access does not remove another household's grants.

Verification evidence:

- A full `npm run verify` checkpoint passed before the final authenticated
  timer-host mount fix: 172 app suites / 2,400 tests, 61 scene files / 725 tests,
  127 bridge tests, and 45 script tests, plus app/edge TypeScript,
  dependency/source regressions, and release checks. `npm run build` also
  completed and exported the web application to `dist`. The full-suite counts
  describe that checkpoint, not a rerun after the final mount change. After that
  change, 26 focused AppNavigator/ModelHomeSync tests, app TypeScript, and diff
  checks passed; Preview 36 includes the verified fix.
- In the browser, a synthetic account completed normal password sign-in,
  named-home creation, and preparation of the 20-space/92-device model. Forms
  were visually reviewed at 375 × 667 without vertical scrolling. Saved light
  state survived reload, model full controls opened from the native device
  library, and sign-out succeeded. Final review caught and fixed a missing
  authenticated simulation timer host. Afterward, gate manual close moved from
  100% to 0%, and automatic close progressed from 29 seconds to 7 seconds to
  **Closed**. The browser's synthetic account and home were cleaned up.
- Preview 36's Release build included the timer-host fix. Its subsequent install
  failed because the seven-day development profile had expired; the October 4
  installation checkpoint below supersedes its pending-install status.
- A fresh isolated PostgreSQL 17 instance applied migrations 001–018; eight SQL
  suites passed 369 pgTAP assertions. That instance was stopped and removed.
- The hosted staging API sweep passed **32 checks** using four synthetic accounts
  at non-deliverable addresses and two temporary homes. It exercised normal
  password sign-in and `home-bootstrap`, model setup/idempotency, Guest/Tenant
  defaults, assigned-room reads, action/view overrides, multi-home isolation,
  administrator restrictions, revocation, expiry, and simulation-command
  rejection. An initial request timed out; both its resources and the successful
  retry's resources were cleaned up. No physical commands/observations were
  created, and no real recipient was contacted by this sweep.

## Native installation checkpoint — 2026-10-04

Preview 36's Apple development profile expired at **11:59:51 p.m. on October 3,
America/New_York** (`2026-10-04 03:59:51 UTC`). A normal automatic-signing build
renewed the profile and produced **Preview 37**, expiring at **2:55:16 a.m. on
October 11, America/New_York** (`2026-10-11 06:55:16 UTC`). The build completed;
its exact preview bundle/schemes, profile device coverage, and strict code
signature all passed verification. Production source metadata was restored
byte-for-byte.

Preview 37 installed on the user's **iPhone 16 Pro Max**. The device app listing
confirms build 37. Initial launch was denied by developer-trust security error
**10002**. The user subsequently confirmed resolving trust/verification and
opening **VantaHome Preview** successfully.

Both intended recipient accounts were absent before the authorized first Owner
Auth invitation. Supabase's `inviteUserByEmail` API accepted that invitation at
**3:00:34 a.m. on October 4, America/New_York** (`2026-10-04 07:00:34 UTC`), with
the exact `vantahome-preview://join-home` redirect. API acceptance alone did not
confirm delivery. The user subsequently reported completing the Owner email/code
and password steps, creating the household, and preparing its 3D model on the
physical iPhone. A read-only staging check confirmed a verified Owner email,
recorded sign-in, exactly one home with Owner membership, 20 rooms, 92 devices all
marked simulation-only, and a version-1 model setup receipt with counts 20/92.
That initial check found no household invitations. The user then sent the Guest
invitation through the Owner app and confirmed email receipt. A subsequent
read-only check first verified the pending invitation for Living room only with
a 24-hour deadline. The user then confirmed signing out of Owner, completing the
Guest email-code/password flow, and accepting the existing home invitation on
the iPhone. The Guest saw only Living room, could toggle Pendant light, and could
not control Front entry door. A further read-only check confirmed Guest email
verification and sign-in, accepted invitation status, Guest membership, exactly
one Living-room assignment, the preserved deadline, and no action overrides.
No recovery email has been sent.

The user then fully closed and reopened Preview while signed in as Guest and
confirmed that only Living room remained available. After signing out and signing
back in as Owner with the existing password, the full Owner home returned. This
completes the reported two-account enrollment, acceptance, initial controls,
Guest scope persistence after reopening, and return-to-Owner check on iPhone.

An initial Owner Auth invitation creates no household invite card: after password
setup, **No pending invitations** is expected. The completed Owner route was
**Set up my home → Create my home → Prepare my 3D home**.

**Pending:** explicit warm/cold callbacks, recovery, foreground/background
transitions, network-loss handling, and expiry observed at its actual deadline
on the physical iPhone. The passed reopening and account-switch checks do not
establish those separate flows. Keep iPad verification deferred and
physical hub control out of this simulation milestone. See
[Room access](ROOM_ACCESS.md) and [Preview packaging](AUTH_REDIRECTS.md).
