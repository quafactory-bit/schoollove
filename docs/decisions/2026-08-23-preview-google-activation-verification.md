# 2026-08-23 Preview Google activation verification and Kakao pre-E2E audit

## Scope

This record freezes successful Preview-only Google activation evidence and
records read-only prerequisites for a separately approved first Kakao E2E. It
does not enable a provider, change launch state, or authorize a further attempt.

The verified Preview deployment is `dpl_5xoV1NxpdyBS1wyFbk7TJC8F1CDy` on
`preview.schoollove.kr`, READY from `preview` commit
`58ac7035b916ddf5d85159e5e5ecb422bab610cc`. Production `main` remains
`3b0bd3898e85285944f6b6d3da64776570e43ab9` and was not changed.

## Preconditions and Google execution history

1. The initial Google first-login path completed while launch was `closed`,
   resulting in one recovery-verified, Auth-principal-bound, provisional Google
   account and identity.
2. A bound-provisional same-Google reauthentication completed while `closed`
   without new recovery.
3. Readiness was recorded once (`closed` to `ready`), then controlled opening
   was recorded once (`ready` to `open`). Opening alone did not activate it.
4. Vercel Authentication initially prevented Supabase broker discovery,
   classified as `PREVIEW_OIDC_DISCOVERY_BLOCKED_BY_VERCEL_AUTHENTICATION`.
5. A separately approved short Preview-only Vercel Authentication window made
   discovery and JWKS reachable. One Google flow completed and reached
   `/account`; protection was restored immediately afterward.
6. That flow changed only the existing Google account and identity from
   `provisional` to `active`, without new recovery.

No email address, user identifier, broker subject, token, state, nonce,
authorization code, cookie, or secret is recorded here.

## Final Google evidence

| Check | Result |
| --- | --- |
| login attempts / transactions / upstream legs | `9 / 9 / 9` |
| broker codes (`expired` / `consumed`) | `4` (`1 / 3`) |
| recovery verifications / deliveries | `3 / 3` (delta `0 / 0`) |
| private accounts / identities | `1 / 1` |
| Auth users / identities / email identities | `1 / 1 / 0` |
| Google Custom Auth identity | exactly `1` |
| active accounts / identities | `1 / 1` |
| Google account / private identity | `active / active` |
| Google activation timestamps | both non-null and exactly equal |
| duplicate private/Auth mappings | `0 / 0` |
| terminal raw-context violations | transactions `0`, upstream legs `0` |

Classification: `PHASE_10P_PREVIEW_GOOGLE_BOUND_PROVISIONAL_ACTIVATION_VERIFIED`.
The Google path is frozen: no further Google attempt is part of this work.

## Vercel protection restore check

Unauthenticated runtime requests, made without a bypass or share credential,
received a Vercel SSO protection redirect (`302`), not public `200`, for both:

- `/.well-known/openid-configuration`
- `/.well-known/jwks.json`

This independently verifies that Preview Vercel Authentication is back on for
the tested authority paths. Only status and classification were retained; no
redirect parameter was recorded. No Vercel mutation was made during this audit.

## Kakao pre-E2E readiness

### Repository/runtime contract — verified

- Supabase provider identifier: `custom:schoollove-kakao`.
- Expected confidential broker client: `slb-supabase-kakao`.
- Broker issuer: `https://preview.schoollove.kr`.
- Supabase callback authority:
  `https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback`.
- Preview upstream callback:
  `https://preview.schoollove.kr/auth/social/callback/kakao`.
- The pinned Kakao request uses OIDC, PKCE, nonce validation, and exactly
  `openid`; it does not request email, nickname, profile image, friends,
  gender, birthday, or marketing data.
- The Preview configuration loader requires non-empty
  `SCHOOLLOVE_KAKAO_CLIENT_ID` and `SCHOOLLOVE_KAKAO_CLIENT_SECRET` together
  with every shared broker key before any provider can run. The verified Google
  Preview execution therefore proves this deployed Preview runtime loaded the
  complete configuration shape. Values were neither read nor printed.

### Supabase Custom Provider configuration — verified read-only

Independent value-redacted read-only evidence from the Preview Supabase project
classifies the following exact tuple as
`VERIFIED_FROM_PREVIEW_SUPABASE_READONLY`:

- identifier: `custom:schoollove-kakao`;
- provider type: `oidc`;
- enabled: `true`;
- client ID: `slb-supabase-kakao`;
- issuer: `https://preview.schoollove.kr`;
- scopes: exactly `["openid"]`;
- email optional: `true`;
- PKCE enabled: `true`;
- skip nonce check: `false`.

No client secret was read or exposed. The successful Preview runtime also
confirms that the Kakao key slots were present and structurally loadable without
reading their values. Vercel's environment-target assignment remains outside
this value-redacted Supabase configuration evidence.

### Kakao Developers console — operator confirmation required

- a separate Kakao Preview application exists;
- Web platform includes `https://preview.schoollove.kr`;
- Kakao Login is enabled;
- Kakao OpenID Connect is enabled;
- redirect URI is exactly
  `https://preview.schoollove.kr/auth/social/callback/kakao`;
- the client-secret feature is enabled and the secret remains server-side;
- no optional personal-information consent item is enabled.

Kakao has no live durable delta in this sequence: Kakao attempts are `0`.
No fixture was created and no Kakao provider request was sent.

## Vercel/OIDC caveat and freeze decision

With Vercel Standard Protection on, Supabase Custom OIDC server-side requests
to Preview discovery, JWKS, and token endpoints cannot reach the protected
broker authority. A future real Kakao or Naver Preview E2E consequently needs
either a separately approved short Preview-only protection window or a later
architecture separating public OIDC authority from protected Preview UI. This
audit changes neither option.

The next-provider gate remains closed until the operator supplies the Kakao
Developers confirmations. Any future first Kakao E2E is a first-login/recovery flow, not a
bound-provisional Google reauthentication, and needs its own expected-state
contract and approval.

## Safety ledger

- Supabase DB/Auth/launch mutation: `0`.
- Vercel mutation: `0`.
- Google, Kakao, and Naver provider calls: `0` during this audit.
- Auth email, Recovery Resend, and OTP: `0`.
- Production mutation: `0`.
- Code or migration change: `0`.
- Secret or PII disclosure: `0`.
