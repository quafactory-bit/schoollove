# School growth journey UX completion

Authority: SCHOOLLOVE_GROWTH_UX_COMPLETION_V1_ASTRA and explicit user approval.
Five source-only changes: submit school search; retain a pending school choice;
explain the zero-public-growth experience; align visual hierarchy and account
management; preview and explicitly prepare/reuse/copy an existing share link.

School intent uses only a public slug and a 30-minute expiry in same-tab
sessionStorage. It is never membership, consent, identity or reward authority.
Authenticated arrival consumes the persistent hint; only ephemeral same-owner
memory retains it during client navigation. Reload/account switch fails safely
to manual school selection. Owner identity is never stored with the hint.
Public school lookup revalidates it before explicit candidate confirmation;
existing owner APIs remain authoritative. Clear on success/cancel/logout,
expiry and auth identity change. Storage unavailable gets a reselection path.
No OAuth/broker/cookie, schema/RPC/RLS, rewards, public aggregation or capability
changes. No production signup, user data edits, searches for people, real
referral creation or external invitations. Existing sessions are read-only.

Use actual React components with local synthetic data/network mocks for the
interactive path, and live read-only pages for deployed smoke. Capture all four
requested Chromium viewport sizes, before/after. Genuine user response and
physical-device/Safari verification are not claimed. Record final evidence in
SCHOOL_GROWTH_UX_COMPLETION.md; release only after all five UX gates pass.
