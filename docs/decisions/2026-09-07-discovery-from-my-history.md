# Discovery from my history

User-approved source-only phase: use the authenticated owner's existing school/class history to prefill the existing private exact same-class search. This is input convenience, not new search authority.

- Load a narrow owner-filtered projection only after the existing authentication, People Discovery and public-account guards. Do not load the full account or use service-role access.
- Send only school ID/name/type/region, graduation year, grade and class to the client. Exclude all private row IDs and unrelated account data.
- Keep manual exact-person and opt-in same-class search. History selection never searches; only explicit submission sends the existing same-class payload. Multiple choices require selection; empty or unavailable history falls back to manual entry.
- Clear previous matches and greeting preview whenever any search criterion changes. Ignore late responses for superseded criteria. Server validation remains authoritative for stale history.
- Account history links require People Discovery access and a valid saved K12 class. The destination is exactly `/people/search`, without context in URLs, storage or telemetry. Existing editing permissions remain independent.
- No migration, search RPC/route, rate-limit, match-token, notification, Instagram or Production changes. Only local/mock verification and a Preview-base Draft PR/feature deployment are authorized; no live searches or new authentication.

## Local verification

- Starting Preview commit `98e854df3d3d74184502b45c3624eeaf6f662642`, tree `e497d652a2d7058017326092feda66d110ea9c3b`.
- Runtime changes are confined to six files: the private search server page/client, new narrow history helper/picker, AccountClient and MySchoolsPanel. The existing account management list gets only a long-name wrapping correction alongside the new capability prop.
- `getOwnClassDiscoveryChoices` returns exactly `schoolId`, `schoolName`, `schoolType`, `region`, `graduationYear`, `gradeNumber`, `classNumber` (seven fields; school name/type/region are public school descriptors). Owner/profile/membership/child IDs, timestamps, email, handles and unrelated account data are excluded. Malformed rows are skipped; query errors produce a coarse unavailable state.
- Targeted: 14 files / 136 tests passed. Full Vitest: 197 files / 1,599 tests passed, 3 files / 4 pre-existing skips. TypeScript and optimized Next build passed. ESLint: 0 errors, 86 existing warnings. Diff and scoped secret-pattern scans passed.
- `node scripts/discovery-from-my-history/verify-ui.cjs` renders actual PeopleSearchClient, OwnHistoryPicker and AccountClient with synthetic loopback-only inputs, mocked API/router/autocomplete, and remote requests denied. At 360×800, 390×844, 412×915 and 1280×900: single/multiple/empty/unavailable history, radio keyboard selection, five repeated selection/mode switches with no search, explicit exact payload, legacy manual modes, all-criterion invalidation, late-response rejection, greeting payload and account CTA gates passed. Horizontal overflow, out-of-width controls, remote requests and browser storage entries were zero.
- Existing server guard order, dynamic/noindex metadata, exact `/people/search` CTA URL, no automatic search/retry, generic unavailable and no public roster/count exposure were preserved. Account profile/create permissions remain disabled in the read-only People Discovery fixture while class editing and the gated CTA remain independently available.
- Existing search/requests routes, connectionSafety, lib/connections and rate-limit file Git blobs are byte-identical to the starting Preview. All migration SQL, exact-person/same-class backend contracts, notifications, Instagram, packages and lockfile are unchanged.
- A targeted source-string assertion was updated to include history-mode's same-class relationship default; the actual manual exact/same-class and greeting behavior is independently exercised by the browser fixture. No assertion, test or backend boundary was removed to obtain a pass.
- Live authenticated feature smoke, real searches, OAuth, canonical merges and all remote data mutations remain out of scope.
