# PHASE 10O-I — Recovery delivery state boundary

## Status

Approved for local/Draft implementation only. This decision does not approve a public recovery route, email provider, sender credential, OAuth integration, Supabase Auth change, launch-state change, or Production migration apply.

## Frozen delivery policy

- A recovery delivery reservation has a DB-clock cooldown of **60 seconds** per login attempt.
- A login attempt has at most **3** delivery reservations, including its first reservation. A recovery address HMAC/key-version pair has at most **5** reservations in the trailing **24 hours**, across attempts.
- A reservation consumes a slot when the database creates it. `reserved`, `sent`, and `failed` all count. A transport failure never refunds a slot.
- The transaction order is fixed: lock attempt; check budgets; choose the reservation; only then supersede an old pending challenge; insert the exact preallocated challenge; insert ledger row; move the attempt to `recovery_pending`. A budget rejection preserves any old pending challenge and causes no delivery attempt.

## Durable ledger and service boundary

`private.recovery_delivery_attempts` retains only the verification/attempt binding, recovery HMAC and key version needed for the rolling budget, state, and timestamps. It never stores a raw address, OTP, message body, provider response, or upstream token. It is RLS-enabled and FORCE RLS with no direct table grant.

The only service-role transitions are atomic reserve, sent confirmation, and failed-delivery recording. The old standalone login-decision recovery-create RPC has no ordinary orchestration grant. OTP consumption requires the exact delivery row for that challenge to be `sent`; a `reserved` or `failed` row cannot be consumed.

## Transport

The implementation is server-only and exposes only an injected, fake in-memory transport for tests. No email HTTP client, provider SDK, runtime secret, or network call is introduced. Raw email and the eight-digit OTP are ephemeral preparation/delivery values and do not enter the database adapter or ledger.

## Verification and future work

Fresh local PostgreSQL acceptance covers sent gating, cooldown and both caps, failure terminal cleanup, RLS/grants, and independent-process same-attempt and same-address-cap races. A real sender, queue/worker, retries, and public recovery flow require a separate approved design and implementation phase.
