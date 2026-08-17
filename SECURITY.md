# Security Policy

## Supported Branch

Security fixes are handled on the `main` branch.

## Secrets and Sensitive Data

Do not commit secrets, API keys, tokens, passwords, private keys, production credentials, database URLs, or `.env` files to this repository.

Use local environment files that are ignored by Git, and provide only safe placeholder values in `.env.example` when needed.

Native authentication sessions are stored through Expo SecureStore. Never move
refresh tokens, hub-pairing credentials, Home Assistant tokens, recovery
material, device keys, or broker credentials into AsyncStorage or
`EXPO_PUBLIC_*` variables.

## Command Security

Device control is authorized by action as well as household and room access.
Commands require a short-lived envelope containing a command ID, nonce,
idempotency key, creation time, and expiry. Direct client writes to flexible
`device_state` JSON are prohibited; trusted bridge observations update physical
state. Sensitive actions fail closed and require local biometric confirmation in
alpha and production modes.

See [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) for trust boundaries and
[`docs/SPRINT_2.md`](docs/SPRINT_2.md) for current implementation status.

## Reporting a Security Issue

If you find a security issue, do not open a public issue with sensitive details. Contact the repository owner privately first.
