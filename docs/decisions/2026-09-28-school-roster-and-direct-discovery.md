# School roster and direct discovery decision

Date: 2026-09-28

## Decision

- A completed adult account no longer needs an invite, participation application, or operator approval to use exact people discovery and connection requests. The existing public-account launch switch, emergency stop, account restrictions, exact-match rules, daily limits, opaque match token, block and report boundaries remain authoritative.
- Registering a school shows a separate, plainly worded roster disclosure on the school-registration form. The control is selected by default and can be cleared before submission. Clearing it does not block school registration.
- After that affirmation, the name entered in the profile, graduation year, and saved grade/class history are shown automatically in that school's member roster.
- The roster is not public. It is available only to authenticated adults who registered the same school and currently share their own entry in that roster. It is rendered only in a private, non-cacheable account-aware section and is never returned to anonymous users or search crawlers.
- Existing memberships remain hidden. Historical private-account consent is not reinterpreted as roster consent. An existing member must affirm the new disclosure before becoming visible or viewing the roster.
- A member can hide their roster entry at registration or at any later time. Hiding takes effect immediately and also removes the public-account path to people discovery until the member opts in again. Account deletion and school-membership deletion remove the roster consent through cascading deletion.
- The roster returns no user ID, profile ID, membership ID, Instagram address, photo, introduction, email, connection state, or activity data.
- The displayed name is user-supplied and is not government-ID-verified. The UI calls it the user's entered full name and explains this limitation.

## Consent copy requirements

The school-registration form must identify:

- displayed fields: entered full name, graduation year, saved grade/class history;
- audience: authenticated adults who registered the same school and also share their roster entry;
- purpose: finding former schoolmates and sending an exact-match greeting request;
- duration: until the school entry is hidden/deleted, the profile is deleted, or the account deletion process removes personal data;
- consequence of refusal: school registration remains available, while the private school roster and people discovery are unavailable;
- withdrawal path: the account's school card.

## Compatibility

Messaging and Instagram sharing keep their separate feature and per-connection permission boundaries. This decision does not make Instagram addresses or direct contact details visible in the roster.
