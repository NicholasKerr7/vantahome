# Independent Security Review Brief

Status: **ready for external scoping and quotation**

- Prepared: 2026-08-18; refreshed: 2026-08-19
- Repository: `NicholasKerr7/vantahome` (public)
- Quotation baseline sent: `e1b8ea073b4892fb6655c1761d2795bfd8b80444`
- Testing baseline: **not frozen; select only after written scope agreement**

The quotation baseline identifies the repository state referenced by the first
inquiry; it does not authorize testing. Freeze the final testing commit using
the [Security Review Baseline Checklist](./SECURITY_REVIEW_BASELINE_CHECKLIST.md).

## Objective

Independently verify that a VantaHome user, device, integration, or public
caller cannot read, modify, or command an unauthorized household, room,
device, capability, camera, or administrative action.

This review is the final Sprint 2 gate before work begins on the first physical
Home Assistant device integration. Automated tests and internal review are
supporting evidence, not substitutes for this assessment.

## System in scope

- Expo SDK 54 / React Native 0.81 mobile application written in TypeScript.
- Supabase Auth, PostgreSQL, Row Level Security, RPCs, and 11 SQL migrations.
- Eleven Deno Edge Functions, including device commands, device state, audit,
  household bootstrap/invitations, OAuth, and Alexa/Google fulfillment.
- Native session persistence through iOS Keychain and Android Keystore via
  Expo SecureStore.
- Action-level permissions, room assignment, member overrides, protected
  reauthentication, command expiry/nonces/idempotency, and actor/home/device
  rate limits.
- Native deep-link handling for OAuth and password recovery.
- Privacy-safe operational events and optional Sentry integration.

The current candidate contains 180 TypeScript files and 51,194 lines across the
application and Edge Functions, with 11 SQL migrations and 11 Edge Functions.
The automated gate currently has 220 passing tests, including database
authorization and migration guardrails. Recalculate these inventory figures at
the final frozen commit rather than treating them as engagement identifiers.

## Requested work packages

### WP1 — Architecture and threat-model review

- Review [Architecture](./ARCHITECTURE.md),
  [Product Constitution](./PRODUCT_CONSTITUTION.md), and
  [Threat Model](./THREAT_MODEL.md).
- Challenge trust boundaries, attacker assumptions, service-role use, and the
  security model for future local-hub pairing.
- Identify missing abuse cases and systemic weaknesses before Sprint 3.

### WP2 — Mobile application and authentication review

- White-box review of session storage, sign-in, OAuth callbacks, password
  recovery, deep links, biometric gates, and authorization decisions.
- Test for callback confusion, session fixation, token leakage, insecure local
  persistence, client-side authorization bypass, and sensitive-data exposure.
- Review release configuration and the boundary between public Expo variables
  and secrets.

### WP3 — Supabase, API, and database authorization review

- Review all Edge Functions, SQL migrations, RLS policies, grants, RPCs,
  security-definer functions, and service-role paths.
- Test cross-household, cross-room, role-escalation, permission-override,
  invitation, camera, command, and audit-log access.
- Test malformed and oversized requests, replay/idempotency failures, command
  expiry, concurrency, and actor/home/device rate-limit bypass.
- Review OAuth code exchange, provider binding, refresh-token rotation, public
  endpoint abuse controls, trusted-proxy handling, and identity hashing.

### WP4 — Dynamic validation and remediation review

- Perform authenticated grey-box testing against an isolated disposable
  Supabase project with owner, admin, member, tenant, and guest accounts.
- Validate representative exploit paths against the mobile/API boundary.
- Retest remediated critical and high findings and provide a closure statement.

## Explicit exclusions

- Social engineering, denial-of-service load generation, and destructive tests.
- Testing the active production Supabase project or any real household data.
- Amazon, Google, Apple, Sentry, or Supabase infrastructure outside VantaHome's
  own configuration and integration code.
- Home Assistant, Vanta Bridge, physical-device firmware, and physical-device
  command confirmation, which do not exist in the Sprint 2 baseline.

Any requested scope expansion requires written approval before testing.

## Test environment and access

VantaHome will provide, after agreement and under an approved rules-of-engagement
document:

- Read-only access to the pinned public repository baseline.
- A disposable Supabase project that is not the active app project.
- Synthetic test data and separate accounts for each household role.
- Test application builds when dynamic mobile testing begins.
- A secure channel for temporary credentials and vulnerability disclosure.

Provisioning, persona creation, reviewer handoff, and teardown follow the
[Security Review Environment Runbook](./SECURITY_REVIEW_ENVIRONMENT.md).

No credentials, tokens, customer data, or private keys will be placed in the
repository, email body, issue tracker, or final public report.

## Required deliverables

- Kickoff and agreed rules of engagement.
- Written report with severity, affected component, reproduction steps,
  exploit impact, evidence, and actionable remediation for every finding.
- Architecture-level observations in addition to individual vulnerabilities.
- Readout meeting with the reviewer and engineering owner.
- At least one retest window for remediated critical and high findings.
- Final retest status or attestation suitable for the Sprint 2 gate record.

## Exit criteria

Sprint 2 closes only when:

- No critical or high finding remains open.
- Every medium finding is fixed or explicitly risk-accepted with rationale.
- Retesting confirms the agreed critical/high remediations.
- The final report and remediation tracker are stored outside the public
  repository, with only a non-sensitive completion summary committed here.

## Questions for quotations

Vendors should state:

- Recommended work packages, reviewer count, effort, schedule, and earliest
  start date.
- Fixed or estimated price and payment terms.
- Relevant Expo/React Native, Supabase/PostgreSQL RLS, OAuth, and smart-home or
  IoT application experience.
- Whether source review, dynamic mobile/API testing, report, readout, and
  remediation retesting are included.
- NDA, data handling, tester location, professional liability coverage, and
  report-retention terms.
