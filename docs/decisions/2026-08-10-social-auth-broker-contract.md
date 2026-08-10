# PHASE 10O-D/10O-E — Social Auth Broker Contract

Date: 2026-08-10
Status: `PHASE_10O_D_SOCIAL_AUTH_CONTRACT_FROZEN`
Implementation stage: fake-only, feature-off broker core

## 1. Decision

SchoolLoveI will expose Kakao, Naver, and Google as the eventual public login choices through a provider-neutral broker operated by SchoolLoveI. The broker will be a complete OIDC issuer toward Supabase Auth. Upstream providers will not be configured directly as Supabase Auth providers.

This decision is an identity-boundary decision, not authorization to open registration. Production remains `closed` until a separate approval explicitly authorizes provider credentials, callback configuration, deployment, migrations, Auth integration, and launch-state changes.

## 2. Why automatic email linking is prohibited

An upstream email address is not a stable cross-provider person identifier. Provider email claims can be absent, reassigned, aliased, differently canonicalized, or controlled by different verification policies. Therefore SchoolLoveI will not:

- pass an upstream provider email to Supabase Auth;
- create or merge an identity because two providers report the same email;
- use Supabase automatic email identity linking;
- use provider-specific alias normalization to infer that two addresses are one person; or
- attach a newly presented provider identity to an existing SchoolLoveI account automatically.

Supabase Auth email remains `NULL` for broker-issued social identities. The broker `sub`, not an email address, is the authentication identity.

## 3. Provider-neutral identity

The accepted provider set is exactly `kakao`, `naver`, and `google`. The minimum verified upstream result contains only provider, upstream subject, issued-at time, authentication time, and verified protocol evidence. Email, name, nickname, profile image, phone, birthday, and gender are not broker identity fields.

The broker subject format is:

```text
slb:v1:<key-version>:<provider>:<digest>
```

The current planned key version is `k01`. The digest is the complete 32-byte HMAC-SHA-256 output encoded as base64url without padding. Domain separation is `schoollove:broker-subject:v1`. The HMAC input binds the exact provider enum and exact upstream-subject bytes using unambiguous length framing.

The upstream subject is not trimmed, lowercased, case-folded, or Unicode-normalized. It must never appear in returned broker subjects or safe logs. Production HMAC keys, rotation operations, and KMS custody are not part of PHASE 10O-E. Tests use fixed synthetic byte arrays only.

## 4. Recovery email is a separate subsystem

Before first service-account activation, the user must verify a recovery email using a separate SchoolLoveI recovery-email OTP subsystem. It is not Supabase Auth OTP, is not an upstream identity attribute, and is never emitted as an OIDC claim.

The canonical recovery-email form is frozen as follows:

1. Remove only leading and trailing ASCII whitespace from the entire input before validation.
2. Split the trimmed input at the email address boundary into local part and domain.
3. Preserve the user-verified local part exactly from that point onward.
4. Do not lowercase or case-fold the local part.
5. Do not apply Unicode normalization to the local part.
6. Do not remove `+tag` content.
7. Do not remove dots.
8. Do not apply provider-specific alias rules.
9. Convert only the domain to IDNA ASCII and lowercase that ASCII domain.
10. Calculate `recovery_email_hmac` uniqueness from exactly this canonical form.

No recovery-email OTP sender, persistence, HMAC key, route, or UI is implemented in PHASE 10O-E.

## 5. Account binding rules

- `primary_provider` is fixed by the first completed service-account activation and is immutable afterward.
- A different provider identity is never attached automatically.
- Email equality alone never merges accounts or identities.
- Recovery and explicit cross-provider linking require a separately approved protocol with step-up verification and an auditable user action.
- PASS and phone identity verification are outside the current scope.
- The existing Supabase email OTP route remains unchanged in this phase, but the frozen direction is to remove it from the eventual ordinary-user login path after the broker and recovery contracts are separately completed and approved.

## 6. Protocol security contract

Each upstream authorization leg has independent state, PKCE, and, for fake Kakao/Google OIDC legs, nonce bindings. Values are not shared between legs.

- State uses at least 256 bits from a CSPRNG, stores only a domain-separated digest, compares fixed-length digests in constant time, and is consumed once.
- PKCE permits only `S256`. `plain`, malformed/low-entropy verifiers, and mismatches fail closed.
- Nonce stores only a domain-separated digest, is verified by the broker, and is consumed once.
- Provider substitution and OAuth mix-up fail before identity acceptance.
- Login attempts and authorization codes are terminal after consumption or failure.
- Authorization codes expire after 60 seconds and bind exact client ID, exact redirect URI, and PKCE challenge.
- Concurrent authorization-code or attempt consumption permits exactly one success.
- Refresh tokens are not part of the fake issuer contract.

## 7. OIDC issuer contract

The fake issuer models discovery metadata, authorization and token endpoints, public JWKS, authorization codes, and minimal ID-token claims. Broker ID tokens contain only `iss`, `aud`, `sub`, `iat`, `exp`, and `auth_time`.

They must not contain email, `email_verified`, name, nickname, picture, phone, upstream tokens, or recovery email. PHASE 10O-E uses only an ephemeral in-memory RSA test key and signs with RS256. No private key file is stored or committed, and no internet-accessible issuer or route is created.

The frozen Production direction remains RS256 with a versioned `kid` and KMS/HSM custody. PHASE 10O-E does not implement or use Production key custody, key rotation, or a Production signing key.

## 8. Safe logging

Allowed event names are `attempt_created`, `provider_callback_success`, `recovery_required`, `broker_code_issued`, `attempt_rejected`, and `attempt_consumed`.

Logs must not include raw upstream subjects, raw state, raw nonce, PKCE verifiers, authorization codes, tokens, recovery email, provider response bodies, or complete OAuth callback queries. The core log serializer accepts only a fixed safe schema.

## 9. Feature-off rollout

PHASE 10O-E is dark code only:

- no public broker route;
- no `/login` UI change;
- no middleware change;
- no email OTP route change;
- no account/onboarding/profile/membership change;
- no runtime environment variable;
- no provider network client;
- no Supabase Auth or database write; and
- no Production deployment or launch-state change.

Later work requires separate review and approval for each boundary: durable attempt/code storage, recovery-email OTP, production key custody and rotation, provider-specific protocol adapters, broker HTTP/OIDC routes, Supabase Auth integration, explicit account activation, cross-provider recovery/linking, UI rollout, Preview security verification, and finally Production open readiness.

## 10. Current exclusions

PHASE 10O-E does not configure Kakao Developers, Naver Developers, Google Cloud OAuth, Supabase Auth providers, Vercel secrets, callbacks, Production keys, PASS, real email delivery, real OAuth login, real Auth users, database schemas, migrations, or Production data.
