# Contributing to VantaHome

Thank you for helping improve VantaHome. Changes should preserve the product
direction in [Product Constitution](docs/PRODUCT_CONSTITUTION.md) and the trust
boundaries in [Architecture](docs/ARCHITECTURE.md).

## Development setup

Use Node.js 20 LTS and install the locked dependencies:

```bash
npm install
```

Start Expo for the platform being tested:

```bash
npm start
npm run web
npm run ios
npm run android
```

Docker is not required for ordinary application development. Prefer the web
target, unit tests, and remote disposable database projects when local storage
is constrained. See the low-storage workflow in [README](README.md).

## Required verification

Run the complete local gate before committing:

```bash
npm run verify
npm run build
npm run security:secrets
```

`npm run verify` checks the application and Edge Function TypeScript, dependency
security policy, release metadata, authentication redirects, and all Jest
tests. The production web export must also complete without an error.

Add or update tests whenever behavior, authorization, data validation, command
handling, layout policy, or release configuration changes. Use a physical
device for the final native smoke test before a release build.

## Product and interface rules

- Preserve the existing premium visual identity and dedicated device screens.
- Keep phones portrait-only; tablets support portrait and landscape.
- Maintain usable safe-area spacing, internal scrolling, and reachable bottom
  navigation across supported viewports.
- Reuse design tokens and responsive helpers instead of introducing isolated
  styling systems.
- Add concise comments when security reasoning, compatibility behavior, or a
  non-obvious layout constraint would otherwise be difficult to understand.
- Do not show a device command as physically confirmed until the authoritative
  integration reports the resulting state.

## Security requirements

- Never commit credentials, tokens, private keys, `.env` files, customer data,
  or production database exports.
- Public Expo variables may contain only values safe to embed in the compiled
  application. They must never contain broker passwords or private keys.
- Treat mobile clients, network payloads, integration data, and device
  telemetry as untrusted input.
- Enforce authorization at the database or privileged service boundary, not
  only in the interface.
- Keep commands typed, bounded, expiring, idempotent, and auditable.
- Use only an explicitly confirmed disposable Supabase project for destructive
  database tests.
- Keep vulnerability findings and temporary review credentials out of the
  public repository and issue tracker.

## Code practices

- Keep TypeScript types explicit at transport and persistence boundaries.
- Validate incoming data before it reaches stores or command execution.
- Prefer focused modules and small changes over unrelated rewrites.
- Preserve backward compatibility unless a documented migration accompanies
  the change.
- Avoid silent failure for security-critical behavior; return a safe user-facing
  result and emit privacy-safe operational context where appropriate.
- Do not add placeholder production behavior or unlabeled seeded data.

## Git workflow

- Create focused commits with descriptive messages.
- Do not mix unrelated local changes into a commit.
- Run `git diff --check` before committing.
- Push the working branch and wait for the GitHub `Verify` workflow to pass.
- Never rewrite shared history or force-push without explicit maintainer
  approval.

## Documentation

Update the relevant sprint, architecture, security, release, or QA document
when a change alters a gate, trust boundary, supported platform, operational
requirement, or verification procedure.
