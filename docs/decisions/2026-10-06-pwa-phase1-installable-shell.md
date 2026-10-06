# 2026-10-06 — PWA Phase 1 installable shell

## Decision

The user approved an installable Progressive Web App shell for SchoolLoveI before any web-push work begins.

Phase 1 adds only metadata, static assets and client-side install affordances:

- `app/manifest.ts` is the single linked web app manifest.
- The app starts at `/?source=pwa`, remains scoped to `/`, and uses standalone portrait display.
- A dependency-free service worker caches only `/offline.html` and intercepts only same-origin navigation requests. HTML, APIs, images and third-party resources are never stored by the service worker.
- The install prompt appears outside `/admin`, only after two page views, outside standalone mode, and after a fourteen-day dismissal window. Android uses the browser install prompt; iOS Safari shows manual add-to-home-screen guidance.
- Existing SSR, route metadata, school URL hierarchy, authentication, APIs, database behavior and administrator boundaries remain unchanged.

## Icons

The obsolete Korean-symbol application icon is replaced with a monochrome heart plus `SchoolLove` wordmark. The maskable icon keeps the complete mark inside the central safe area. The website SNS logo decision remains unchanged; this PWA icon is the monochrome application-shell variant requested for Phase 1.

## Deferred work

Web push, subscriptions, VAPID keys, notification delivery, database schema changes, registration hooks and administrator test notifications remain Phase 2. Phase 2 requires a separate user verification checkpoint and approval.
