# Home-First Pilot

Status: **preparation only; real-device readiness is not established**.
Make VantaHome dependable for one personal home before planning commercial use.
This guide follows the [Product Constitution](./PRODUCT_CONSTITUTION.md),
[Architecture](./ARCHITECTURE.md), and unchanged [Sprint 2 gates](./SPRINT_2.md).

## Equipment inventory

The owner reports having an Amazon Echo Dot and a Philips Hue light bulb.
Neither device has been verified through VantaHome.

- Echo Dot generation/model and firmware: unconfirmed.
- Hue bulb model, capabilities, firmware, and current pairing: unconfirmed.
- Hue Bridge availability/model: unconfirmed; awaiting the owner's reply.
- Existing Home Assistant installation and its host: unconfirmed; awaiting reply.
- An approved hub, integration transport, and compatible discovery/control path:
  not established. Do not infer them from the Echo or Hue product names.

Inventory what already exists before recommending equipment. The architecture
targets Home Assistant OS on an approved x86 host with Vanta Bridge; this is a
design target, not evidence that such a host is installed or a purchase request.

## Current implementation boundary

The release transport in `src/services/supabaseRealtime.ts` submits commands to
the authenticated `device-command` API and reads authorized observations. A
`created` queue result is not physical completion. The architecture still calls
the client transport interim; the trusted bridge observation writer and complete
dispatch/confirmation lifecycle remain integration work.

`src/services/mqttBridge.ts` is a development-only direct mobile transport, not
the production Vanta Bridge. Mock telemetry and the loopback realtime server
also do not prove discovery, pairing, hardware compatibility, or offline control.
Do not enable these paths in alpha/production to make an unfinished integration
appear functional.

## Smallest useful readiness path

1. Confirm the equipment inventory and choose one supported, existing light.
   Preserve its current working setup until an explicit test plan is approved.
2. Complete the bridge-side design and implementation: authenticated pairing,
   securely stored integration credentials, discovery with stable identities,
   and driver-reported capabilities intersected with the Vanta light interface.
3. Complete the command lifecycle: authorize, dispatch, handle retries and
   expiry, observe the physical result, then confirm. Keep rejected, expired,
   unavailable, and timed-out outcomes distinct from successful completion.
   Observations must carry trustworthy timestamps and must not be fabricated
   from command intent or an optimistic interface update.
4. Exercise those boundaries using clearly labeled synthetic fixtures first.
   Verify replay rejection, authorization loss, unavailable integrations, stale
   observations, restart recovery, and the absence of duplicate command effects.
5. Obtain the required independent review and explicit approval for controlled
   hardware verification. Follow the existing Sprint 2 prerequisites; personal
   use is not a waiver, and internal tests do not replace independent review.
6. Record supervised one-light evidence: automatic discovery; on/off and only
   genuinely supported additional controls; externally changed state reflected
   in the app; and truthful behavior through app restart, hub restart, and
   internet loss. Reconnect must not replay expired commands. Record failures
   and unknown state honestly rather than declaring the full gate passed.

Keep the existing premium interface and features. Limit this pilot's device
scope without removing other screens or enabling sensitive device categories.
Do not add subscriptions, new product features, hardware purchases, paid hosting,
or storage-heavy local infrastructure as an implied part of this plan.

## Evidence and environment separation

- **Synthetic tests:** use disposable, explicitly approved environments and
  invented accounts/devices. Local browser handoffs and hosted API assertions
  prove only their recorded test cases, not an Echo/Hue connection.
- **Personal home:** use a separately approved environment and credentials for
  real household information. Do not mix it with disposable fixtures, repoint
  the phone automatically, or run destructive test cleanup against it.
- **Future production:** establish separate customer infrastructure, credentials,
  access controls, backups, and release/rollback procedures before a commercial
  pilot. Do not promote personal data or testing secrets into customer service.

Keep raw device/account evidence and credentials out of the public repository.
Record the source revision, environment, expected outcome, observation, and
cleanup for each approved test; keep synthetic and physical results separate.

## Voice, later expansion, and commercialization

The [browser-linking work](./VOICE_ACCOUNT_LINKING.md) is separate from the
bridge's ability to control a light truthfully. Hosting a login page does not
establish physical completion. The current Sprint 2 browser/provider, ingress,
native, physical-completion, and independent-review gates remain open until
their evidence is verified; any scope change requires an explicit decision.

Consider a small commercial pilot only after those gates and the dependable
one-light slice pass, followed by customer isolation, recovery, update, support,
privacy, and operating-cost readiness checks. No commercial readiness is claimed.

The requested **LPG smart gas meter remains deferred for later**. Do not add gas
monitoring, gas-related automations, or safety-device control to this light pilot.
