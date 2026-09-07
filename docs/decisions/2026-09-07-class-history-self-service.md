# Class history self-service

> Superseded for access and concurrency by `2026-09-07-class-history-self-service-hardening.md` (PR100 follow-up). The original registration gate below is historical, not the final authority. The final class-only capability includes exact active People Discovery target-school members; profile/create gates are not widened. Same-class search is now redefined in migration 44 to share deterministic locks and revalidate after waiting.

Approved scope: an authenticated owner may fully replace optional grade/class child history on an existing school membership. School, graduation year, profile, owner and legacy parent class_number remain unchanged. An empty array clears only child history; identical normalized input performs no writes.

The additive `replace_own_school_class_history(uuid,jsonb)` RPC uses the deployed migration-43 registration access contract: public account access, current adult/consent access, active private profile, and public school membership, controlled beta private profile, or exact onboarding school membership capability. Ownership is derived only from auth.uid(). School type comes from the membership's schools relation. K12 grade limits and strict integer pairs apply; non-K12 permits only clearing.

Requester advisory lock and owner profile/membership row locks precede replacement. Actual changes invalidate live unused match tokens involving the owner, while used tokens and existing requests/connections remain unchanged. No-op saves preserve tokens and timestamps. Existing search RPCs, new membership registration, export and cascade semantics remain unchanged.

The private account school card provides an inline optional editor using existing schoolMembershipWritable authority. No new feature flags, public class data, telemetry, or live fixture edits are authorized. One forward migration is tested only in disposable PostgreSQL cloned from deployed Preview schema 43. Remote migration application and merges are deferred. Source commit/push, Preview-base Draft PR and feature deployment are approved.
