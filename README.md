# vantahome

VantaHome is a smart home control UI built with Expo and React Native. It focuses on a polished
mobile-first experience with seeded devices, scenes, and automations (no backend required to run).

## Features

- Home dashboard with room carousel, climate/lighting orbs, and quick actions.
- Device detail screens for lights, climate, media, appliances, security camera, and front gate.
- Scenes and automations with device state previews and ON highlighting.
- Profile, settings, notifications, onboarding, and management flows.

## Tech stack

- Expo SDK 54 + React Native 0.81
- Zustand store for local state
- Expo vector icons + gradients for the UI

## Quick start

Node 20 LTS is recommended.

```bash
npm install
npm start
```

Run a specific platform:

```bash
npm run ios
npm run android
npm run web
```

## Realtime dev server

Spin up a local WebSocket bridge and point the app to it in Settings → Realtime (Dev):

```bash
npm run realtime:server
```

Use `ws://<your-ip>:8088` for physical devices or simulators that cannot reach `localhost`.

## MQTT presence simulator

Send a one-off presence event over MQTT (useful for motion/camera sensor flows):

```bash
npm run mqtt:presence -- --url mqtt://localhost:1883 --room-name "Drawing Room"
```

Options:

- `--url` (or `EXPO_PUBLIC_MQTT_URL`)
- `--topic` (or `EXPO_PUBLIC_MQTT_TOPIC_STATE`, default: `vantahome/devices/state`)
- `--room` / `--room-name` (room is resolved from `roomsSeed` when possible)
- `--device` (fallback if no room id)
- `--kind` (known | unknown)
- `--source` (motion | camera | sensor)

If your broker requires auth, set `EXPO_PUBLIC_MQTT_USERNAME` and
`EXPO_PUBLIC_MQTT_PASSWORD`.

## Data and configuration

Seed data (devices, scenes, automations) lives in `src/store/useHomeStore.ts`.

## Auth (Google/Apple)

Social auth is powered by Supabase Auth. Set these in `.env`:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Then add your redirect URIs in Supabase → Auth → URL Configuration:

- `vantahome://auth-callback` (standalone/dev client)
- The Expo Go redirect returned by `AuthSession.makeRedirectUri()` (when using Expo Go)

Email/password uses Supabase Auth as well. If email confirmation is enabled in Supabase, new users will need to verify before signing in. Password reset emails are sent from Supabase.

## Self-hosted stack

See `docs/self-hosted/README.md` for the NUC + Frigate + CompreFace + Double Take setup.
