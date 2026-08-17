# VantaHome Threat Model

Status: initial Sprint 2 model. Revisit before each alpha release and whenever a
new integration, device category, remote-access path, or service-role use is
introduced.

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
| Cross-home or cross-room access | RLS plus exact device/home resolution | Automated full role/device RLS matrix |
| Tenant/guest sensitive commands | Client and database action permissions | Per-member overrides and admin UI |
| Replayed/duplicated commands | Nonce, expiry, command ID, unique idempotency keys | Bridge-side durable deduplication |
| False physical confirmation | Production optimistic confirmation disabled; client state writes revoked | Full bridge acknowledgement lifecycle |
| Oversized/malformed payloads | Shared bounded JSON validation on hardened functions | Apply validator to every remaining Edge Function |
| Partial invite acceptance | Row lock and transactional database function | Expiration cleanup and notification workflow |
| Service-role confused deputy | Audit endpoint resolves exact RLS-visible device | Complete service-role inventory and tests |
| Stolen unlocked phone | Biometrics for sensitive commands in alpha/production | Protected camera viewing and admin mutations |
| Abuse/command flooding | Database command rate gate | Per-home/device limits and observability |

## Safety position

VantaHome augments certified smoke, CO, leak, security, and appliance hardware.
It is not a certified detector, alarm panel, emergency service, or substitute for
physical safety controls. Missing network, app, hub, or cloud connectivity must
not disable the certified device's native safety behavior.

## Service-role inventory

- `home-invite`: needed for Supabase Auth invitations and invite record creation;
  caller must already be owner/admin and room IDs are constrained to that home.
- `device-audit`: append-only use after caller-scoped device lookup.
- Voice OAuth/data helpers: privileged token and device access remains to be
  narrowed and covered by the Sprint 2 authorization test matrix.
- `home-invite-respond`: service role removed; the authenticated caller invokes a
  single transactional security-definer function.
