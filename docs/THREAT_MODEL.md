# VantaHome Threat Model

Status: refreshed for external Sprint 2 review on 2026-08-19. Revisit before
each alpha release and whenever a new integration, device category,
remote-access path, or service-role use is introduced.

## Assets

- Household identity, membership, roles, and room assignments
- Refresh tokens, hub-pairing credentials, Home Assistant tokens, broker
  credentials, recovery material, and device keys
- Camera streams/history and presence information
- Physical device state and safety/security controls
- Automations, commands, events, and audit history

## Trust boundaries

```text
person -> mobile biometric/session -> VantaHome app
       -> authenticated WSS/HTTPS -> Vanta Bridge
       -> private integration credentials -> Home Assistant/devices

mobile/bridge -> authenticated cloud API + RLS -> Vanta Cloud
service role  -> narrowly scoped Edge Function -> protected database tables
```

The mobile app, network, cloud broadcasts, integration payloads, and device
telemetry are untrusted inputs. Vanta Bridge and service-role functions are
privileged but must still validate inputs and minimize authority.

## Principal threats and controls

| Threat | Current control | Remaining work |
| --- | --- | --- |
| Extracted mobile secrets | SecureStore for native sessions; no public MQTT credentials | Migrate hub/HA credentials when pairing exists |
| Cross-home or cross-room access | RLS, exact device/home resolution, room-scoped voice discovery, and a rollback-only full role/device pgTAP matrix | Independent validation and continued matrix coverage as schemas evolve |
| Tenant/guest sensitive commands | Client/database action permissions plus per-member grants, denials, and manager UI | Independent bypass testing across mobile, API, database, camera, and voice paths |
| Replayed/duplicated commands | Nonce, expiry, command ID, unique idempotency keys | Bridge-side durable deduplication |
| False physical confirmation | Production optimistic confirmation disabled; client state writes revoked | Full bridge acknowledgement lifecycle |
| Oversized/malformed payloads | Shared bounded JSON/form validation on command, invite, audit, bootstrap, and voice functions | Maintain validation as endpoints are added |
| Partial invite acceptance | Row lock and transactional database function | Expiration cleanup and notification workflow |
| Service-role confused deputy | Audit resolves caller-visible devices; voice uses explicit room/role checks and server-only RPCs; database integration tests cover privileged paths | Independent source review and least-authority review whenever privileged endpoints change |
| Stolen unlocked phone | Biometrics for sensitive commands, camera viewing, and household-admin mutations in alpha/production | Validate platform behavior during alpha testing |
| Abuse/command flooding | Atomic actor/home/device command gates plus HMAC-keyed Edge actor/IP buckets | Tune production thresholds from structured operational events |
| Forwarded-IP spoofing | Ignore forwarding headers unless a trusted proxy hop count is configured; reject malformed chains | Verify the hosted proxy topology before setting production secrets |
| Authentication callback confusion | One exact native callback parser handles OAuth and password recovery; recovery requires the expected callback and session state | Independent deep-link, session-fixation, and token-leakage testing |
| Unauthorized camera access | Explicit `camera.live` checks constrain registry/state reads; alpha/production screens reauthenticate on focus | Independent API and mobile bypass testing plus real endpoint validation |

## Safety position

VantaHome augments certified smoke, CO, leak, security, and appliance hardware.
It is not a certified detector, alarm panel, emergency service, or substitute for
physical safety controls. Missing network, app, hub, or cloud connectivity must
not disable the certified device's native safety behavior.

## Service-role inventory

- `home-invite`: needed for Supabase Auth invitations and invite record creation;
  caller must already be owner/admin and room IDs are constrained to that home.
- `device-audit`: append-only use after caller-scoped device lookup.
- Voice OAuth helpers: service role is limited to private OAuth tables; tokens
  are provider-bound and refresh tokens expire and rotate. Voice
  discovery explicitly applies member/room scope; fulfillment calls the
  service-role-only `enqueue_voice_device_command` authorization transaction.
- `home-invite-respond`: service role removed; the authenticated caller invokes a
  single transactional security-definer function.
