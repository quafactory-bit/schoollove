# PHASE 10O-H — recovery crypto preallocated-ID binding

Status: FROZEN for implementation; feature remains off.

Recovery OTP verification is intentionally before account creation, but its OTP
MAC must bind the challenge UUID and durable recovery-email AES-256-GCM AAD
must bind the final `private_accounts.id`. The server therefore preallocates
both UUIDs before it prepares crypto material.

- `challengeId` is created before OTP generation and is included in the OTP-MAC
  input. The service-only RPC inserts that exact UUID as
  `recovery_email_verifications.id`; it may not substitute a DB-generated ID.
- `reservedAccountId` is created before recovery-email encryption and is the
  account UUID used by the durable AAD: domain, account ID, fixed recovery
  ciphertext column, and encryption-key version.
- A reservation is not an account. It is allowed only on a pending,
  attempt-owned `login_decision` challenge and must be unique among pending
  challenges. On success without a prior recovery match, the account is
  inserted with exactly the reservation UUID.
- An active/provisional/unavailable recovery match never converts a reservation
  into an account and never attaches a second provider. Terminal challenge
  handling clears its reservation and all one-time crypto material.
- A resend supplies fresh challenge UUID, OTP, MAC, ciphertext, nonce, and may
  supply a fresh reservation. The superseded terminal challenge keeps none of
  that material.

This phase adds no public route, login control, provider integration, email
sender, environment secret, Auth user, or Production migration application.
