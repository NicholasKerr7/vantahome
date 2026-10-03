# Household account entry and invitations

VantaHome uses individual accounts with household invitations. Account authentication
does not grant membership. New owners explicitly create their home; invitees review
and accept a pending database invitation after authenticating. Existing accounts
sign in normally and review their invitation inbox.

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
   invited email address and code. The email's bare `vantahome://join-home` link
   can open this screen, but contains no authentication credentials or home role.
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
- Add the exact `vantahome://join-home` URL to the project's redirect allowlist.
  Keep the existing `vantahome://auth-callback` entry for locally initiated PKCE
  flows. Preview and production builds must register their intended app scheme.
- Native invitation entry is the server default. For a deployed web app, set the
  Edge Function secret `VANTAHOME_INVITE_REDIRECT_URL` to its operator-controlled
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
  Apply both migrations before this client queries their columns; preserve
  invitation/auth settings during the separate deployment.

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
remain unverified. Deliberately enable owner enrollment for staging when ready
to test the full flow with authorized test recipients.

Keep the installed offline Preview separate until native auth integration is
ready. Preview 34 registers `vantahome-preview`, while current client callbacks
use `vantahome`; adding staging credentials alone would route links incorrectly.
Authenticated accounts do not inherit the local demo device catalog. The source
now includes account-scoped simulation state and explicit model connections,
with assigned-room rendering and action gating. These source changes have not
been installed on the iPhone; matching preview callback configuration and
end-to-end authenticated testing are still required before replacing Preview 34.

Production remains unchanged, without custom SMTP. No release was promoted:
its recorded migration history remains through `011`, so it also needs review
of migrations `012` and `013` before the new invitation migration.


## Room access staging checkpoint — 2026-10-03

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
**home-invite** function is now **ACTIVE, version 17, JWT verification enabled**.
`home-invite-respond` and `home-bootstrap` remain version 16 with JWT verification
enabled; their existing RPC calls use the updated database functions.

Read-only post-deployment checks confirmed staging migration history **001–016**,
the four nullable expiry/model columns, both Guest-only expiry constraints, both
model ID format constraints, and both per-home unique mapping indexes. All six
participating tables retain RLS. The authorization/acceptance helpers include the
Guest deadline, their anonymous execution is denied, and the model-binding RPC
checks administrator authority. No real accounts, memberships, invitations,
emails, or model bindings were created by the rollout. Existing SMTP and Auth
configuration were not modified. Production was not accessed or deployed in
this rollout and remains at its previously recorded 011 checkpoint.

**The iPhone has not been rebuilt, and the two-account authenticated invitation
flow remains unverified.** The current preview remains a simulation. A fresh
local PostgreSQL 17 database applied migrations 001–016; six SQL suites passed
323 pgTAP assertions. Full app and scene tests, browser role/layout checks, builds,
and type checks also passed; see [Room access](ROOM_ACCESS.md) for counts and the
separate unresolved dependency audit. These checks and deployed metadata do not
prove hosted email delivery, mobile sign-in, or physical-device control.
