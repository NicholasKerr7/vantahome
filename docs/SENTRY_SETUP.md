# Sentry Setup (Expo)

## 1) Runtime (in-app) crash reporting
Set these in `.env`:
```
EXPO_PUBLIC_SENTRY_DSN=your-dsn
EXPO_PUBLIC_SENTRY_ENV=production
```

## 2) Source map upload (build time)
Provide these environment variables in your CI/EAS build (do **not** put them in `.env`):
```
SENTRY_AUTH_TOKEN=...
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
```

Then run:
```
npm run sentry:sourcemaps
```

If you use EAS Build, add the vars to `eas.json` or your CI secrets.
