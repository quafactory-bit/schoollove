# PHASE 10O-S — Durable continuation recovery boundary

Q's crash audit found that the legacy three-step O claim/create-leg/bind flow can irrecoverably clear the only browser handle before a durable upstream binding exists. S leaves that historical contract intact and adds a separate continuation digest for the browser-bound authority.

The S path resolves without mutation, then atomically creates or resumes exactly one leg and binds it to the transaction. The browser credential is never stored raw. Before callback claim, the transaction keeps only the continuation digest and the leg holds an AES-256-GCM envelope containing raw upstream state and, for Google/Kakao, raw nonce. The AAD binds contract version, attempt ID, leg ID, provider, client-binding digest, and key version. A dedicated continuation key is required; recovery-email, downstream nonce, and PKCE verifier keys are not reused.

Callback claim removes the continuation digest and envelope. No upstream authorization code is stored for callback retry. A service-only expiry RPC can terminalize authoritative expired pending, legacy claimed, upstream-bound, and callback-claimed shapes, scrubbing transaction authority/raw downstream context and upstream state/nonce/PKCE/envelope material. There is deliberately no scheduler in S: bounded cleanup invocation or scheduling is an activation prerequisite. Public social login remains off.

## Verification baseline

The frozen baseline is `99efcd22c3d048a2eb545f3811069fba62291821`. Canonical public route-set comparison is the executable route-surface acceptance: the baseline and S each contain 95 distinct routes, with zero added and zero removed routes. The historical absolute `58 pages/routes` metric is retained as historical evidence, but is not reproducible from the frozen baseline and is not used as an S acceptance assertion.

After Docker recovery, the original J chained harness passed three times on both pristine baseline and S without semantic assertion failures. S isolated lifecycle, grant boundary, and direct-TCP race acceptance also passed, as did the J/M/N/O/P/R chained regressions. These results do not enable public social login or any Production change.
