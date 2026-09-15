# Browser Account Linking

Status: **local implementation only; not published or deployed**. The standalone
page and opt-in JSON authorization API do not change the hosted verification
record for source `42ab751`, the phone's configuration, or the Sprint 2 release
gate. See [Sprint 2](./SPRINT_2.md) for the separate remaining checks.

## Why a separate page

Supabase's shared Edge Function domain rewrites HTML responses to plain text;
HTTP success alone does not establish a usable sign-in document. See the official
[HTML response limitation](https://supabase.com/docs/guides/functions/limits).

The page in `web/voice-linking/` is an isolated static artifact. In the intended
hosted flow, its browser sends credentials directly to the existing Supabase
`voice-authorize` function, which authenticates through Supabase Auth. There is
no additional password-forwarding proxy. The static host still controls the
password-bearing page and its scripts, so its deployment and logging policy
require explicit approval.

## Local synthetic preview

From the repository root, with the existing dependencies installed:

```bash
npm run preview:voice-linking
```

Open the full local URL printed by the command. Use only the displayed synthetic
credentials: `linking@example.test` / `local-fixture-only`. **Never enter real
account details into this preview.** Its visible banner identifies the simulated
service. Stop both preview servers with Ctrl+C.

The page and mock API bind to separate random ports on `127.0.0.1`, exercising a
cross-origin browser request and JSON POST preflight. They do not load `.env`,
contact Supabase or a voice provider, send email, create accounts, or control
hardware. The final local callback explicitly says that no account was linked.
No Docker or simulator is required.

Failure scenarios can be selected explicitly:

```bash
npm run preview:voice-linking -- --scenario invalid-credentials
```

Available scenarios are `success`, `invalid-credentials`, `rate-limited`,
`unavailable`, `untrusted-redirect`, and `unsafe-metadata`. The last two check
rejection of an unexpected callback and literal display of HTML-shaped provider
text. The preview is not the deployed Edge handler and does not prove hosted
authentication, trusted client-IP resolution, provider linking, or physical
device behavior.

## Standalone build, without publishing

After selecting an approved project and site origin, replace both example
values below with their explicitly approved public identifiers:

```bash
npm run build:voice-linking -- \
  --project-ref 'replace-with-approved-project-ref' \
  --site-origin 'https://link.example.com'
```

The project reference must contain exactly 20 lowercase letters/digits. The
site origin must be a canonical HTTPS DNS origin without a trailing slash,
path, credentials, query, fragment, or local/IP-literal hostname. The command
reads neither the app's `.env` nor a linked CLI project. It embeds only the
public API endpoint and expected page origin, not API keys or service secrets.

Output goes to the ignored `voice-linking-dist/` directory and contains the
page, scripts, stylesheet, existing release icon, and `security-headers.json`.
It is not included in the Expo `npm run build` export or wired into the root
Vercel deployment. Building does not upload, publish, provision a host, configure
a domain, modify provider settings, or enable the Edge JSON mode.

The header JSON is a deployment requirement manifest, **not** a hosting
configuration that applies itself. The approved host must apply its HTTP headers
to all responses and preserve the page's real HTML content type. Required
protections include:

- CSP with scripts, styles, and images restricted to the page origin;
  `connect-src` restricted to the exact configured Supabase API origin; and
  `default-src`, `base-uri`, `frame-ancestors`, `form-action`, and `object-src`
  set to `'none'` where specified in the manifest.
- `Cache-Control: no-store`, `Pragma: no-cache`, `Referrer-Policy: no-referrer`,
  `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY`.
- The manifest's Permissions Policy, indexing restrictions, and HTTPS transport
  policy. Do not add third-party scripts, analytics, or a service worker.

Host access logs must not retain OAuth query strings, codes, state, or credential
bodies. Removing query parameters from browser history cannot erase an initial
URL already recorded by a server, CDN, or monitoring integration.

## JSON authorization contract

The new mode is selected explicitly with `?format=json` on
`/functions/v1/voice-authorize`. The Edge-only `VOICE_LINKING_ORIGIN` setting must
equal the approved page origin exactly, for example `https://link.example.com`.
It is not a phone `.env` setting. Missing or invalid configuration returns `503`;
a missing, `null`, or different request `Origin` returns `403` before credentials
are processed. Wildcards and local/HTTP origins are not production exceptions.

- `GET` accepts `client_id`, `redirect_uri`, `response_type=code`, and optional
  opaque `state`. It validates the registered client and exact callback, then
  returns `{ client: { name, provider }, client_id, redirect_uri, response_type,
  state }`. No credential form is shown before this validation succeeds.
- `POST` requires `Content-Type: application/json` and exactly the supported
  fields `client_id`, `redirect_uri`, `response_type`, `state`, `email`, and
  `password`, with the existing 8 KiB body limit. The callback is revalidated
  before authentication and code issuance. Success returns HTTP `200` with
  `{ "redirect": "server-built authorization callback" }`, not a fetch redirect.
- JSON callbacks must also be canonical HTTPS URLs with no credentials or
  fragment. Client IDs and redirects are never trimmed into registered values.
  Duplicate known OAuth query fields, including `format`, are rejected.
- Non-empty state is copied exactly, including whitespace and Unicode. Empty
  state removes any inherited callback state parameter. The page validates the
  entire success URL against the registered callback, not only its origin.
- Cancellation is available only after the server validates the request. It
  returns to that callback with `error=access_denied`, removes any old code, and
  preserves non-empty state. It does not submit a password.

JSON preflight allows only GET/POST and `Content-Type`. Every JSON response,
including failures, uses no-store and `Vary: Origin`; an allowed origin is echoed
exactly, never `*`, and credentialed CORS is not enabled. The browser uses
`credentials: omit`, rejects unexpected fetch redirects, and clears its password
field on submission, cancellation, and page exit. Page code does not put
credentials into local/session storage or application logs.

Errors use fixed codes rather than authentication/database details. Relevant
statuses are `400` for invalid requests or unknown clients, `401` for rejected
credentials, `403` for disallowed origins/preflights, `415` for non-JSON POST,
`429` for exhausted attempts, and `500`/`503` for service/configuration failures.
The existing HTML GET/form POST mode remains available without the format
selector. Both modes share the same independent GET and POST IP-rate buckets;
switching modes cannot obtain a second password-attempt budget.

## Approval and verification gates

Before any real use, approve the isolated HTTPS host, header enforcement,
logging policy, project target, and exact browser origin. Deploy matching source
only to the explicitly approved environment and configure the origin there.
No custom-domain purchase, hosting publication, or environment mutation is
authorized merely by running the local preview or build.

The existing client-IP gate remains fail-closed. Do not change
`TRUSTED_PROXY_HOPS` just to clear a `503`; establish and verify the actual
sanitizing ingress chain first. Browser rendering, headers, CORS, credential
submission, cancellation, callback/state binding, token exchange, and actual
provider linking must then be verified on the approved hosted path. Local mock
success and earlier HTTP-only API checks do not satisfy those gates.

Native testing, authoritative bridge observations and physical command
completion, and independent security review remain required before alpha or
physical integration. This page does not make queued commands physically
confirmed or enable additional device categories.
