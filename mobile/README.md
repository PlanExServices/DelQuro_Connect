# DelQuro Connect for iPhone and Android

The Expo client signs in to the Connect FastAPI service. Huddle, Time Off, Schedule and Chat use native screens, and Settings includes account deletion, blocking, support and privacy.

## Local development

1. Start the backend with a synthetic workspace. See [the repository README](../README.md) for the in-memory development server.
2. In this directory run `npm ci` and copy `.env.example` to `.env.local`. Set `EXPO_PUBLIC_CONNECT_URL` to the local server’s origin. Use `http://10.0.2.2:8000` for the Android emulator. A distributed build needs an approved HTTPS origin. For browser development, add Expo’s web origin to the backend’s `CORS_ORIGINS`.
3. Run `npm start` or `npm run web`. Use `npm run typecheck` to check types. The browser preview uses a temporary session. Native builds persist a rotating refresh credential in secure storage.

## Store release

See [the release guide](../docs/MOBILE_STORE_RELEASE.md) for signing, review access, draft store listings, disclosures and device testing. The EAS config requires an owner-approved Expo project before remote builds. Set `EXPO_PUBLIC_CONNECT_REVIEW_URL` to the separate synthetic HTTPS service to enable the review workspace in the app.

The candidate depends on the companion backend and web policies in the same change. Review and deploy them together to an authorized environment before building against that service.
