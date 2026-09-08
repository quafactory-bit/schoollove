# Emergency stop / non-destructive backout

Use the smallest official, audited control matching the incident. Preserve all
accounts, profiles, relationships, notifications and forensic retention evidence.
Do not revert migrations, delete principals, or repair FK constraints as backout.

## Registration-only issue

Use public-account `set_launch_state` with `closed` and a safe reason code via
`/api/admin/public-account`. Official RPC:
`admin_set_public_account_launch_state('closed', reason, actor)`.
After migration45, closed rejects new unbound broker token exchanges; already
bound returning principals remain usable subject to their existing capability
gates. This is not revocation of already minted JWTs.

## Privacy, identity, RLS or cross-user exposure

Immediately use the public-account official state setter with
`emergency_stopped`. It closes owner writes and new broker token exchanges,
including returning exchanges. Independently stop controlled expansion with the
existing `/api/admin/beta` stop action / `admin_controlled_beta_stop`, using its
validated scope `people_search`, `connection_request` or global as warranted.
Never mutate feature tables directly. Messaging/Instagram have separate gates.

Existing safety disconnect/block/report and owner deletion rights must remain
available. A public launch stop is not a claim that all existing sessions have
been revoked; separately approved targeted session handling may be required for
identity compromise. Never output credentials in incident evidence.

## Verify / recover

Read back launch flags, rejected token/write contract, incident status and safe
data hashes. Do not execute live login or destructive deletion as a stop test.
If an operation has an uncertain outcome, inspect state before any retry.

Recovery from emergency must pass through closed, resolve the incident, record
fresh affirmative readiness and use the dedicated open RPC. Controlled-beta
reactivation likewise needs fresh readiness and its official reactivation RPC.
Never reuse pre-emergency readiness. No automatic reopening or beta extension.

Disposable evidence in this phase covers official emergency-stop owner-write
denial/data preservation and the ten-state/bound broker consumption matrix.
Remote emergency simulation is not performed on A/B/C.
