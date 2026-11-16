# Remaining Start here acceptance

Reviewed October 26, 2026. This records remaining work; it does not mark unexecuted acceptance checks as passed.

## Item 5: real share-input prototype

Existing evidence: five user-provided TikTok screenshots representing four recipes, transcribed in `docs/tiktok-recipe-samples.md:5`. These establish a manual screenshot fallback, not a native share payload.

Next steps, in order:

1. Website and TikTok URLs received; retrieval results are in `docs/share-input-findings.md:5` and `docs/share-input-findings.md:15`. Instagram is deferred by user request; continue other work without waiting for that link. Inspect each remaining source separately when resumed.
2. Implement a minimal native Share Extension and shared-container handoff in a development build. Capture the actual URL/text/image fields delivered by each source app on the user's devices. Avoid storing unrelated screenshot notifications or private content in diagnostic logs.
3. Verify cold launch, repeated shares, missing caption/details and failed extraction. Present incomplete entries for review; support pasted captions/screenshots and manual details as fallbacks. No automatic video download, audio transcription or platform access is assumed.
4. Record device, OS, app version, received fields and result per source. Complete the item only after website, TikTok and Instagram inputs have been exercised and their fallbacks documented.

Creator details are omitted from the user's recipe notes by request. Source post URLs, when provided, can identify the imported input without adding creator fields to the displayed recipe.

## Item 7: first working slice

Existing implementation references:

- `apps/mobile/src/App.tsx:259`: account creation/sign-in handler.
- `apps/mobile/src/App.tsx:227`: catalog loading.
- `apps/mobile/src/App.tsx:460`: opening recipe details.
- `apps/mobile/src/App.tsx:291`: save/remove API call.
- `apps/mobile/src/App.tsx:634`: refresh from other devices.
- `apps/api/src/app.ts:75`: authentication validation; `apps/api/src/app.ts:123`: saved-recipe query.
- `supabase/migrations/202610260001_foundation.sql:1`: foundation database migration. Existing development seeds are fixtures, not the user's personal catalog.

Local verification on the review date: `npm.cmd run typecheck` passed for mobile, API and contracts; `npm.cmd test` passed all eight API/contract tests. These do not prove a live database connection, RLS enforcement against a real database, or two-device synchronization.

Environment inventory: no `apps/api/.env` or `apps/mobile/.env` file found. Docker and Supabase CLI were not found on PATH. User has a PC, iPhone and iPad; Apple/Expo account status is 'neither yet or unsure', per user; access remains unverified. Do not request secret keys or passwords in chat.

Acceptance sequence:

1. Configure a separate Supabase development project (or a local stack if tools become available). Apply foundation migrations and development seed; verify ownership-policy tests. Configure email/password authentication and confirmation.
2. Configure the API and mobile environment using their `.env.example` files, with publishable keys only. Choose reachable API/Supabase URLs for both physical devices; a phone's localhost is not the PC.
3. Build/install a signed iOS development client on iPhone and iPad using the selected Expo workflow. Confirm account/project access and signing before starting a cloud build. No build, deployment or paid resource has been created as part of this review.
4. On device A, create/sign into an account, discover a catalog fixture, view ingredients/directions and save it. On device B, sign into the same account and refresh: the same save must appear. Remove a save and refresh the other device to verify persistence in both directions.
5. Sign into another account and verify the first account's private saves/preferences are inaccessible. Record the build, devices, OS, recipe ID, test date and results, without storing tokens.

Keep item 7 unchecked until the signed device and live-backend flow is observed. Browser-local demo saves are not cross-device acceptance. Personal catalog integration and missing recipe details remain separate work.

## Connection preparation update

October 26, 2026: user confirmed no Supabase project exists yet. Next external step is creating a separate development project and supplying its Project URL and publishable key (not a secret/service-role key). No live connection or two-device acceptance has been claimed.

`apps/api/scripts/check-connection.ts:1` adds a read-only live API check, invoked with `npm run check:connection -w @meal/api`. It checks health, database readiness, a nonempty catalog recipe with ingredients/directions, and anonymous-save rejection. API startup in `apps/api/package.json:8` accepts environment variables without requiring a local file; the checker command is at line 9. Scripts are included in API TypeScript checks. Verification: API TypeScript and eight API/contract tests pass; the checker passes against a controlled healthy HTTP fixture and fails for a database-readiness 503. These fixture checks do not substitute for running against Supabase.

## Hosted project connection status

October 26, 2026: project `lntjietvnaimwabtiezi` and its publishable key were supplied. Configured matching API/mobile `.env` files (ignored by version control; key omitted from documentation). A live read-only Data API catalog request returned HTTP 404 / PGRST205: the recipe relation is not exposed in the schema cache. Schema setup has not been verified.

Prepared `supabase/setup-development.sql:6` as a one-time transaction containing the canonical foundation migration and six development fixtures, followed by a schema-cache refresh and recipe-count query at line 76. The user must execute it in the project SQL Editor because this session has no authenticated SQL administration access; a publishable key cannot apply migrations. It is intended only for the empty development project, not production or reruns. No remote schema changes or account creation were performed. Recheck the live API after execution; then validate sign-in, saving, ownership and both devices.

## Live backend verification

October 26, 2026: after the user reported a duplicate-table setup error, read-only live checks confirmed that recipes are available with ingredients/directions and anonymous access to preferences/saves is denied. The initial one-time setup must not be rerun on this initialized database. The local API was started and `npm run check:connection -w @meal/api` passed all four checks against the hosted development database: API health, database readiness, catalog recipe details and anonymous-save rejection. Authenticated ownership and two-device acceptance remain untested.

## Profile dropdown update

October 26, 2026: `apps/mobile/src/components/ProfileFields.tsx:52` supplies dropdown suggestions for numeric/default fields and multi-select cuisines/dietary restrictions, including custom entries. Name remains free text. Weekly breakfast/lunch/dinner targets at line 341 range from 0-7 each; they are separate from cooking sessions and do not generate plans yet. The saved contract at `packages/contracts/src/index.ts:30` and line 34 adds dietary restrictions and meal targets with defaults for older profiles. Data stays in the existing revisioned preferences JSON, so no SQL migration is needed. The local API was restarted to load the contract. TypeScript, scoped lint and ten tests pass, including legacy-profile compatibility and meal-count validation. Signed-device and authenticated cross-device acceptance remain pending.

## Personal recipe visibility correction

The PDF collection was previously documentation only, not database content. Prepared `supabase/import-personal-recipes.sql:1` to import all 48 source summaries as private, categorized, incomplete recipe drafts and saved entries. It includes the additive migration `supabase/migrations/202610260002_personal_recipe_drafts.sql:1`, leaves missing values null and uses deterministic per-account IDs for repeat-safe inserts. The script requires exactly one auth account to avoid assigning recipes to the wrong user; it aborts otherwise. No remote SQL was executed. The catalog API now validates/forwards user tokens so RLS can return private drafts. UI labels drafts, preserves notes and clears catalog/details on identity change. All eleven API/contract tests pass; new database ownership tests are prepared but not executed because local Supabase tools are unavailable.

## Recipe-page repair and private import update

October 27, 2026: the user ran the personal import and reported 48 drafts. Imported MD5-based PostgreSQL identifiers are now accepted without changing their IDs. Discover/Saved use scrollable headers and independent filters; saved details load through their own paginated endpoint and profile/context failures do not hide available records. Week shows existing slots and week-marked recipes. Save errors and confirmation state are visible. See docs/browser-regression-checks.md for 32 local tests and six isolated browser interaction checks. Physical devices and real authenticated acceptance remain unverified.
