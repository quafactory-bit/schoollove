# PR100 class-history hardening

Approved follow-up on the existing Draft branch. Migration 44 is unapplied remotely and is revised in place; no extra migration or schema object is authorized.

Class-history editing has a separate capability from school/profile creation. The DB accepts public school-membership authority, exact claimed onboarding school authority, or a current active exact People Discovery contract with live people_search and an exact target-school membership. Adult, private-profile, deletion, suspension and global emergency checks remain mandatory. Other account writes and flags are not widened.

Same-class search acquires the same transaction user-lock namespace as editing, in deterministic actor/receiver UUID order. After locking it revalidates actor history and capability, the original unique receiver, school/name/history/adult state and pair safety before token creation. Existing exact-person SQL is not changed. Empty/no-op behavior and established relations remain preserved.

Verification uses schema-only Preview 43 cloned into disposable PostgreSQL. Two real SQL sessions and observed lock-wait barriers must prove edit-wins and search-wins serialization, including actor and receiver editing. No live A/B search or mutation, remote migration, merge, protection/env change or Production deployment is allowed. PR remains Draft.

## Final local evidence — 2026-09-07

### Authority and migration

- Starting PR100 head: `5a1942208fd20d6e98d1e7152183d3c657fd72a1`; tree `9c03076ed70390957bc60ab5cb34e7c41502c6e1`.
- Canonical Preview remains `2952a6c4e450736a963ef6fc911859afe0c6b137`; Production main remains `bee7988f487f0289f173b6f2508bdbd128636bbc`. Their tree is `7a42291fbcf142495be237ec61246718fa75e943`.
- Same migration filename: `20260907031506_class_history_self_service.sql`. Exactly one unapplied forward migration in PR; old migration42 unchanged.
- Revised LF SHA-256: `060994b246e91d53db6caa579b2b9d36a5655efbfb001afc8c70bf41f287dadb`. The previous `f3bc093c...` hash is obsolete.
- Follow-up commit/tree, final Draft/mergeable state and feature deployment source SHA/ID are recorded in the updated PR body and final handoff after push, rather than guessed before commit.

### Access proof

Synthetic deployed-schema fixture: current adult/consents, active private profiles, existing high-school/year membership, exact active snapshot-backed PD members, `people_search=true`, `private_profile=false`, closed public launch, all account-write flags false, no onboarding claim. The effective public school-membership write path is false. Note that the deployed `public_account_access_active` function uses `auth.uid()`; a service query without that identity and an owner-session query are not interchangeable measurements.

| Case | Result |
| --- | --- |
| PD current-A/B-like existing target-school history | PASS, edit allowed |
| Same actor new school create and private profile edit | Both denied; membership count/name unchanged |
| Owner membership in a different school | Generic denial |
| PD expired / emergency / people_search disabled | Each denied |
| Exact Instagram-only snapshot (max_users=3), Instagram enabled, no PD | Denied |
| Suspended / deletion pending / global emergency | Each denied |
| Public open + school_membership enabled + adult owner | Allowed |
| Public closed, no beta authority | Denied |
| Exact live claimed onboarding school | Allowed |
| Claim mismatch / expired / consumed without active PD | Each denied |

### Replacement, tokens and search

- Full replace, zero/multiple/fewer rows, clear/re-add, strict validation, K12 limits, non-K12 clear-only, owner denial and atomic insertion-failure rollback passed.
- Normalized no-op preserves rows/timestamps/tokens. Real edit removes only unused live actor/receiver tokens; used, expired and unrelated tokens remain. Parent school/year/owner/profile/legacy class_number unchanged.
- Same-class new history returns only opaque token; old/clear, wrong actor grade/class/year, missing actor/receiver history, wrong receiver grade/class/school/year, non-K12, duplicate receiver, block, existing request and active connection return the exact generic unavailable shape.
- Legacy exact-person success and generic miss passed; its deployed function definition is byte-for-byte unchanged. Membership-create definition unchanged.
- Same-class definition intentionally changes. Signature, two-field opaque response, SECURITY DEFINER/empty search_path and service-role-only execution remain. No personal matching reason is returned.

### Deterministic two-session concurrency

`verify-concurrency.cjs` opens independent psql sessions against the disposable container. A third read-only control session observes `pg_stat_activity.wait_event='advisory'` and `pg_blocking_pids()` matching the intended blocker. No sleep-based ordering or simulated lock test is used; statements and barriers have hard timeouts.

1. Actor edit-wins: actual replace RPC holds its transaction lock with an uncommitted history change; search reads old committed candidate and demonstrably waits. Edit commits; search revalidates and returns unavailable/null. Token count = 0.
2. Receiver search-wins: actual same-class RPC creates an opaque token inside an open transaction holding both ordered user locks. Receiver's real replace demonstrably waits. Search commits, then edit finishes and commits. Final unused live token involving receiver = 0. `create_connection_request` using the issued token returns false/null/unavailable.

Both tests passed in successive fresh-clone runs. Existing request/connection rows are compared as complete JSON, and message/Instagram/notification counts are compared before/after. All unchanged. No stale token, new request or live user action occurred.

### Schema and privileges

| Boundary | Verified result |
| --- | --- |
| Public tables / columns | 73→73 / 723→723 |
| Public functions | 193→194 (one new, one replacement) |
| Indexes / noninternal triggers | Unchanged |
| Class-history RLS / FORCE RLS | ON / ON |
| Owner SELECT policy | Exact policy JSON unchanged; authenticated SELECT retained |
| Authenticated direct child INSERT/UPDATE/DELETE | Denied |
| Replace RPC PUBLIC / anon / authenticated / service_role | false / false / true / true; auth.uid owner required |
| Same-class RPC PUBLIC / anon / authenticated / service_role | false / false / false / true |
| Legacy exact-person / school-create definitions | Exact unchanged |

Schema43 was exported read-only (DDL only) and restored into a new isolated PostgreSQL17 container. Migration44 ran once per fresh clone. This proves deployed-schema upgrade, not a full historical fresh migration replay. The pre-existing fresh-chain ordering defect remains separate backlog. No remote migration history was changed.

### Application validation

- Targeted command: `npx --no-install vitest run lib/classHistoryAccess.test.ts app/account/classHistoryHardening.test.ts app/account/page.test.ts app/api/account/memberships/[id]/class-history/route.test.ts supabase/migrations/20260907031506_class_history_self_service.test.ts supabase/migrations/20260904083736_same_class_exact_discovery.test.ts lib/dataExport.test.ts app/connections/connectionNotifications.test.ts app/api/connections/connectionNotificationsRoutes.test.ts components/ConnectionNotificationNavigation.test.ts components/TabBar.test.ts`: **11 files / 64 tests PASS**.
- `npm test`: **194 files / 1,560 tests PASS**, 3 files / 4 tests skipped, failure 0.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS, 0 errors / 86 existing warnings.
- `npm run build`: PASS; loopback Supabase URL and placeholder keys, no Production keys used for build DB access.
- `powershell -NoProfile -File scripts/class-history-self-service/run-deployed-schema-proof.ps1 -SchemaDump <temporary-schema43.sql>`: complete upgrade/access/search/concurrency PASS.
- `node scripts/class-history-self-service/verify-ui.cjs`: real editor and **real AccountClient** at 360/390/412 PASS. Only router/API and remote school lookup are mocked. PD editor visible/enabled; profile/create disabled; no access/deletion/emergency/non-K12 hides editor; horizontal overflow 0. Editor add/edit/preload/cancel/clear behavior preserved.
- Initial test-harness issues (JSX runner configuration, isolated browser environment and an incorrect synthetic Instagram max_users) were corrected without weakening assertions or changing the product contract. No full Vitest failure occurred.
- React review: separate derived capabilities, independent server lookups in Promise.all, type-only client imports for server types and no new effects/storage/telemetry. Existing account forms are not widened.
- Final `git diff --check`: PASS using the repository's existing line-ending configuration; no bulk line-ending rewrite. Scoped secret-pattern scan: 27 changed/new files, 0 hit files (not a comprehensive credential audit). Disposable containers and the exact temporary schema-only dump/CLI-link directory were deleted; no user data dump was created.
- Final read-only remote migration check: Preview43 / Production43, migration44 applied=0 on both.

### Scope and remaining gates

Runtime hardening changes: `app/account/page.tsx`, `app/account/AccountClient.tsx`, `components/account/MySchoolsPanel.tsx`, `app/api/account/memberships/[id]/class-history/route.ts`, new `lib/classHistoryAccess.ts`, revised migration44. Tests, local verification tools, decision/FROZEN/CHANGELOG/implementation documentation updated alongside them.

Unchanged: all previously applied migrations; legacy exact-person and school-create runtime; ClassHistoryEditor implementation, export, connection/notification/navigation runtime, feature flags, package/lockfile, external environment/configuration. Canonical Preview/Production DB mutations=0, migrations remain43, live A/B edits/search/OAuth=0, Production deployment=0. Authenticated remote edit smoke is deliberately not run; feature deployment cannot substitute for remote migration validation. Vercel protection is not relaxed. Canonical merge and remote migration still need separate approval.
