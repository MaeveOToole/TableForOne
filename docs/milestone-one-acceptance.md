# Milestone 1 implementation and acceptance

October 27, 2026: the remaining account/preferences/discovery/library implementation is in source. Milestone 1 is not accepted until hosted and signed-device checks pass. Browser compilation and local PostgreSQL tests do not establish those outcomes.

## Activate the development database

The initial probe returned HTTP 404 for `foundation_ready`. The user subsequently ran the reviewed upgrade in SQL Editor and supplied the successful result. Read-only verification now confirms marker `202610270004`, all twelve starter recipes, private catalog isolation and anonymous denial on private API/Data API tables. The updated API was tested against the hosted database; no authenticated account mutations or device observations have been claimed.

1. Open [Supabase Dashboard](https://supabase.com/dashboard), select the development project, and open **SQL Editor**.
2. Create a new query. Open `supabase/upgrade-milestone-one.sql` in the IDE, select all, and copy the entire file into the query.
3. Review the target and run the whole query. Expected result: `expected_marker_202610270004` = `202610270004`.
4. On error, preserve the error message and stop; the file is transactional. Do not rerun `setup-development.sql` or delete existing tables.
5. Restart the API/mobile processes and run `npm run check:connection -w @meal/api`.

The reviewed upgrade preserves existing data, conditionally adds missing schema, refreshes the library routine, and inserts twelve original starter recipes with stable IDs. It does not import/complete personal drafts. It is tested from the original initialized schema and on repeat execution. Reconcile manually applied migrations with CLI migration history before future CLI pushes; this script does not fabricate history entries.

## Implemented behavior

First sign-in opens Profile when onboarding is incomplete; saving the editable defaults completes onboarding. Defaults include one person, three cooking sessions, two portions, 60 minutes, simple/moderate difficulty, next-day leftovers, no freezing, cuisines, unrestricted diet, whole-food/balanced preference, specified equipment, stores and regular groceries. Currency is USD; units, time zone and week-start persist. Groceries has week navigation, ceiling overrides and reset-to-default. Checkout actuals and generated grocery lists remain Milestone 2.

Recovery accepts a copied recovery link from the configured Supabase project or an emailed code, verifies it, updates the password, clears the form and signs out for fresh sign-in. Email delivery/expiry/template behavior needs live verification. It does not depend on a native callback. Never paste recovery credentials into chat. Implementation follows the [Supabase OTP/token-hash API](https://supabase.com/docs/reference/javascript/auth-verifyotp).

Discover uses a replaceable provider interface. The database provider excludes old development fixtures; the source-backed adapter supports contract tests. The user authorized twelve complete original recipes separately from the 48 personal draft summaries: eight dinners, two lunches and two breakfasts, with ingredients, quantities, instructions and equipment. They are AI-generated and not kitchen-tested. No external recipe content/images were copied. Original generated content permits storage/sharing. Nutrition, images and grocery-cost estimates stay unknown. Dietary tags describe listed ingredients, not verified packaged-product allergen safety; check labels.

Discovery applies dietary/equipment/time/difficulty requirements before ranking; meal/cuisine/ingredient and optional cost filters are available. Ranking uses pantry/use-soon matches, cuisines, ratings, prior cooking and known sourced costs. Unknown required metadata and unsourced prices are excluded rather than invented. Pantry quantities are never silently deducted. Context is capped at 1,000 records per source and reports partial context at the cap; full offline sync remains future work. Saved browsing permits reviewing drafts and records that do not meet current discovery preferences.

Details display available metadata, original source links, permitted images only, confidence, ingredients, instructions, optional nutrition provenance, rating/history or absence, and separate personal changes. Scaling preserves raw text/notes, leaves unknowns unchanged and flags cooking-time/whole-item judgment. iPad uses sidebar/inline recipe details; iPhone uses tabs/More and a modal. Later-milestone destinations remain placeholders.

Saved supports collections, selected week/next week and private editable copies. Copies preserve source attribution and append manual notes. New ingredient lines retain unknown quantities. Edits invalidate inherited diet/equipment/nutrition/cost claims. Server writes enforce ownership, revisions and operation receipts, with version snapshots. Refresh reads account-backed preferences, saves, organization and personal recipes. Physical cross-device behavior remains unobserved.

## Acceptance record

Run `npm run check:milestone-one -w @meal/api` to repeat the read-only hosted checks. The preview was restarted on `http://localhost:8083/phone.html`, with the API on port 3000 and matching browser CORS. Both endpoints and catalog access returned HTTP 200. This confirms availability, not signed-in or device acceptance.

For installing on physical iPhone/iPad from Windows, use an Expo development build with an Expo account, Apple signing access and registered devices. The selected EAS route requires an active Apple Developer Program membership; no membership purchase or cloud build has been started. After account/project configuration, register both devices, create the development build, open its installation link on each device, enable Developer Mode if prompted, and connect the app to the reachable development server. See [Expo's physical-device build guide](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/) and [Developer Mode guide](https://docs.expo.dev/guides/ios-developer-mode/). Browser preview testing can continue before signing is arranged.

| Check                            | Local evidence                                                    | Remaining observation                                                               |
| -------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Complete week without imports    | Starter/default-preference tests cover at least seven dinners     | New hosted account discovers, views and saves suitable recipes                      |
| Preference/save on second device | Account-backed API and SQL persistence checks                     | Same account on signed iPhone/iPad; save/remove and preference appear after refresh |
| Private isolation                | RLS and cross-owner tests include copies, collections and budgets | Two hosted accounts cannot read/edit each other's private data via API/Data API     |
| Recovery                         | Trusted-link/OTP tests and SDK UI flow                            | Delivered email, reset, expiry/invalid handling and fresh sign-in                   |
| Adaptive navigation              | Types and web build                                               | Supported iPhone/iPad layouts, large text and screen reader                         |

Record date, build, models/OS, non-secret account labels A/B, recipe ID and observed outcome. Do not store tokens, passwords, recovery links or email contents. Acceptance stays unchecked until these observations exist.
