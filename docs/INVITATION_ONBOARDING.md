# Household account entry and invitations

VantaHome uses individual accounts with household invitations. Account authentication
does not grant membership. New owners explicitly create their home; invitees review
and accept a pending database invitation after authenticating. Existing accounts
sign in normally and review their invitation inbox.

## New invitee flow

1. An authorized household member calls `home-invite` for the selected `homeId`.
   The server checks that household's membership and invitation permissions; it
   never accepts a client-supplied email redirect.
2. Supabase creates the invited Auth account and sends the configured invitation
   template. The message contains `{{ .Token }}`, a six-digit one-time code.
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
   membership and room grants transactionally. An email link cannot grant access.

The existing PKCE checks for OAuth, signup, and password recovery remain in
place. Neither `token_hash` nor access/refresh tokens from invitation URLs are
accepted. Expired, consumed, and incorrect codes fail without a session fallback.

## Required hosted configuration

These files prepare the integration; a client build or Edge Function deployment
does **not** update the hosted Supabase email template or SMTP settings.

- In Supabase **Authentication → Email Templates → Invite user**, install the
  contents of `supabase/templates/invite.html`. Use a six-digit email OTP setting.
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

Supabase documents [email template variables](https://supabase.com/docs/guides/auth/auth-email-templates),
[OTP verification](https://supabase.com/docs/reference/javascript/auth-verifyotp),
and [the invitation API](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).
