# Security Review Environment Runbook

Status: **prepared; do not provision until an engagement is approved**

This runbook turns the agreed review scope into an isolated, reproducible test
environment. It does not authorize testing and must not be used against the
active VantaHome Supabase project.

## Release gates

1. Accept scope, price, dates, rules of engagement, data handling, and retest
   terms in writing.
2. Freeze the agreed commit and record its full hash in the private engagement
   record.
3. Create a new disposable Supabase project with no production links, customer
   data, household hardware, or shared credentials.
4. Complete the isolation checks below before giving a reviewer access.
5. Delete the disposable project and revoke every temporary credential after
   the final retest evidence is received.

## Isolation record

Record these values outside the public repository:

- Active application project reference.
- Disposable review project reference and deletion owner.
- Region, creation time, planned deletion time, and approved reviewer list.
- Agreed source commit, mobile build identifier, migration range, and deployed
  Edge Function revisions.
- Credential issue and expiry times.

The two project references must differ. Keep review configuration in an ignored
local file such as `.env.review.local`; never replace the app's active `.env`
or commit credentials. The remote database runner provides an additional
fail-closed check:

```sh
VANTAHOME_DISPOSABLE_DB_CONFIRMED=true \
SUPABASE_DB_URL='postgresql://review-database-url' \
npm run test:db:remote
```

It refuses to run unless the database URL identifies a project different from
`EXPO_PUBLIC_SUPABASE_URL`.

## Synthetic authorization matrix

Use unique test-only addresses and random passwords delivered through the
approved secure channel. Do not reuse the static pgTAP fixture identifiers as
real credentials.

| Persona | Household | Assignment | Boundary to validate |
| --- | --- | --- | --- |
| Owner A | Home A | Canonical owner | Full Home A access; no Home B access; ownership cannot be overridden |
| Admin A | Home A | Household-wide | Member administration and audit access; cannot replace Owner A |
| Member A | Home A | Household-wide | Ordinary permitted devices; no member administration or privileged audit reads |
| Member A denied | Home A | Explicit denial | A role-default action becomes unavailable in UI, API, database, and voice paths |
| Guest A | Home A | Assigned room only | No private-room, camera, audit, or administrative access |
| Tenant A | Home A | Assigned room only | Same room isolation with tenant action defaults and sensitive controls denied |
| Outsider | None | No membership | No household, room, device, state, command, invitation, or audit access |
| Owner B | Home B | Canonical owner | Full Home B access; no Home A access |
| Anonymous caller | None | No session | Public endpoints reject unauthorized or malformed requests without leaking data |

Create an assigned room and a private room in Home A, plus a foreign room in
Home B. Populate Home A with every supported kind: AC, light, TV, coffee maker,
fridge, gate, garage, fan, door, vacuum, camera, window, stove, washer, dryer,
dishwasher, microwave, energy, water, water heater, air quality, sprinkler,
speaker, and smoke detector. Add a private-room light and a foreign-home light
to make room and household crossover attempts explicit.

Include both an explicit grant and denial for the same role-default permission
on separate personas. Exercise high-risk commands for cameras, doors, gates,
garages, stoves, smoke/safety devices, automations, and invitations separately
from ordinary light or media controls.

## Deployment and preflight

- Apply migrations 001 through 011 from scratch; do not clone the active
  database.
- Deploy only the Edge Functions pinned to the agreed source commit.
- Generate a new rate-limit HMAC secret and synthetic OAuth/voice client
  credentials. Do not enable real Alexa, Google, Sentry, or household-device
  accounts unless they are added to the written scope.
- Use synthetic device state, command history, audit events, names, images, IP
  addresses, and recovery links.
- Confirm JWT enforcement and public endpoint behavior match
  `supabase/config.toml`.
- Run the following checks before access is issued:

```sh
npm ci
npm run verify
npm run security:secrets
npm run supabase:check
```

Record only pass/fail status, timestamps, commit hashes, and non-sensitive
environment identifiers in the handoff. Do not place tokens, database URLs,
passwords, exploit details, or reviewer findings in the repository or email.

## Reviewer handoff

Provide through the agreed secure channel:

- Rules of engagement and named contacts for authorization and emergencies.
- Read-only access to the frozen source commit.
- Test build hashes and installation instructions.
- Disposable API URL, public client key, synthetic account credentials, and
  any separately scoped privileged test credential.
- Persona/room/device map and expected authorization boundaries.
- A private finding channel and severity/escalation expectations.
- Environment expiry, credential expiry, test window, and retest window.

No reviewer receives active-project credentials or production service-role
material. Privileged disposable credentials must be separately scoped, logged,
and revoked immediately after their required work package.

## Teardown and closure

1. Revoke reviewer invitations, OAuth clients, voice clients, tokens, database
   passwords, and temporary secrets.
2. Delete the disposable Supabase project and test builds; record confirmation
   outside the public repository.
3. Confirm the reviewer has followed the agreed evidence and report-retention
   terms.
4. Track findings privately, remediate them on a dedicated branch, and provide
   the reviewer with the exact retest commit and build.
5. Commit only a non-sensitive completion summary after all Sprint 2 exit
   criteria are satisfied.
