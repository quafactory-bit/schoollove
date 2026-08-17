# Social provider registration readiness

Status: `PROVIDER_REGISTRATION_OPERATOR_READY` — registration values are frozen, but no provider application, credential, route, login control, or Production configuration has been created or enabled.

## Scope and non-goals

This document is the single registration runbook for Google, Kakao, and Naver. It freezes future console values from the merged dark broker contracts. It does **not** activate any public route, create an OAuth application, receive a credential, make a provider request, or change `/login`. Existing email OTP remains the only user-facing login method until separately approved real-provider parity is complete.

## Frozen SchoolLove URLs

The canonical public origin is `https://www.schoollove.kr`. Register these provider-to-SchoolLove callback URIs exactly, including scheme, host, path, casing, and no trailing slash:

| Provider | Future callback URI |
| --- | --- |
| Google | `https://www.schoollove.kr/auth/social/callback/google` |
| Kakao | `https://www.schoollove.kr/auth/social/callback/kakao` |
| Naver | `https://www.schoollove.kr/auth/social/callback/naver` |

These paths are frozen here because the implementation now contains hard-off callback adapters, not an enabled social surface. Registering a different path, normalizing a trailing slash, or later substituting a Preview URL is forbidden; Preview and Production use separate provider applications with the same canonical path on their respective owned origins only when a future activation approval explicitly enables that route.

The future SchoolLove-to-Supabase/custom-OIDC public surface is also frozen but remains hard-off:

| Downstream value | Frozen future URL |
| --- | --- |
| issuer | `https://www.schoollove.kr` |
| discovery | `https://www.schoollove.kr/.well-known/openid-configuration` |
| JWKS | `https://www.schoollove.kr/.well-known/jwks.json` |
| authorize | `https://www.schoollove.kr/oauth/authorize` |
| token | `https://www.schoollove.kr/oauth/token` |

The eventual static downstream client mapping remains:

| Supabase custom provider | Broker `client_id` | Upstream provider |
| --- | --- | --- |
| `custom:schoollove-kakao` | `slb-supabase-kakao` | Kakao |
| `custom:schoollove-naver` | `slb-supabase-naver` | Naver |
| `custom:schoollove-google` | `slb-supabase-google` | Google |

The future Supabase callback URI is a downstream registered-client value, not a provider-console value. It must be copied exactly from the future Supabase Custom OIDC configuration during that separately approved step; do not guess or register it now.

## Data minimization and verifier contracts

The broker needs only a stable upstream subject to derive its namespaced broker subject. It must never use upstream email, name, nickname, image, contacts, friends, birthday, gender, marketing data, or raw upstream tokens as public identity data.

| Provider | Frozen minimum request | Required verified result | Explicitly not requested/retained |
| --- | --- | --- | --- |
| Google | `openid profile`; `email` is not requested. | OIDC ID token: exact client/redirect binding; issuer, audience, RS256/JWKS/`kid` signature, `exp`, `iat`, nonce digest, then `sub` only. Any returned profile claim is discarded immediately. | email, name, picture, locale, profile URL, contacts, refresh token. |
| Kakao | `openid` only; no additional consent item. | OIDC ID token: exact client/redirect binding; Kakao issuer, audience, RS256/JWKS/`kid` signature, `exp`, `iat`, nonce digest, then `sub` only. | Kakao account email, nickname, profile image, friends, gender, birthday, marketing data. |
| Naver | No optional member-information fields. | OAuth token exchange at the pinned endpoint, then pinned profile endpoint with `resultcode` success and a non-empty `response.id` only. | name, nickname, email, profile image, age, gender, birthday, mobile, contacts. |

Google and Kakao use the durable PKCE and OIDC verifier already tested in the dark broker. Naver remains OAuth-only: it has no invented OIDC nonce validation. Raw upstream subject is used only to derive the broker subject and never becomes the downstream `sub`.

## Provider-console inventory

### Google

| Console field | Frozen value/action |
| --- | --- |
| Project and client type | A dedicated **Web application** OAuth client in a separate Preview project/application and Production project/application. |
| Authorized redirect URI | `https://www.schoollove.kr/auth/social/callback/google` for Production only; Preview uses its future owned Preview origin with the identical path after separate approval. |
| Authorized JavaScript origins | None for this server-side redirect flow unless a separately approved browser SDK requires one. |
| Expected issuer | `https://accounts.google.com` (the verifier also recognizes the provider's permitted issuer form already pinned in code). |
| Client ID slot | `<GOOGLE_CLIENT_ID>` → `SCHOOLLOVE_GOOGLE_CLIENT_ID`. |
| Client secret slot | `<GOOGLE_CLIENT_SECRET>` → `SCHOOLLOVE_GOOGLE_CLIENT_SECRET`. |
| Scope | `openid profile`; do not add `email`. |
| Consent/branding | Configure the owned `www.schoollove.kr` homepage, privacy URL, and terms URL; do not add sensitive scopes. |

### Kakao

| Console field | Frozen value/action |
| --- | --- |
| App/platform | Separate Preview and Production Kakao apps. Add the owned web platform/site origin only for that environment. |
| Kakao Login | Enable only during the controlled Preview activation step; enable Kakao OpenID Connect because the broker verifies an ID token. |
| Redirect URI | `https://www.schoollove.kr/auth/social/callback/kakao` for Production; Preview uses its future owned Preview origin with identical path after separate approval. |
| Client identifier role | Kakao REST API key → `<KAKAO_REST_API_KEY>` → `SCHOOLLOVE_KAKAO_CLIENT_ID`. |
| Client secret | Enable the REST API-key client-secret feature when the application is activated; `<KAKAO_CLIENT_SECRET>` → `SCHOOLLOVE_KAKAO_CLIENT_SECRET`. |
| Consent items | No optional personal-information consent item. Request `openid` only. |

### Naver

| Console field | Frozen value/action |
| --- | --- |
| Application type | Web application, separate Preview and Production applications. |
| Service URL | `https://www.schoollove.kr/` for Production. |
| Callback URL | `https://www.schoollove.kr/auth/social/callback/naver` for Production; Preview uses its future owned Preview origin with identical path only after separate approval. |
| Client ID slot | `<NAVER_CLIENT_ID>` → `SCHOOLLOVE_NAVER_CLIENT_ID`. |
| Client secret slot | `<NAVER_CLIENT_SECRET>` → `SCHOOLLOVE_NAVER_CLIENT_SECRET`. |
| Member information | Stable provider `id` only; leave all optional profile/member-information fields disabled. |
| Review/verification | Prefer a company/organization owner account where available. Complete any Naver application review required for the web service and the ID-only member-information contract before Preview activation. |

## Secret custody

All of these names are server-only configuration slots, not existing environment variables and not values to create in this task:

```
SCHOOLLOVE_GOOGLE_CLIENT_ID
SCHOOLLOVE_GOOGLE_CLIENT_SECRET
SCHOOLLOVE_KAKAO_CLIENT_ID
SCHOOLLOVE_KAKAO_CLIENT_SECRET
SCHOOLLOVE_NAVER_CLIENT_ID
SCHOOLLOVE_NAVER_CLIENT_SECRET
SCHOOLLOVE_SOCIAL_BROKER_UPSTREAM_CONTINUATION_KEY_V1
SCHOOLLOVE_SOCIAL_BROKER_BROWSER_SESSION_KEY_V1
```

Each Preview secret is distinct from its Production counterpart and is stored only in the server-side secret store. None may enter Git, test fixtures, browser JavaScript, `NEXT_PUBLIC_*`, logs, or provider redirect URLs. `SCHOOLLOVE_SOCIAL_BROKER_UPSTREAM_CONTINUATION_KEY_V1` is a dedicated, versioned encryption key for restart-safe continuation envelopes; it must never be a provider secret, downstream client secret, nonce key, PKCE key, broker-subject key, or recovery-email key. Rotation is versioned and retains old material only for the bounded decrypt window.

`SCHOOLLOVE_SOCIAL_BROKER_BROWSER_SESSION_KEY_V1` is a separate, versioned 32-byte server-only key for an opaque, AES-GCM-sealed browser-continuity cookie. The cookie is `__Host-` scoped, `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`, and has a 10-minute maximum lifetime. It carries only the opaque broker handle and independent browser-binding secret; it carries no provider token, authorization code, state, nonce, PKCE verifier, or database plaintext. It must never reuse any provider secret, continuation key, PKCE key, downstream nonce key, broker-subject key, or recovery-email key.

## Stable Preview callback-origin prerequisite

No stable, owned Preview callback origin is recorded in this repository. Random `*.vercel.app` deployment hosts are not an acceptable provider callback authority. Before Preview credentials or the `preview` broker-exposure mode can be enabled, an operator must bind one stable owned HTTPS origin — recommended: `https://preview.schoollove.kr` — to the intended Vercel Preview deployment and configure its DNS/TLS ownership. Register the three Preview callbacks with that origin and the same frozen paths. This repository change does not create DNS, Vercel domain bindings, or environment values.

## Frozen Preview-first activation order

1. Create the three provider developer applications manually.
2. Obtain each client ID and secret outside the repository.
3. Set Preview-only server secrets.
4. Keep Production social feature hard-off.
5. Enable the approved callback and broker routes only in controlled Preview.
6. Run one real Google login, then Kakao, then Naver.
7. Run provider failure, replay, cross-session, and mobile checks.
8. Complete provider review/verification where required.
9. Set separate Production server secrets.
10. Deploy Production with the social feature still hard-off.
11. Perform final launch-readiness review.
12. Only then, under separate approval, expose `카카오로 계속하기`, `네이버로 계속하기`, and `Google로 계속하기` on `/login`.

Email OTP remains visible and operational throughout this sequence. Any email-OTP retirement is a separate product and migration decision.

## Operator checklist — manual actions only

### Google

- Sign in to Google Cloud, create/select a dedicated Web application OAuth client, and configure consent/branding for `https://www.schoollove.kr/`.
- Paste the Production authorized redirect URI exactly: `https://www.schoollove.kr/auth/social/callback/google`.
- Record the issued client ID and secret only in the future server-side slots `<GOOGLE_CLIENT_ID>` and `<GOOGLE_CLIENT_SECRET>`; do not paste them into this repository or a browser setting.
- Keep requested identity scope at `openid profile`; do not add `email`, and discard all returned profile claims other than verified `sub`.

### Kakao

- Sign in to Kakao Developers and create a separate Production app; configure the owned web platform/site origin `https://www.schoollove.kr`.
- When Preview activation is separately approved, enable Kakao Login and OpenID Connect, then paste the redirect URI exactly: `https://www.schoollove.kr/auth/social/callback/kakao`.
- Use the REST API key as `<KAKAO_REST_API_KEY>` and enable/store the client secret as `<KAKAO_CLIENT_SECRET>` only in server-side custody.
- Keep consent to `openid` only; do not enable email, profile, or other personal-information consent items.

### Naver

- Sign in to Naver Developers and register a separate Production Web application.
- Paste service URL `https://www.schoollove.kr/` and callback URL `https://www.schoollove.kr/auth/social/callback/naver` exactly.
- Store `<NAVER_CLIENT_ID>` and `<NAVER_CLIENT_SECRET>` only in the future server-side secret store.
- Select only the stable member ID; complete any required web-service review before controlled Preview activation.

## Evidence and references

The merged broker pins Google/Kakao/Naver endpoints and validates the above upstream results without activating routes. Google requires exact registered redirect URI matching for a web OAuth client, and Kakao requires Kakao Login plus a registered redirect URI; Kakao OIDC requires `openid`. See [Google OAuth web-server guidance](https://developers.google.com/identity/protocols/oauth2/web-server), [Kakao Login prerequisites](https://developers.kakao.com/docs/en/kakaologin/prerequisite), and [Kakao REST API guidance](https://developers.kakao.com/docs/en/kakaologin/rest-api).
