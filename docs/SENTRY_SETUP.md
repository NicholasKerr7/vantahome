# Sentry Setup (Expo)

## 1) Runtime (in-app) crash reporting
Set these in `.env`:
```
EXPO_PUBLIC_SENTRY_DSN=your-dsn
EXPO_PUBLIC_SENTRY_ENV=production
```

Default PII collection is disabled. Before transmission, VantaHome removes
user/request data, custom context, tags, extras, span/transaction names, and
breadcrumb payloads while retaining exception types and stack traces for crash
grouping.

## 2) Source map upload (build time)
Provide these environment variables in your CI/EAS build (do **not** put them in `.env`):
```
SENTRY_AUTH_TOKEN=...
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
```

After exporting production bundles and source maps to `dist`, run:
```
npm run sentry:sourcemaps
```

If you use EAS Build, add the vars to `eas.json` or your CI secrets.
