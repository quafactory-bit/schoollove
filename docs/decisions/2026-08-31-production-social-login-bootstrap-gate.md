# Production social-login bootstrap gate

## Decision

Production external-auth setup needs a state where the SchoolLove OIDC issuer is
reachable for Supabase discovery validation without exposing a user-facing login
flow. The existing broker exposure switch therefore gains one server-only value:

- `off`: every broker and user-login route remains dark.
- `preview`: the already verified Preview broker and Google login surface remain active.
- `production-bootstrap`: only the Production discovery document and JWKS are active.
  The Google CTA, browser-facing Google start/callback/recovery/completion boundaries,
  and OIDC authorization/token endpoints remain dark.
- `production`: the Production OIDC issuer and the Google login surface are active.

`production-bootstrap` is valid only when `VERCEL_ENV=production`. Request host or
query data cannot select it. It uses the immutable Production issuer, Supabase
callback, downstream client ID, signing key ID, and Production-only credentials.

## Activation order

1. Keep exposure `off` while Production-only secrets and the ten approved migrations
   are prepared under separate authorization.
2. Deploy the code with exposure still `off`; `/login` must show no active Google CTA.
3. Set exposure to `production-bootstrap` and redeploy. Verify discovery and JWKS,
   while Google start/callback/recovery/completion and OIDC authorization/token stay
   unavailable.
4. Create `custom:schoollove-google` disabled from the verified issuer and compare its
   non-secret configuration with the Preview golden contract.
5. Enable the provider without changing issuer or discovery URL.
6. Set exposure to `production` and redeploy. Only this step exposes the Google CTA
   and browser login routes.
7. Run one separately approved controlled Production login smoke.

## Preserved boundaries

- Production public-account launch remains `closed` until separately approved.
- The bootstrap state cannot initiate Google login or create a browser login attempt.
- Preview behavior and its existing provider configuration are unchanged.
- Email OTP, Kakao, and Naver remain non-user-facing.
- No migration, database row, provider, credential, Vercel setting, or Production
  deployment is changed by the local implementation of this decision.
