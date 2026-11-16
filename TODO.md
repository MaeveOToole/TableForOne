# Meal Planning App To-Do

Build an iPhone and iPad app that helps people living alone discover recipes, plan meals, use ingredients efficiently, and create a grocery list in approximately ten minutes.

Source: `Meal_Planning_App_Technical_Requirements.docx`, version 1.0, October 22, 2026. This checklist translates that document into implementation work. Requirement IDs refer to the source document.

## Latest checkpoint - November 4, 2026

User direction: continue toward launch as quickly as practical; skip AI and secret-key work for now. No credentials or environment files were changed, no hosted migration or deployment was performed, and no real accounts were modified during this checkpoint.

### Saved handoff for today

Saved November 4, 2026: today's adjustments are implemented in the local project files. The recipe and shopping feedback below is the current UI direction and supersedes older entries describing pencil-only controls, tall recipe actions or a visible Weekly spending section. Earlier test counts are historical; the latest completed verification is **70 tests and 27 core browser scenarios**, plus lint, TypeScript, API specification and formatting checks. Changes have not been committed, pushed or deployed.

To resume: open this folder, run `npm run dev:api` and `npm run preview` in separate terminals, then open **http://localhost:8081/phone.html**. Preserve existing environment files and use an already-running server if its port is occupied. Review the new rating control after opening a recipe; use Settings to verify profile save/collapse and Grocery List to verify budget save/collapse, capitalized additions and aisle controls.

### Recipe and shopping feedback update

- [x] Add account-backed 1-5 star ratings at the end of the recipe reader, labeled "Made it? Rate this recipe". Ratings can be changed, survive reopening and are private to the account. Existing ratings storage/RLS is used; no new database migration is required. Rating writes validate star range and compare revisions; conflicts offer refresh instead of overwriting another device. Browser demo ratings stay local. See `RecipeRating.tsx`, the rating routes in `apps/api/src/library.ts`, and `apps/api/test/recipe-rating.test.ts`.
- [x] Make profile/preferences saving clear with a checkmarked confirmation visible on the Settings row, and close the editor only after success. Keep errors and unsaved edits open.
- [x] Capitalize the first letter when manually adding groceries, pantry items, regular purchases and custom preference options. Preserve the rest of the entered name; do not change time-zone identifiers.
- [x] Make grocery-store sections stand out with larger, bold headings, sage panels and olive borders. Replace duplicate pencil controls with explicit "Qty / name" and "Notes / aisle" labels. Qty / name edits the item name, quantity and package type; Notes / aisle edits the note and store section. Keep these buttons visibly spaced below the grocery item on phones.
- [x] Confirm budget saves with a visible checkmark, then close the budget editor. Remove the Weekly spending section from Groceries completely. Existing historical spending data/backend primitives are retained; they are no longer shown in that screen.
- [x] Use "Add to Week" and arrange recipe-card actions in a compact wrapping row with readable labels and phone-sized touch targets. Shorten "Saved - remove" to "Remove" with its recipe-specific accessible label; retain the separate Edit / organize action. Reduce cover height to save vertical space.
- [x] Make oven preheating explicit in authored preparation steps. Normalize older saved "Heat oven to" wording to "Preheat the oven to" in the reader/cooking mode, retaining the original temperature. Existing air-fryer recipes already include explicit preheating. Non-heated dishes need no preheat step.
- [x] Validation: full `npm run check` passes with **70 tests**; all **27 core browser scenarios** pass, including rating persistence, profile/budget save confirmation and collapse, capitalization, clearer grocery actions and existing offline/weekly flows. Final phone review prompted additional spacing around grocery edit actions.
- [ ] Verify these updated controls in the real signed-in app and signed iPhone/iPad builds. Automated fixtures do not establish native or two-device acceptance.

### Recipe measurement update

- [x] Follow the user's no-scale requirement: remove gram amounts from all 12 public recipes, sample recipes and all 48 personal recipe detail sets. Use cups, spoons, item counts or fractions of labeled packages. Keep amounts explicitly approximate and recipes untested; do not claim exact weight equivalence or kitchen review.
- [x] Adapt matching legacy account and cached ingredients on read without rewriting stored recipes or unrelated edits. Keep unknown normalized quantities unknown and use fractions in scaled cooking/detail views. See [kitchen measurement behavior and references](docs/kitchen-measurements.md).
- [x] Full `npm run check` passes with 69 tests, lint, TypeScript, API specification and formatting. All 24 core browser scenarios passed after the recipe updates; the 2 recipe/cooking scenarios passed again after the final fraction-display changes. A read-only check of the running local API confirms the hosted public recipes now return kitchen measures.

### Earlier launch preparation today

- [x] Fix the launch-scope regression from the weekly-list redesign. Core mode is now the default for previews and all EAS profiles. Discover hides Recipe chat; Find a recipe opens ordinary browsing with the selected week retained. Explicit extended mode remains development-only, and staging/production configuration rejects it.
- [x] Add `npm run test:web:core` and run the full browser suite in both modes in CI. Extend the weekly-flow scenario to verify the absence of AI placeholders and return to the same weekly picks in core mode.
- [x] Rerun and pass `npm run check`: lint, workspace TypeScript, all **65 unit/API/configuration/database tests**, API specification consistency and formatting. All **23 core browser scenarios** and **23 development browser scenarios** pass, including the final Settings layout, offline groceries, persistence and deletion fixtures. Windows denied test-server cleanup; the two temporary servers were stopped with approval and both runners exited successfully.
- [x] Prepare reviewable [App Store copy](docs/app-store-draft.md) and update [first-release scope and next actions](docs/first-release.md) to match the actual running weekly list and simplified pantry screens. The later feedback update removes Weekly spending entirely from the Grocery List.
- [ ] Review recipes and record actual findings; kitchen testing remains pending.
- [ ] Complete real-account acceptance of the current layouts and signed iPhone/iPad, accessibility, offline and two-device tests. Automated fixtures do not establish these acceptances.
- [ ] Supply actual support/developer details, publish policies, prepare final screenshots and complete the other submission gates. Secret-key-dependent deletion and production setup remain deferred rather than complete.

## Previous checkpoint - November 3, 2026

### Current design and completed work today

This direction supersedes the calendar-first interface, separate Chat/Kitchen/Profile destinations, and detailed checkout interface described in earlier checkpoints. The earlier technical work remains recorded below; it does not describe the current main screens.

- [x] Replace day-by-day planning with a running list of breakfast, lunch, dinner and optional side recipes. No day assignment or plan preview is required. Add directly from Discover/Saved, retain the selected week, and remove a weekly pick without deleting the saved recipe. Groceries opens to the week selected in planning.
  - **Location:** [ThisWeek.tsx](apps/mobile/src/components/ThisWeek.tsx), [RecipeBrowser.tsx](apps/mobile/src/components/RecipeBrowser.tsx), [App.tsx](apps/mobile/src/App.tsx), [WeeklyBudget.tsx](apps/mobile/src/components/WeeklyBudget.tsx).
- [x] Simplify navigation to Week, Discover, Saved, Groceries and Settings. Make the phone bar smaller, inset and floating. Put Profile and pantry within Settings. Find a recipe opens the existing Recipe Chat within Discover; AI chat itself remains deferred.
- [x] Redesign Settings after the user's visual feedback: profile/initials summary card, grouped Your Kitchen and Account rows, consistent icons and spacing, expandable profile/pantry editors, and quieter account-deletion controls at the bottom. Preserve open editor state when switching tabs and retain sign-out, refresh and deletion confirmation behavior.
  - **Location:** [SettingsHome.tsx](apps/mobile/src/components/SettingsHome.tsx), [AccountDeletion.tsx](apps/mobile/src/components/AccountDeletion.tsx), [App.tsx](apps/mobile/src/App.tsx). Visual review: [phone Settings preview](output/settings-phone.png).
- [x] Reduce new pantry entry to an item name; remove quantity/unit/notes/use-soon/staple fields from that form. Keep existing account data and reusable regular-purchase functionality.
  - **Location:** [Kitchen.tsx](apps/mobile/src/components/Kitchen.tsx).
- [x] Make Discover/Saved filters compact horizontal meal chips. Use selection controls for cuisine, ingredient, grocery budget, saved week and profile choices. Keep free text for names, searches, recipe content, optional notes and exact spending where appropriate.
  - **Location:** [RecipeBrowser.tsx](apps/mobile/src/components/RecipeBrowser.tsx), [ProfileFields.tsx](apps/mobile/src/components/ProfileFields.tsx), [RecipeDetails.tsx](apps/mobile/src/components/RecipeDetails.tsx).
- [x] Use the Grocery List title, remove repeated headings, and bring the checklist higher on the screen. Exclude plain water, strip cooking measurements from imported ingredient names, preserve recipe cooking amounts, and show countable purchase quantities instead of tablespoons/cups/grams. Recognize explicit imported/manual item counts, scale weekly recipe counts and round purchase counts up to whole items.
  - **Location:** [shopping-quantities.ts](apps/mobile/src/lib/shopping-quantities.ts), [WeeklyGroceryList.tsx](apps/mobile/src/components/WeeklyGroceryList.tsx), [shopping quantity tests](apps/api/test/shopping-quantities.test.ts).
- [x] Add weekly recipe ingredients through the shared durable grocery queue, preserving existing manual purchases and avoiding duplicate names on repeated additions. Keep offline edits, checking, removal, pending/synced feedback, notes, section overrides and week isolation.
  - **Location:** [grocery-engine.ts](apps/mobile/src/lib/grocery-engine.ts), [ThisWeek.tsx](apps/mobile/src/components/ThisWeek.tsx), [offline-groceries.ts](apps/mobile/src/lib/offline-groceries.ts).
- [x] Add explicit pencil controls for profile, grocery quantities, weekly budget/spending, recipes and pantry edits. Use quantity/package pickers. Remove tax, fee and delivery sections from the interface while preserving previously saved checkout metadata. Keep weekly budget and actual spending separate.
  - **Location:** [WeeklyBudget.tsx](apps/mobile/src/components/WeeklyBudget.tsx), [CheckoutSummary.tsx](apps/mobile/src/components/CheckoutSummary.tsx), [WeeklyGroceryList.tsx](apps/mobile/src/components/WeeklyGroceryList.tsx).

### Latest verification and saved state

- [x] All **65 unit/API/configuration/database tests** passed during the UX update; the shopping-quantity test was rerun successfully after imported-name and explicit-count handling changed.
- [x] All **23 browser scenarios** passed on a fresh preview server after the weekly-list/grocery redesign. Earlier calendar/estimate UI scenarios were replaced with weekly-list/simple-spending coverage; underlying planning and checkout contracts retain their unit/API tests.
- [x] After the final Settings redesign, reran and passed the **3 relevant browser scenarios**: profile/simple pantry navigation, regular purchases across weeks, and account-deletion confirmation/failure/cache cleanup. Reviewed the phone Settings screenshot. The entire 23-scenario suite was not rerun after this final visual change.
- [x] Workspace TypeScript and lint passed after the final Settings changes. Modified source/test files were formatted with Prettier. The earlier full `npm run check` result below is historical; that combined command was not rerun after the latest redesign.
- [x] Changes are saved in the project files. Temporary editing/test configuration files were removed. No Git commit, remote push, production deployment, new hosted migration or live account deletion was performed during these UX changes.

### Next work from this checkpoint

- [ ] Review the new weekly-list and Settings layouts in the user's real signed-in account, including future-week picks, grocery quantities, pantry entry, budget/spending edits and reload persistence. Automated browser checks are complete; acceptance of the final visual design remains with the user.
- [ ] Review/kitchen-test the 48 AI-drafted recipes and verify normalized quantities and purchasable package sizes. Missing package information currently shows Choose quantity; cooking measures are not guessed into package counts.
- [ ] Confirm whether future weekly-list changes should recalculate groceries. Currently, adding ingredients keeps existing purchases, but removing/changing a weekly pick does not automatically remove or recalculate grocery items. One saved recipe can be marked for one week at a time; moving an existing pick is labeled.
- [ ] Complete signed iPhone/iPad builds, physical-device layout/accessibility, offline persistence and actual two-device synchronization checks. Browser checks do not establish native acceptance.
- [ ] Complete the remaining [first-release gates](docs/first-release.md), including server-only deletion credentials, disposable-account deletion acceptance, privacy/support URLs, operations and App Store submission requirements. Keep AI/chat, imports, history/ratings, sharing and advanced pricing deferred unless the user changes release scope.

User direction: prioritize a simple running weekly meal list, minimal typing, clear purchase quantities and consistent screens. Massachusetts/Northeast pricing context and preferred stores (Whole Foods, Wegmans, Shaw's and Trader Joe's) remain recorded for future pricing work. AI recipe chat/generation is deferred until the user is ready to configure an API key. The earlier three-dinner/two-portion/linked-leftover defaults remain technical history, not a required scheduling step in the current UI. Apple Developer membership is available, but there is no Mac; Expo account status is unknown. Earlier real-account grocery persistence and completed Saved recipe display are user-confirmed. Acceptance of today's new flows on real accounts/devices remains separate.

### Approved first public release

The user approved a focused public App Store launch around recipes, weekly planning, pantry and groceries. AI/chat, imports/Share Extension, history/ratings, sharing, advanced pricing and ranking are deferred from this first release, not marked complete. An invited beta group is not required by the user's launch plan; internal real-device validation remains required. Follow the concrete [first-release gates](docs/first-release.md).

### Earlier November 3 implementation record

These entries preserve today's earlier backend, offline, migration and calendar/estimate work. Where behavior conflicts, the current design above takes precedence.

- [x] Restore the local preview at http://localhost:8081/phone.html and verify the existing API's health, database/catalog reads and anonymous-save rejection. Preserve environment files and account data.
- [x] Fix `.vscode/launch.json` formatting. The full repository check now passes; the October 29 formatting blocker is resolved.
- [x] Add per-account/week persistent shopping caches and a durable operation queue, name/quantity/unit editing, pending/synced/error feedback, foreground/periodic/browser-reconnection retries, item/field reconciliation and conflict choices. Serialize queues across tab mounts; persist exact attempted keys; scope transport calls to the expected account.
  - **Location:** [offline-groceries.ts](apps/mobile/src/lib/offline-groceries.ts), [WeeklyGroceryList.tsx](apps/mobile/src/components/WeeklyGroceryList.tsx), [local-store.ts](apps/mobile/src/lib/local-store.ts), [transport.ts](apps/mobile/src/lib/transport.ts).
- [x] Cache validated catalog/Saved pages, preferences/context and weekly immutable recipe snapshots. Hydrate cached views before online refresh; label offline fallback. Guard refresh callbacks against account changes. Native persistence uses Expo SQLite and needs a rebuilt iOS development client.
  - **Location:** [library-cache.ts](apps/mobile/src/lib/library-cache.ts), [ThisWeek.tsx](apps/mobile/src/components/ThisWeek.tsx), [App.tsx](apps/mobile/src/App.tsx).
- [x] Add editable weekly plan previews with three dinners/six portions by default, linked next-day leftovers, optional breakfast/lunch counts, hard dietary/equipment/time/difficulty filtering, history/pantry/overlap ranking, swaps, moves, removals, eating-out slots and prepared-serving changes. Keep existing locked meals and sources of locked leftovers. Show budget-price gaps explicitly.
  - **Location:** [weekly-planning.ts](packages/contracts/src/weekly-planning.ts), [WeeklyPlanner.tsx](apps/mobile/src/components/WeeklyPlanner.tsx).
- [x] Add deterministic cooking-session grocery calculation with original ingredient origins, serving scaling, compatible-unit conversion, separate ingredient forms and explicit quantity review. Unreviewed/generated/unknown amounts remain unknown; leftovers generate no extra groceries. Pantry amounts with missing quantities/units are not silently subtracted. Saving rechecks pantry revisions and uses the existing revisioned plan/grocery transaction and repair path.
  - **Location:** [grocery-calculation.ts](packages/contracts/src/grocery-calculation.ts), [planning-workflow.ts](apps/mobile/src/lib/planning-workflow.ts).
- [x] Add owner-scoped, idempotent recipe snapshot creation from server-authorized canonical recipes, with source-revision checking and immutable retry results.
  - **Location:** [planning.ts](apps/api/src/planning.ts), [OpenAPI](docs/openapi.json).
- [x] Implement pantry/staple/use-soon editing, reusable regular purchases with cadence and per-week inclusion, and saved-meal lock/unlock in source. Local SQL and browser checks pass. **Hosted activation confirmed November 3:** the user ran [the kitchen migration](supabase/migrations/202611030001_kitchen_workflows.sql), supplied the SQL success result and confirmed an authenticated pantry save displays Amount unknown. The read-only hosted check confirms the readiness function exists and denies anonymous access. Real-account regular-purchase and lock acceptance remain pending.
  - **Location:** [Kitchen.tsx](apps/mobile/src/components/Kitchen.tsx), [RegularPurchases.tsx](apps/mobile/src/components/RegularPurchases.tsx), [kitchen.ts](apps/api/src/kitchen.ts), [kitchen contracts](packages/contracts/src/kitchen.ts).

- [x] Add Massachusetts pricing context with a dated, sourced Northeast BLS reference catalog. All listed purchases, including checked and household items, participate in coverage checks. Unknown prices/units, unverified package sizes, tax and fees keep checkout incomplete; no missing value becomes a zero-price claim.
  - **Location:** [checkout calculation](packages/contracts/src/checkout.ts), [regional references](packages/contracts/src/northeast-price-references.json), [checkout API](apps/api/src/checkout.ts), [implementation/limits](docs/massachusetts-pricing.md).
- [x] Implement separate editable weekly actual spending and optional estimated tax/fees with ownership, revisions and repeat-safe saves. Blank differs from zero; week navigation and budget reset preserve independent data. **Hosted activation confirmed:** the user reported SQL success for the additive [weekly checkout migration](supabase/migrations/202611030002_weekly_checkout.sql), and the read-only function/privacy check passes. The user confirmed the actual total saves and survives refresh in the real signed-in account.
  - **Location:** [CheckoutSummary.tsx](apps/mobile/src/components/CheckoutSummary.tsx), [checkout SQL](supabase/migrations/202611030002_weekly_checkout.sql), [checkout tests](apps/api/test/checkout.test.ts).

- [x] Implement editable shopping section overrides and notes with offline persistence, queued replay, field conflict detection, explicit conflict choices and clearing back to suggested groups. Checking/unchecking and plan regeneration preserve metadata. Legacy queued base snapshots remain readable; core patches never acquire unintended null metadata fields. **Hosted activation confirmed:** the user reported SQL success for the additive [grocery-details upgrade](supabase/migrations/202611030003_grocery_details.sql), and the read-only readiness/privacy check passes. The user confirmed both notes and sections remain saved after refresh in the real signed-in account.
  - **Location:** [grocery-details API](apps/api/src/grocery-details.ts), [offline queue](apps/mobile/src/lib/offline-groceries.ts), [shopping UI](apps/mobile/src/components/WeeklyGroceryList.tsx), [activation guide](docs/grocery-details-upgrade.md).

- [x] Add the user-selected four-week recorded-history avoidance rule, explicit unplanned meals and a read-only grocery comparison preview showing changed amounts, retained overrides/deletions and removed requirements before saving. Manual week picks and explicit swaps allow repeats; a constrained automatic repeat has a visible warning. Cooking-history capture remains pending. No additional migration is required.

- [x] Add weekly recipe picking from Discover and Saved with per-recipe Add to week, a selected-week banner, return-to-planning navigation and retained open drafts. Picks use existing account-backed recipe organization; choosing an already marked recipe is disabled, and moving an existing pick is labeled. Find a recipe opens the Discover recipe-chat area, which clearly states that AI setup is deferred. AI search/generation remains unimplemented.

- [x] Implement self-account deletion and owner-scoped local-cache erasure in source, with confirmation, failure handling and transactional dependency cleanup. Applying the new migration only installs cleanup; no live account has been deleted. Hosted cleanup activation is user-confirmed by SQL success and account_deletion_ready() returning true. Server-only credential setup and disposable-account/device acceptance remain pending. See [activation and limits](docs/account-deletion.md).
- [x] Earlier implementation: configure core-release builds to hide unfinished chat entry points. **Superseded by today's navigation change:** Recipe Chat is reachable within Discover, including through Find a recipe; it still explicitly states that API setup is deferred. Review this placeholder against first-release readiness before shipping. No working AI chat is claimed.

### Earlier November 3 verification and remaining limits

- [x] Earlier checkpoint: full `npm run check` passed with **64 tests**, lint, strict TypeScript, API specification consistency and repository formatting. This predates the latest UX changes; see the latest verification above.
- [x] Earlier checkpoint: all **21 browser scenarios** passed, including calendar planning, offline recipes, lock/unlock, regular purchases and detailed checkout. The current suite has **23 scenarios** with updated weekly-list/simple-spending coverage; see the latest verification above.
- [x] Activate the kitchen upgrade in the hosted development database. User SQL success and authenticated pantry save are confirmed; `npm run check:kitchen -w @meal/api` passes the read-only function/privacy check.
- [x] Group the shopping checklist into general sections, preserving explicit existing sections and keeping checked items below unchecked items. Section override and note editing are implemented and tested; hosted activation is confirmed; the user confirmed real-account notes and sections survive refresh.
  - **Location:** [grocery-sections.ts](apps/mobile/src/lib/grocery-sections.ts), [WeeklyGroceryList.tsx](apps/mobile/src/components/WeeklyGroceryList.tsx).
- [ ] Kitchen-test/review the 48 AI-drafted recipes and normalize their missing quantity fields. A preview review checkbox does not recover missing normalized values or establish kitchen testing.
- [ ] Complete broader verified price/package coverage and approval-based cheaper meal suggestions, richer protein/package-waste ranking, imports/Share Extension, assistant, cooking history/ratings/sharing, deletion/export/operations and release work below.
- [ ] Verify signed iPhone/iPad builds, actual two-device reconciliation, accessibility, stalled-network edit responsiveness and the one-second native cache target. Browser fixtures and local PostgreSQL tests do not establish these acceptances.

Detailed behavior and limits: [offline shopping and planning](docs/offline-and-planning.md). Original milestone checkboxes below remain historical unless explicitly updated; a partially implemented combined requirement remains unchecked.

## Previous checkpoint - October 29, 2026

All changes from this design and feature session are saved in the project files. This section is the current handoff; the October 27 baseline and its line-range references below are historical, not the current code map. No Git commit, remote push or production deployment was performed. Existing environment files and hosted account data were preserved.

### Completed in this session

- [x] Refresh the React Native iPhone/iPad UI: warm ivory, charcoal and olive styling, clearer hierarchy, visual recipe covers, compact filters, refreshed weekly overview and retained iPad recipe side panel. This Week opens first; Groceries is a primary phone tab.
  - **Location:** [App.tsx](apps/mobile/src/App.tsx), [RecipeArtwork.tsx](apps/mobile/src/components/RecipeArtwork.tsx), [ThisWeek.tsx](apps/mobile/src/components/ThisWeek.tsx), [design refresh notes](docs/design-refresh.md).
- [x] Use one consistent, app-themed color for each meal category: Breakfast warm cream, Lunch soft sage, Dinner muted olive, Sides pale clay. Apply centrally to cards, group headings, filters, weekly recipe picks and recipe-step accents. These replace the earlier gold/green/blue/lavender proposal that the user rejected.
  - **Location:** mealColors and mealColor in [theme.ts](apps/mobile/src/theme.ts).
- [x] Group Discover and Saved into Breakfast, Lunch, Dinner and Sides; sort recipe names A-Z within each group. Keep explicit meal filters visible. Preserve uncategorized recipes instead of guessing a meal type. The public starter catalog has no sides; an empty Sides result there is expected.
  - **Location:** [RecipeBrowser.tsx](apps/mobile/src/components/RecipeBrowser.tsx).
- [x] Simplify opening a recipe to its name, cooking time, appliances, ingredients and numbered preparation steps. Keep save/remove and the separate Organize recipe action on the recipe card. Preserve collections, week assignments and editing in the management view.
  - **Location:** [RecipeReadingView.tsx](apps/mobile/src/components/RecipeReadingView.tsx), [RecipeDetails.tsx](apps/mobile/src/components/RecipeDetails.tsx), [App.tsx](apps/mobile/src/App.tsx).
- [x] Add cooking mode through the management view: large step text, next/previous controls, progress, completion, ingredient checkboxes and reset. Progress lasts while the recipe is open; it does not automatically record cooking history or alter pantry inventory.
  - **Location:** [CookingMode.tsx](apps/mobile/src/components/CookingMode.tsx).
- [x] Fix saving/removing recipes against the real API: only send Content-Type: application/json when a JSON body exists. Empty save requests were rejected by Fastify with HTTP 400. User confirmed the fix worked after opening a refreshed preview. Browser fixtures now reproduce that parser behavior.
  - **Location:** [transport.ts](apps/mobile/src/lib/transport.ts), [browser checks](tests/browser/recipes.spec.ts).
- [x] Add a manual weekly grocery list. Type an item and press Add or Enter; check/uncheck to cross it off; move checked items below unchecked items; remove items; refresh; and navigate between independent weeks. Account-backed lists use the existing plan/grocery storage and revisioned mutation API. First use creates an empty weekly plan without replacing an existing plan's meals. Typed text is preserved on failed additions; failed changes are not shown as saved.
  - **Location:** [WeeklyGroceryList.tsx](apps/mobile/src/components/WeeklyGroceryList.tsx), [weekly-groceries.ts](apps/mobile/src/lib/weekly-groceries.ts), [WeeklyBudget.tsx](apps/mobile/src/components/WeeklyBudget.tsx), existing [foundation routes](apps/api/src/foundation.ts).
- [x] Support the same manual grocery flow in the browser demo using local storage. Demo lists are explicitly browser-local; signed-in lists use the account API. Weekly ceilings, overrides and reset remain available below the list. No new hosted migration was needed.
  - **Location:** [api.web.ts](apps/mobile/src/lib/api.web.ts), [WeeklyBudget.tsx](apps/mobile/src/components/WeeklyBudget.tsx).
- [x] Draft complete details for all 48 original personal recipe summaries: estimated total time, portions, appliances, measured ingredient text and preparation steps. Include waiting time for chilled/frozen dishes and preserve separate variations. Label these as AI-drafted, estimated and not kitchen-tested.
  - **Location:** [personal recipe data](apps/api/src/data/personal-recipe-details.json), [completion logic](apps/api/src/personal-recipe-details.ts), [recipe collection documentation](docs/recipe-collection.md).
- [x] Serve those details consistently from both recipe API reads and Saved. Restrict completion to untouched private imports verified by owner-derived ID, exact title and source. Preserve original summaries, provenance, IDs, category and saved relationships; do not replace existing recipe edits. Details are versioned application data applied on read, not a bulk overwrite of hosted database rows. Measured ingredient text is available; normalized quantities/conversions remain unverified.
  - **Location:** [recipe-provider.ts](apps/api/src/recipe-provider.ts), [library.ts](apps/api/src/library.ts), [personal recipe tests](apps/api/test/personal-recipes.test.ts).
- [x] Repair stale npm workspace junctions after the checkout moved from Recipe to TableForOne and add explicit Metro resolution for the contracts workspace.
  - **Location:** [metro.config.js](apps/mobile/metro.config.js), [eslint.config.mjs](eslint.config.mjs).

### Verification at this checkpoint

- [x] TypeScript checks pass across all workspaces; lint passes; formatting passes for changed files.
- [x] All **35 backend/configuration/contract/PostgreSQL tests** pass, including coverage of all 48 recipe completions and preservation of edited/private records.
- [x] All **12 browser interaction checks** pass: save/remove, 48 private drafts, partial-load/error handling, week assignment, sign-in routing, iPad details, filters/grouping/alphabetization, cooking mode, grocery add/check/reload/week isolation/removal, failed grocery additions and completed recipe display.
- [x] Live read-only API checks pass for health, database readiness, catalog ingredients/directions and rejection of anonymous access to saves. User explicitly confirmed real recipe saving works.
- [ ] Full-repository formatting still has a pre-existing issue in `.vscode/launch.json`; it was left untouched. Do not describe `npm run check` as fully passing until that issue is resolved and the entire command succeeds.
- [ ] Signed-device/native iPhone/iPad checks, full accessibility review, authenticated cross-account isolation and two-device sync acceptance remain pending. Grocery persistence and complete recipe display were exercised with isolated browser/API fixtures; this does not establish native or cross-device acceptance.

### Resume the app locally

1. Open this TableForOne folder in the IDE.
2. In a terminal at the project root, run `npm run dev:api`.
3. In a second terminal at the project root, run `npm run preview`.
4. Open **http://localhost:8081/phone.html** and select iPhone, large iPhone or iPad. The full browser app is **http://localhost:8081/**.
5. Sign in if needed. Refresh Saved to load the completed personal recipes. Open Groceries to use the weekly checklist.

Code is already saved on disk. Closing the editor does not remove it. The local preview/API may need restarting after closing this session; if a port is already occupied, use the existing running service rather than starting a duplicate. Preserve the existing `.env` files. Do not rerun setup/import SQL to resume.

### Next work, in priority order

- [ ] Verify manual grocery additions/checkmarks and completed personal recipes in the user's real signed-in account, then test iPhone/iPad synchronization. Recipe saving itself is user-confirmed; the broader acceptance remains open.
- [ ] Review and kitchen-test the 48 AI-drafted recipe versions; correct preferences/variations and normalize ingredient quantities/units before using them for automatic grocery math. Original missing recipes were not recovered verbatim.
- [ ] Add offline grocery viewing/checking/editing with persistence, queued operations, conflict handling and visible sync state. **The current shopping checklist requires internet to load/save account changes.**
- [ ] Implement editable automatic weekly planning, linked leftovers, meal swaps/locks/moves, smart ingredient reuse and the kitchen/pantry check.
- [ ] Implement recipe-derived grocery calculation, aisle grouping, quantity/note editing, reusable regular purchases and recalculation that preserves manual edits. Manual entry/checking/removal is complete; this broader workflow is not.
- [ ] Implement complete checkout estimates and actual spending, then imports/share extension, assistant, history/sharing and release acceptance as tracked in the milestones below.

## Technical direction

- **Mobile:** React Native for iPhone and iPad, replacing the document's proposed SwiftUI client. Android remains outside the first release.
- **Backend:** Node.js with a modular API service, background jobs, and server-side recipe and AI integrations.
- **Foundation:** TypeScript across mobile, backend, and shared contracts; Supabase PostgreSQL and Auth; local mobile persistence; a job queue; object storage for permitted assets. Confirm tooling during setup.
- **Native iOS integration:** Plan for an iOS Share Extension, shared app/extension storage, system sharing, and Universal Links alongside the React Native app.
- **Architecture:** Begin with a modular backend. Keep credentials and AI keys on the server. Use deterministic code for quantities, unit conversions, servings, leftovers, and money.

Unchecked items are remaining implementation or verification work. Repository/development setup and the Database and API foundation are implemented in source. Expo mobile, Fastify, shared TypeScript/Zod contracts and the Supabase schema now include ownership controls, revisioned/idempotent mutations and plan/grocery recovery primitives. This does not complete the later mobile workflows or live acceptance checks. See README.md for setup and docs/architecture.md for decisions and limits. The first release requires all four milestones, including the acceptance checks below.

Location notes were verified against the repository on October 27, 2026. Each checklist item has a **Location** entry with inclusive start–end lines and a link to the implementation, configuration, SQL, tests or decision document. Named functions use their complete declaration/body range; inline handlers and schema/configuration blocks use their own ranges. Related code does not mean the whole task is complete. “Not implemented” means there is no function range to cite yet. Earlier references in task descriptions are historical; the Location entries below are the current code map. Update ranges when code moves.

## Historical baseline - October 27, 2026

Repository and development setup: **5 of 5 tasks implemented**. Database and API foundation: **7 of 7 tasks implemented in source**. Verification at this baseline passed lint, TypeScript, 32 tests (including local PostgreSQL migrations, ownership and transaction/recovery checks), OpenAPI consistency, formatting and six isolated Chrome interaction checks (phone and iPad-sized viewports). Hosted migration activation, twelve-recipe catalog access and anonymous privacy checks are verified. User confirmed the real signed-in Saved page displays all 48 personal drafts. Supabase/pgTAP, remaining authenticated flows (new-account/recovery/cross-account) and signed-device acceptance remain unverified.

Confirmed recovery behavior: save a valid new plan even if its grocery update fails; mark groceries `needs_review`, retain pending requirements, hide stale shopping items and provide explicit repair. The backend primitive is implemented; mobile planning and recovery screens remain planned.

### Next actions

- [x] Restore and display all 48 personal recipe drafts in Saved. Completed October 27, 2026: user ran the import, received 48 and confirmed all drafts appear in the real signed-in app after refresh. Fixed legacy PostgreSQL ID validation, scroll layout, independent filters, partial-load recovery and visible save feedback. Browser tests cover save/remove, all 48 drafts, failure states, Week assignment and iPad detail controls.
  - **Location:** [supabase/import-personal-recipes.sql:1–51](supabase/import-personal-recipes.sql#L1-L51); [packages/contracts/src/ids.ts:1–4](packages/contracts/src/ids.ts#L1-L4); loadLibrary: [apps/mobile/src/lib/load-library.ts:27–102](apps/mobile/src/lib/load-library.ts#L27-L102); RecipeBrowser: [apps/mobile/src/components/RecipeBrowser.tsx:37–364](apps/mobile/src/components/RecipeBrowser.tsx#L37-L364); [tests/browser/recipes.spec.ts:1–317](tests/browser/recipes.spec.ts#L1-L317); [docs/browser-regression-checks.md:1–29](docs/browser-regression-checks.md#L1-L29).

- [x] Apply the reviewed Milestone 1 development upgrade (four October 27 migrations plus any missing private-draft schema) after checking migration history. User applied the reviewed upgrade October 27, 2026; screenshot and read-only checks confirm marker `202610270004` and all twelve starter recipes. Do not rerun `supabase/setup-development.sql`.
  - **Location:** Hosted activation verified October 27, 2026; [supabase/migrations/202610270001_domain_foundation.sql:1–214](supabase/migrations/202610270001_domain_foundation.sql#L1-L214); [supabase/migrations/202610270002_transactional_mutations.sql:1–203](supabase/migrations/202610270002_transactional_mutations.sql#L1-L203); activation guide: [docs/database-api-foundation.md:1–47](docs/database-api-foundation.md#L1-L47).
- [ ] Finish authenticated hosted acceptance: sign-in/onboarding, preferences/save/copy/collection/budget mutations, recovery and cross-account isolation, followed by signed iPhone/iPad synchronization. API/preview restart, readiness, catalog and anonymous privacy checks pass; these do not establish authenticated/device acceptance.
  - **Location:** Read-only hosted checks pass; authenticated/device acceptance pending; [apps/api/scripts/check-milestone-one.ts:1–88](apps/api/scripts/check-milestone-one.ts#L1-L88); [apps/api/scripts/check-connection.ts:1–57](apps/api/scripts/check-connection.ts#L1-L57); [apps/api/test/foundation.test.ts:1–246](apps/api/test/foundation.test.ts#L1-L246); [apps/api/test/database.test.ts:1–560](apps/api/test/database.test.ts#L1-L560); [docs/database-api-foundation.md:1–47](docs/database-api-foundation.md#L1-L47).

Milestone 1 implementation is ready for hosted and signed-device acceptance. Accounts/onboarding/discovery/library code and a complete starter catalog are implemented. The three milestone acceptance checks and physical-device sync remain unchecked until observed. Hosted activation is verified. Acceptance guide: [docs/milestone-one-acceptance.md:1–45](docs/milestone-one-acceptance.md#L1-L45). Reviewed SQL: [supabase/upgrade-milestone-one.sql:1–641](supabase/upgrade-milestone-one.sql#L1-L641).

## Start here

- [x] Select React Native setup: evaluate Expo with development builds versus a bare project against Share Extension, shared storage, offline persistence, and iPad layout needs. Completed October 26, 2026. Decision and evaluation: `docs/mobile-setup-decision.md:5` and `docs/mobile-setup-decision.md:9`. Configuration/code: `apps/mobile/package.json:8`, `apps/mobile/app.json:10`, `apps/mobile/src/App.tsx:177`. Native prototype and device acceptance remain separate tasks.
  - **Location:** Decision/configuration (no standalone task function): [docs/mobile-setup-decision.md:1–34](docs/mobile-setup-decision.md#L1-L34); [apps/mobile/app.json:1–20](apps/mobile/app.json#L1-L20); App — [apps/mobile/src/App.tsx:174–194](apps/mobile/src/App.tsx#L174-L194). Native prototype remains pending.
- [x] Choose the Node.js API framework, authentication provider, database access layer, local mobile database, queue, and hosting; record decisions and estimated operating costs. Completed October 26, 2026. Selections: `docs/backend-services-decision.md:5`; costs and assumptions: `docs/backend-services-decision.md:22`. Existing code: `apps/api/src/app.ts:24` (Fastify), `apps/api/src/app.ts:75` (Auth), `apps/api/src/app.ts:17` (database client). Expo SQLite, Supabase Queues and Render hosting are selected; implementation and deployment remain separate tasks.
  - **Location:** Decision and existing API factory: [docs/backend-services-decision.md:1–48](docs/backend-services-decision.md#L1-L48); buildApp — [apps/api/src/app.ts:30–268](apps/api/src/app.ts#L30-L268). Selected queue/database/hosting services are not all implemented.
- [x] Select minimum iOS/iPadOS versions and a physical-device/simulator test matrix; identify access to macOS, Xcode, signing, and Apple developer resources. Completed October 26, 2026. Minimum iOS/iPadOS 16.4: `apps/mobile/app.json:12`; rationale/toolchain: `docs/ios-test-matrix.md:5`; resource inventory and access gaps: `docs/ios-test-matrix.md:11`; test matrix: `docs/ios-test-matrix.md:24`. PC, iPhone and iPad available; OS 26.2.2 reported, per-device assignment pending. Mac/Xcode, Apple membership/signing, models and native test execution remain unverified.
  - **Location:** Decision/configuration: [docs/ios-test-matrix.md:1–42](docs/ios-test-matrix.md#L1-L42); [apps/mobile/app.json:1–20](apps/mobile/app.json#L1-L20). No runtime function; device execution remains pending.
- [x] Confirm an initial recipe catalog source and its attribution, caching, image, and redistribution rights before integrating it. Completed October 26, 2026 for the personal catalog: user confirmed all 48 entries are ChatGPT suggestions. Source, attribution, personal storage/cache scope, text-only images policy and exclusion of public redistribution: `docs/recipe-collection.md:75`. Categories: `docs/recipe-collection.md:7`, `docs/recipe-collection.md:19`, `docs/recipe-collection.md:31`, `docs/recipe-collection.md:60`. Private draft integration is prepared in `supabase/import-personal-recipes.sql:1`; User ran the private import October 27, 2026 and reported 48; the user subsequently confirmed all 48 drafts appear in Saved. October 29 update: complete AI-drafted versions are now served for all 48 untouched imports. Original details were not recovered verbatim; review/kitchen testing and normalized quantities remain pending.
  - **Location:** Source/rights documentation and prepared SQL (not a runtime function): [docs/recipe-collection.md:1–85](docs/recipe-collection.md#L1-L85); [supabase/import-personal-recipes.sql:1–51](supabase/import-personal-recipes.sql#L1-L51).
- [ ] Prototype actual website, TikTok, and Instagram share inputs early; document accessible fields and fallback behavior. In progress October 26, 2026: five TikTok screenshots transcribed into four recipe samples: `docs/tiktok-recipe-samples.md:5`, `docs/tiktok-recipe-samples.md:37`, `docs/tiktok-recipe-samples.md:67`, `docs/tiktok-recipe-samples.md:84`. Observed fields, proposed fallbacks and remaining native/website/Instagram testing: `docs/tiktok-recipe-samples.md:112`. Screenshot extraction is not a tested Share Extension payload. Remaining prototype sequence: `docs/start-here-remaining.md:5`; website/TikTok URLs inspected: `docs/share-input-findings.md:5` and `docs/share-input-findings.md:15`; Instagram deferred by user request at `docs/share-input-findings.md:23`. Signed-device setup and native payload tests remain pending.
  - **Location:** Research only: [docs/share-input-findings.md:1–33](docs/share-input-findings.md#L1-L33); [docs/tiktok-recipe-samples.md:1–118](docs/tiktok-recipe-samples.md#L1-L118). Native share-input implementation is not present.
- [x] Choose a baseline price-estimation method and decide whether original AI-generated recipes belong in the first release. Completed October 26, 2026. Use rough general reference estimates with no individual item price entry; user enters the final all-in checkout total afterward. Include clearly labeled new AI-generated recipes in the first release. Confirmed behavior: `docs/grocery-budget-requirements.md:5`; method, scope and implementation limits: `docs/grocery-budget-requirements.md:34`. Reference dataset, estimation engine and recipe generation are not implemented yet.
  - **Location:** Requirements/decision only: [docs/grocery-budget-requirements.md:1–40](docs/grocery-budget-requirements.md#L1-L40). Estimation and AI recipe-generation functions are not implemented.
- [ ] Scaffold the workspace, then deliver the first working slice: sign in, discover a catalog recipe, view details, save it, and see it on a second device. Updated October 27, 2026: scaffold and flow code exist; the latest local check suite passes 32 tests. The updated API requires the pending October 27 migrations before live use. Implementation references, environment gaps and live two-device acceptance sequence: `docs/start-here-remaining.md:18`. Private import at `supabase/import-personal-recipes.sql:1` was executed by the user and returned 48; the user confirmed all 48 drafts appear in Saved after the UI/ID fixes. Connection check prepared at `apps/api/scripts/check-connection.ts:1` (fixture success/failure paths verified). Supabase project supplied and local API/mobile environments configured. Initial catalog probe returned 404/PGRST205; subsequent live verification confirms schema/catalog available and all four API connection checks pass. Do not rerun setup SQL. One-time development SQL: `supabase/setup-development.sql:6`, verification query at `supabase/setup-development.sql:76`. Authenticated sign-in/save, cross-account ownership and two-device verification remain pending.
  - **Location:** Partial implementation: authenticate — [apps/mobile/src/App.tsx:350–371](apps/mobile/src/App.tsx#L350-L371); reload — [apps/mobile/src/App.tsx:315–346](apps/mobile/src/App.tsx#L315-L346); toggleSave — [apps/mobile/src/App.tsx:372–416](apps/mobile/src/App.tsx#L372-L416); buildApp — [apps/api/src/app.ts:30–268](apps/api/src/app.ts#L30-L268); [apps/api/scripts/check-connection.ts:1–57](apps/api/scripts/check-connection.ts#L1-L57). Live authenticated/two-device acceptance remains pending.

## Milestone 1 — Foundation and discovery

### Repository and development setup

- [x] Set up a workspace with `apps/mobile`, `apps/api`, and shared API/schema contracts under `packages/`.
  - **Location:** Workspace configuration (no runtime function): [package.json:1–34](package.json#L1-L34); [apps/mobile/package.json:1–32](apps/mobile/package.json#L1-L32); [apps/api/package.json:1–27](apps/api/package.json#L1-L27); [packages/contracts/package.json:1–13](packages/contracts/package.json#L1-L13).
- [x] Configure TypeScript, formatting, linting, meaningful automated tests, and CI checks. Completed October 27, 2026: strict TypeScript across all three workspaces; ESLint and Prettier exclude generated artifacts; `npm run check` runs lint, types, 32 API/configuration/contract/PostgreSQL tests and formatting locally and in `.github/workflows/ci.yml`. Tests cover authentication rejection, validation, error redaction, stale revisions, repeat-safe saves, private catalog token forwarding and preference compatibility. Database policy CI remains separate; Docker/Supabase CLI and signed-device acceptance are unavailable locally.
  - **Location:** Configuration and existing tests: [tsconfig.base.json:1–12](tsconfig.base.json#L1-L12); [eslint.config.mjs:1–20](eslint.config.mjs#L1-L20); [.prettierignore:1–7](.prettierignore#L1-L7); [package.json:1–34](package.json#L1-L34); [.github/workflows/ci.yml:1–33](.github/workflows/ci.yml#L1-L33); [apps/api/test/app.test.ts:1–344](apps/api/test/app.test.ts#L1-L344). Tests use individual test callbacks, not one task function.
- [x] Add setup instructions, environment variable examples without secrets, database migrations, and seed data. Completed October 27, 2026: reviewed setup guide, safe environment-copy instructions, canonical migrations and development fixtures. Canonical migrations execute in local PostgreSQL tests; hosted application remains unverified.
  - **Location:** Setup guide: [docs/development-setup.md:1–51](docs/development-setup.md#L1-L51); quick start: [README.md:1–103](README.md#L1-L103); examples: [apps/api/.env.example:1–11](apps/api/.env.example#L1-L11); [apps/mobile/.env.example:1–4](apps/mobile/.env.example#L1-L4); migrations: [supabase/migrations/202610260001_foundation.sql:1–50](supabase/migrations/202610260001_foundation.sql#L1-L50); [supabase/migrations/202610260002_personal_recipe_drafts.sql:1–16](supabase/migrations/202610260002_personal_recipe_drafts.sql#L1-L16); fixtures: [supabase/seed.sql:1–11](supabase/seed.sql#L1-L11).
- [x] Establish separate development, staging, and production configurations. Completed October 27, 2026 for repository configuration: isolated API/mobile templates, validated hosted settings and distinct EAS app identities. Provisioning and deployments remain separate release work.
  - **Location:** loadConfig: [apps/api/src/config.ts:1–40](apps/api/src/config.ts#L1-L40); startup: [apps/api/src/server.ts:1–19](apps/api/src/server.ts#L1-L19); mobile configuration function: [apps/mobile/app.config.js:1–29](apps/mobile/app.config.js#L1-L29); build profiles: [apps/mobile/eas.json:1–21](apps/mobile/eas.json#L1-L21); staging templates: [config/environments/staging/api.env.example:1–9](config/environments/staging/api.env.example#L1-L9); [config/environments/staging/mobile.env.example:1–4](config/environments/staging/mobile.env.example#L1-L4); production templates: [config/environments/production/api.env.example:1–9](config/environments/production/api.env.example#L1-L9); [config/environments/production/mobile.env.example:1–4](config/environments/production/mobile.env.example#L1-L4).
- [x] Add structured errors, request IDs, health checks, monitoring, and feature flags. Avoid logging private content and credentials. Completed October 27, 2026 for repository baseline: structured errors including unknown routes, generated IDs, readiness/liveness, safe request monitoring events, tested catalog/save kill switches and monitoring runbook. External alert delivery and log retention remain deployment work.
  - **Location:** buildApp: [apps/api/src/app.ts:30–268](apps/api/src/app.ts#L30-L268); request monitoring: [apps/api/src/app.ts:30–268](apps/api/src/app.ts#L30-L268); feature gates: [apps/api/src/app.ts:63–75](apps/api/src/app.ts#L63-L75); health: [apps/api/src/app.ts:76–90](apps/api/src/app.ts#L76-L90); readiness: [apps/api/src/app.ts:161–174](apps/api/src/app.ts#L161-L174); setup tests: [apps/api/test/setup.test.ts:1–168](apps/api/test/setup.test.ts#L1-L168); runbook: [docs/development-setup.md:1–51](docs/development-setup.md#L1-L51).

### Database and API foundation

- [x] Define schemas and migrations for users/preferences; recipes/versions/ingredients; import jobs; saved recipes; plans/slots; pantry; regular purchases; grocery lists/items; price estimates; cooking events; ratings; shares; chats; and mutation/undo records. Completed October 27, 2026: additive domain migration and shared contracts; all migrations execute in local PostgreSQL tests. Hosted schema activation is verified; authenticated acceptance remains pending.
  - **Location:** [supabase/migrations/202610270001_domain_foundation.sql:1–214](supabase/migrations/202610270001_domain_foundation.sql#L1-L214); [supabase/migrations/202610270002_transactional_mutations.sql:1–203](supabase/migrations/202610270002_transactional_mutations.sql#L1-L203); domain contracts: [packages/contracts/src/foundation.ts:1–279](packages/contracts/src/foundation.ts#L1-L279). Existing users/preferences/recipes/saves remain in the October 26 migrations.
- [x] Give mutable records stable IDs, ownership, timestamps, and revisions; preserve raw and normalized ingredient data together. Completed October 27, 2026: stable IDs, owner metadata, revision/identity guards, append-only snapshots and raw/normalized ingredient fields.
  - **Location:** [supabase/migrations/202610270001_domain_foundation.sql:1–214](supabase/migrations/202610270001_domain_foundation.sql#L1-L214); enforce_record_revision: [supabase/migrations/202610270001_domain_foundation.sql:144–152](supabase/migrations/202610270001_domain_foundation.sql#L144-L152); enforce_recipe_revision: [supabase/migrations/202610270001_domain_foundation.sql:160–167](supabase/migrations/202610270001_domain_foundation.sql#L160-L167); ingredientSchema: [packages/contracts/src/index.ts:9–18](packages/contracts/src/index.ts#L9-L18); [packages/contracts/src/foundation.ts:1–279](packages/contracts/src/foundation.ts#L1-L279).
- [x] Represent attribution, extraction method, confidence, content permissions, and personal modifications explicitly. Completed October 27, 2026: explicit provenance/confidence/permissions/modification fields and recipe versions; copies cannot escalate source redistribution rights.
  - **Location:** recipeSchema: [packages/contracts/src/index.ts:19–73](packages/contracts/src/index.ts#L19-L73); version/ingredient storage and rights policy: [supabase/migrations/202610270001_domain_foundation.sql:1–214](supabase/migrations/202610270001_domain_foundation.sql#L1-L214); read_shared_recipe: [supabase/migrations/202610270001_domain_foundation.sql:202–212](supabase/migrations/202610270001_domain_foundation.sql#L202-L212).
- [x] Define request/response schemas and an API specification, including validation errors, pagination, asynchronous job states, revision conflicts, and idempotency. Completed October 27, 2026: shared request/response schemas, generated OpenAPI 3.1, safe validation fields, pagination, job-state contracts and conflict semantics. Feature workers remain separate tasks.
  - **Location:** [packages/contracts/src/foundation.ts:1–279](packages/contracts/src/foundation.ts#L1-L279); [apps/api/src/openapi.ts:1–406](apps/api/src/openapi.ts#L1-L406); generated specification: [docs/openapi.json:1–5531](docs/openapi.json#L1-L5531); registerFoundationRoutes: [apps/api/src/foundation.ts:83–188](apps/api/src/foundation.ts#L83-L188).
- [x] Enforce authentication and ownership on every private resource and permission checks on shared resources. Completed October 27, 2026 for the foundation: token-validated API, RLS and same-owner foreign keys; scoped recipient reads enforce expiry, revocation and redistribution permissions. Local SQL/API checks pass; hosted verification remains pending.
  - **Location:** privateClient: [apps/api/src/app.ts:140–149](apps/api/src/app.ts#L140-L149); owner policies and composite foreign keys: [supabase/migrations/202610270001_domain_foundation.sql:1–214](supabase/migrations/202610270001_domain_foundation.sql#L1-L214); read_shared_recipe: [supabase/migrations/202610270001_domain_foundation.sql:202–212](supabase/migrations/202610270001_domain_foundation.sql#L202-L212); [apps/api/test/database.test.ts:1–560](apps/api/test/database.test.ts#L1-L560).
- [x] Add revision checks and idempotency keys to mutations; establish transactions for plan and derived grocery changes. Completed October 27, 2026: required operation keys on implemented API writes, per-user receipts/locks, expected revisions and transactional plan/projection handling. Mutation snapshots/linkage support later Undo execution.
  - **Location:** applyMutation: [apps/api/src/foundation.ts:55–72](apps/api/src/foundation.ts#L55-L72); apply_foundation_mutation: [supabase/migrations/202610270002_transactional_mutations.sql:19–194](supabase/migrations/202610270002_transactional_mutations.sql#L19-L194); [apps/mobile/src/lib/transport.ts:1–53](apps/mobile/src/lib/transport.ts#L1-L53); [apps/api/test/database.test.ts:1–560](apps/api/test/database.test.ts#L1-L560).
- [x] Provide a clear recoverable state whenever a derived grocery list cannot be updated with its plan. Completed October 27, 2026 using the user-selected behavior: save the new plan, roll back failed grocery work, persist pending requirements, mark needs_review, hide stale shopping items and support explicit repair. Mobile planning/recovery screens remain in later milestones.
  - **Location:** plan_document: [supabase/migrations/202610270002_transactional_mutations.sql:2–15](supabase/migrations/202610270002_transactional_mutations.sql#L2-L15); apply_foundation_mutation: [supabase/migrations/202610270002_transactional_mutations.sql:19–194](supabase/migrations/202610270002_transactional_mutations.sql#L19-L194); registerFoundationRoutes: [apps/api/src/foundation.ts:83–188](apps/api/src/foundation.ts#L83-L188); [docs/database-api-foundation.md:1–47](docs/database-api-foundation.md#L1-L47).

### Accounts, preferences, and navigation — ACC-01 through ACC-05

- [x] Implement account creation, sign-in, sign-out, recovery, and protected credential storage. Updated October 27, 2026: Implemented locally; delivered recovery email and signed-device acceptance remain pending.
  - **Location:** authenticate: [apps/mobile/src/App.tsx:350–371](apps/mobile/src/App.tsx#L350-L371); AccountRecovery: [apps/mobile/src/components/AccountRecovery.tsx:13–177](apps/mobile/src/components/AccountRecovery.tsx#L13-L177); recoveryCredential: [packages/contracts/src/recovery.ts:3–23](packages/contracts/src/recovery.ts#L3-L23); [apps/mobile/src/lib/supabase.ts:1–55](apps/mobile/src/lib/supabase.ts#L1-L55).
- [x] Implement onboarding and editable defaults: one person, three dinner cooking sessions, two portions each, usually at most 60 minutes, simple/moderate difficulty, next-day leftovers, and no default freezing. Updated October 27, 2026: First sign-in opens editable Profile defaults; saving completes onboarding.
  - **Location:** preferencesSchema: [packages/contracts/src/index.ts:75–142](packages/contracts/src/index.ts#L75-L142); ProfileFields: [apps/mobile/src/components/ProfileFields.tsx:226–509](apps/mobile/src/components/ProfileFields.tsx#L226-L509); reload: [apps/mobile/src/App.tsx:315–346](apps/mobile/src/App.tsx#L315-L346).
- [x] Capture cuisines, dietary restrictions, equipment, optional nutrition preference, regular groceries, and preferred stores. Updated October 27, 2026: Implemented with editable multiselect/custom values and persisted account preferences.
  - **Location:** ProfileFields: [apps/mobile/src/components/ProfileFields.tsx:226–509](apps/mobile/src/components/ProfileFields.tsx#L226-L509); preferencesSchema: [packages/contracts/src/index.ts:75–142](packages/contracts/src/index.ts#L75-L142).
- [x] Seed editable preferences from the document: Mexican/Italian/Mediterranean variety; no dietary restrictions; whole-food and balanced-meal preference; oven, stovetop, air fryer, Ninja blender; Whole Foods, Wegmans, Shaw's, Trader Joe's; fruit, yogurt, bagels, eggs, cheese, sausage, avocados. Updated October 27, 2026: Defaults also fill missing fields on older profiles without overwriting saved values.
  - **Location:** preferencesSchema: [packages/contracts/src/index.ts:75–142](packages/contracts/src/index.ts#L75-L142); makeDraft: [apps/mobile/src/components/ProfileFields.tsx:200–224](apps/mobile/src/components/ProfileFields.tsx#L200-L224).
- [x] Persist currency, time zone, units, week-start day, and configurable weekly grocery ceiling, initially $150 USD. Support weekly overrides, week navigation and reset-to-default in Groceries. Updated October 27, 2026: Implemented in source; hosted activation is verified; authenticated acceptance remains pending. Currency is USD.
  - **Location:** preferencesSchema: [packages/contracts/src/index.ts:75–142](packages/contracts/src/index.ts#L75-L142); WeeklyBudget: [apps/mobile/src/components/WeeklyBudget.tsx:6–149](apps/mobile/src/components/WeeklyBudget.tsx#L6-L149); registerLibraryRoutes: [apps/api/src/library.ts:21–221](apps/api/src/library.ts#L21-L221); [supabase/migrations/202610270003_discovery_library.sql:1–103](supabase/migrations/202610270003_discovery_library.sql#L1-L103).
- [x] Build This Week, Discover, Saved, Groceries, Chat, Kitchen, and Settings navigation with iPhone tabs and adaptive iPad sidebar/split layouts. Updated October 27, 2026: Navigation and iPad inline details are implemented; later-milestone destinations remain placeholders. Physical layout/accessibility acceptance remains pending.
  - **Location:** Shell: [apps/mobile/src/App.tsx:234–809](apps/mobile/src/App.tsx#L234-L809); RecipeFrame: [apps/mobile/src/App.tsx:195–233](apps/mobile/src/App.tsx#L195-L233). Week page: ThisWeek: [apps/mobile/src/components/ThisWeek.tsx:32–242](apps/mobile/src/components/ThisWeek.tsx#L32-L242). Existing slots and week-marked saves load; meal generation remains Milestone 2.
- [ ] Synchronize preferences and personal data between iPhone and iPad; make private content private by default. Updated October 27, 2026: Refresh-backed account sync and privacy are implemented; keep this unchecked until observed on signed iPhone and iPad.
  - **Location:** reload: [apps/mobile/src/App.tsx:315–346](apps/mobile/src/App.tsx#L315-L346); savePreferences: [apps/mobile/src/App.tsx:417–454](apps/mobile/src/App.tsx#L417-L454); [apps/api/test/database.test.ts:1–560](apps/api/test/database.test.ts#L1-L560); [docs/milestone-one-acceptance.md:1–45](docs/milestone-one-acceptance.md#L1-L45).

### Recipe discovery and saving — REC-01 through REC-06

- [x] Add replaceable recipe-provider adapters behind a normalized interface and supply a useful launch catalog without imports. Updated October 27, 2026: Twelve authorized original AI-generated, untested recipes: eight dinners, two lunches, two breakfasts. Personal drafts stay separate; hosted catalog activation is verified; new-account acceptance remains pending.
  - **Location:** [apps/api/src/recipe-provider.ts:1–45](apps/api/src/recipe-provider.ts#L1-L45); [packages/contracts/src/launch-recipes.json:1–1055](packages/contracts/src/launch-recipes.json#L1-L1055); [supabase/migrations/202610270004_starter_catalog.sql:1–7](supabase/migrations/202610270004_starter_catalog.sql#L1-L7); [apps/api/test/milestone-one.test.ts:1–200](apps/api/test/milestone-one.test.ts#L1-L200).
- [x] Implement recipe search, recommendations, and filters/ranking for meal type, cuisine, available/use-soon ingredients, time, difficulty, equipment, dietary preferences, history, ratings, and additional grocery cost. Updated October 27, 2026: Implemented with strict required-field filtering, deterministic reasons and unknown/unsourced cost exclusion. Context reports its record cap.
  - **Location:** discoverRecipes: [packages/contracts/src/discovery.ts:20–133](packages/contracts/src/discovery.ts#L20-L133); registerLibraryRoutes: [apps/api/src/library.ts:21–221](apps/api/src/library.ts#L21-L221); Shell: [apps/mobile/src/App.tsx:234–809](apps/mobile/src/App.tsx#L234-L809). Current browse UI: RecipeBrowser: [apps/mobile/src/components/RecipeBrowser.tsx:37–364](apps/mobile/src/components/RecipeBrowser.tsx#L37-L364).
- [x] Display recipe content and preserve optional metadata. Updated October 29, 2026: the default reader shows name, time, appliances, ingredients and preparation, as requested. Source/creator/URL, optional nutrition, history, rating, portion adjustment and editing remain in the separate management view. Generated personal details are labeled; permitted-image rules remain in place.
  - **Location:** RecipeDetails: [apps/mobile/src/components/RecipeDetails.tsx:20–400](apps/mobile/src/components/RecipeDetails.tsx#L20-L400); RecipePhoto: [apps/mobile/src/App.tsx:111–138](apps/mobile/src/App.tsx#L111-L138); Shell: [apps/mobile/src/App.tsx:234–809](apps/mobile/src/App.tsx#L234-L809).
- [x] Keep unknown values unknown; distinguish confirmed, inferred, and generated content. Updated October 27, 2026: Ingredient/recipe confidence and draft states are explicit; new manually changed ingredient lines are not assigned invented quantities.
  - **Location:** ingredientSchema: [packages/contracts/src/index.ts:9–18](packages/contracts/src/index.ts#L9-L18); recipeSchema: [packages/contracts/src/index.ts:19–73](packages/contracts/src/index.ts#L19-L73); RecipeDetails: [apps/mobile/src/components/RecipeDetails.tsx:20–400](apps/mobile/src/components/RecipeDetails.tsx#L20-L400).
- [x] Support serving adjustments while preserving ingredient notes and identifying quantities or instructions that require judgment. Updated October 27, 2026: Deterministic scaling preserves notes/raw text and flags whole-item, cooking-time and instruction review. Unknown original servings cannot be scaled.
  - **Location:** scaleRecipe: [packages/contracts/src/discovery.ts:135–157](packages/contracts/src/discovery.ts#L135-L157); RecipeDetails: [apps/mobile/src/components/RecipeDetails.tsx:20–400](apps/mobile/src/components/RecipeDetails.tsx#L20-L400); [apps/api/test/milestone-one.test.ts:1–200](apps/api/test/milestone-one.test.ts#L1-L200).
- [x] Save recipes, organize collections, create editable personal copies, and mark recipes for a specific week or next week. Updated October 27, 2026: Implemented as owner-scoped, revisioned/idempotent library operations; requires hosted migration activation.
  - **Location:** RecipeDetails: [apps/mobile/src/components/RecipeDetails.tsx:20–400](apps/mobile/src/components/RecipeDetails.tsx#L20-L400); registerLibraryRoutes: [apps/api/src/library.ts:21–221](apps/api/src/library.ts#L21-L221); [supabase/migrations/202610270003_discovery_library.sql:1–103](supabase/migrations/202610270003_discovery_library.sql#L1-L103); [apps/api/test/database.test.ts:1–560](apps/api/test/database.test.ts#L1-L560). Resilient private loading: loadLibrary: [apps/mobile/src/lib/load-library.ts:27–102](apps/mobile/src/lib/load-library.ts#L27-L102).
- [x] Keep source attribution separate from personal changes; label any AI-generated recipe or modification. Updated October 27, 2026: Original attribution is preserved; manual changes append notes and invalidate inherited derived claims. Generated starter content is labeled untested.
  - **Location:** RecipeDetails: [apps/mobile/src/components/RecipeDetails.tsx:20–400](apps/mobile/src/components/RecipeDetails.tsx#L20-L400); [supabase/migrations/202610270003_discovery_library.sql:1–103](supabase/migrations/202610270003_discovery_library.sql#L1-L103); recipeSchema: [packages/contracts/src/index.ts:19–73](packages/contracts/src/index.ts#L19-L73).

### Milestone 1 acceptance

- [ ] A new account can discover enough suitable catalog recipes for a complete week without importing anything.
  - **Location:** Acceptance pending. Supporting catalog implementation: catalog handler — [apps/api/src/app.ts:175–196](apps/api/src/app.ts#L175-L196); [supabase/seed.sql:1–11](supabase/seed.sql#L1-L11). Starter-catalog tests pass for default preferences; hosted new-account acceptance remains pending.
- [ ] A saved recipe and changed preference appear on a second device.
  - **Location:** Acceptance pending. Supporting functions: reload — [apps/mobile/src/App.tsx:315–346](apps/mobile/src/App.tsx#L315-L346); toggleSave — [apps/mobile/src/App.tsx:372–416](apps/mobile/src/App.tsx#L372-L416); savePreferences — [apps/mobile/src/App.tsx:417–454](apps/mobile/src/App.tsx#L417-L454). Two-device execution has not been verified.
- [ ] One account cannot access another account's private records.
  - **Location:** Acceptance pending. Supporting authentication/policies/tests: privateClient — [apps/api/src/app.ts:140–149](apps/api/src/app.ts#L140-L149); [supabase/migrations/202610260001_foundation.sql:22–34](supabase/migrations/202610260001_foundation.sql#L22-L34); [supabase/migrations/202610260002_personal_recipe_drafts.sql:8–16](supabase/migrations/202610260002_personal_recipe_drafts.sql#L8-L16); [supabase/tests/ownership.test.sql:1–26](supabase/tests/ownership.test.sql#L1-L26). Live authenticated isolation remains unverified.

## Milestone 2 — Planning and groceries

### Weekly planning — PLAN-01 through PLAN-08

- [ ] Generate an editable week from preferences, catalog/saved recipes, pantry, recent history, and budget estimates.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Apply dietary exclusions and equipment constraints before ranking candidates; explain conflicting preferences and offer alternatives.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Rank for use-soon/available ingredients, overlap, cuisine/protein variety, ratings, novelty, time/difficulty, additional spending, and expected unused package quantities.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [x] Model cooking sessions and leftover slots separately, linking leftovers to prepared portions rather than generating more ingredients. Implemented and tested in source November 3; signed-device acceptance remains separate.
  - **Location:** [weekly-planning.ts](packages/contracts/src/weekly-planning.ts), [WeeklyPlanner.tsx](apps/mobile/src/components/WeeklyPlanner.tsx), [planning tests](apps/api/test/weekly-planning.test.ts).
- [x] Default to three dinners yielding two portions each; allocate leftovers to available next-day lunch or dinner slots. Implemented and tested in source November 3; signed-device acceptance remains separate.
  - **Location:** [weekly-planning.ts](packages/contracts/src/weekly-planning.ts), [WeeklyPlanner.tsx](apps/mobile/src/components/WeeklyPlanner.tsx), [planning tests](apps/api/test/weekly-planning.test.ts).
- [x] Offer optional simple breakfast/lunch suggestions without automatically filling every slot or displacing leftovers. Implemented and tested in source November 3; signed-device acceptance remains separate.
  - **Location:** [weekly-planning.ts](packages/contracts/src/weekly-planning.ts), [WeeklyPlanner.tsx](apps/mobile/src/components/WeeklyPlanner.tsx), [planning tests](apps/api/test/weekly-planning.test.ts).
- [x] Support adding, removing, swapping, moving, locking, regenerating unlocked meals, serving changes, and future-week recipes. Implemented in source November 3. The kitchen upgrade is active; signed-device acceptance remains pending.
  - **Location:** [WeeklyPlanner.tsx](apps/mobile/src/components/WeeklyPlanner.tsx), [ThisWeek.tsx](apps/mobile/src/components/ThisWeek.tsx), [kitchen upgrade](docs/kitchen-upgrade.md).
- [x] Support slot states for cooking, leftovers, eating out, and unplanned meals. Implemented and tested November 3; native acceptance remains separate.
  - **Location:** [WeeklyPlanner.tsx](apps/mobile/src/components/WeeklyPlanner.tsx), [weekly-planning.ts](packages/contracts/src/weekly-planning.ts), [browser scenarios](tests/browser/recipes.spec.ts).
- [x] Explain ingredient overlap during swaps; avoid recent dishes when alternatives exist while allowing intentional repeats. Implemented and tested November 3; native acceptance remains separate.
  - **Location:** [weekly-planning.ts](packages/contracts/src/weekly-planning.ts), [WeeklyPlanner.tsx](apps/mobile/src/components/WeeklyPlanner.tsx), [planning tests](apps/api/test/weekly-planning.test.ts). The default is the user-selected 28 days; Profile can change it. This uses recorded history; cooking-history capture remains pending.
- [x] Recalculate affected requirements after changes, preserving locks, unrelated groceries, and user edits. Implemented and tested November 3; native acceptance remains separate.
  - **Location:** [planning-workflow.ts](apps/mobile/src/lib/planning-workflow.ts), [WeeklyPlanner.tsx](apps/mobile/src/components/WeeklyPlanner.tsx), [foundation SQL](supabase/migrations/202610270002_transactional_mutations.sql).

### Kitchen and pantry — PAN-01 through PAN-07

- [x] Add pantry staples, available ingredients, use-soon flags, and optional quantities/units. Implemented in source November 3; local SQL and browser tests pass. Hosted kitchen activation is confirmed November 3; signed-device acceptance remains pending.
  - **Location:** [Kitchen.tsx](apps/mobile/src/components/Kitchen.tsx), [RegularPurchases.tsx](apps/mobile/src/components/RegularPurchases.tsx), [kitchen upgrade](docs/kitchen-upgrade.md).
- [x] Add a kitchen check before finalizing groceries and ask how to handle unknown available quantities. Implemented and tested in source November 3. Unknown/unreviewed amounts stay unknown; the preview requests an explicit pantry decision and checks pantry revisions before saving.
  - **Location:** [grocery-calculation.ts](packages/contracts/src/grocery-calculation.ts), [planning-workflow.ts](apps/mobile/src/lib/planning-workflow.ts), [quantity tests](apps/api/test/grocery-calculation.test.ts).
- [x] Treat missing pantry records as unknown availability; never silently subtract unknown amounts. Implemented and tested in source November 3. Unknown/unreviewed amounts stay unknown; the preview requests an explicit pantry decision and checks pantry revisions before saving.
  - **Location:** [grocery-calculation.ts](packages/contracts/src/grocery-calculation.ts), [planning-workflow.ts](apps/mobile/src/lib/planning-workflow.ts), [quantity tests](apps/api/test/grocery-calculation.test.ts).
- [ ] Offer optional pantry updates after cooking. Checking off purchases must not create exact inventory balances automatically.
  - **Location:** Not implemented; no function or code line range exists for this task yet.

### Grocery calculation and shopping — GROC-01 through GROC-10

- [x] Generate one list from cooking events, selected regular purchases, and manual additions, retaining each item's origins. Implemented in source November 3. Cooking-session origins are retained; selected regular/manual purchases survive plan regeneration. Regular inclusion requires the kitchen upgrade.
  - **Location:** [grocery-calculation.ts](packages/contracts/src/grocery-calculation.ts), [RegularPurchases.tsx](apps/mobile/src/components/RegularPurchases.tsx), [kitchen upgrade](docs/kitchen-upgrade.md).
- [x] Normalize compatible ingredients/units and serving quantities deterministically, preserving original text when uncertain. Implemented and tested in source November 3. Unknown/unreviewed amounts stay unknown; the preview requests an explicit pantry decision and checks pantry revisions before saving.
  - **Location:** [grocery-calculation.ts](packages/contracts/src/grocery-calculation.ts), [planning-workflow.ts](apps/mobile/src/lib/planning-workflow.ts), [quantity tests](apps/api/test/grocery-calculation.test.ts).
- [x] Keep incompatible forms separate; require ingredient-specific conversions before converting volume to weight. Implemented and tested in source November 3. Unknown/unreviewed amounts stay unknown; the preview requests an explicit pantry decision and checks pantry revisions before saving.
  - **Location:** [grocery-calculation.ts](packages/contracts/src/grocery-calculation.ts), [planning-workflow.ts](apps/mobile/src/lib/planning-workflow.ts), [quantity tests](apps/api/test/grocery-calculation.test.ts).
- [x] Support reusable regular-purchase templates with quantities, cadence, and weekly inclusion. Implemented in source November 3; local SQL and browser tests pass. Hosted kitchen activation is confirmed November 3; signed-device acceptance remains pending.
  - **Location:** [Kitchen.tsx](apps/mobile/src/components/Kitchen.tsx), [RegularPurchases.tsx](apps/mobile/src/components/RegularPurchases.tsx), [kitchen upgrade](docs/kitchen-upgrade.md).
- [x] Support manual weekly grocery additions, checking/unchecking to cross items off, removal, refresh and week isolation. Completed October 29, 2026 in source; automated browser persistence/failure checks pass. Live signed-device acceptance remains pending.
  - **Location:** [WeeklyGroceryList.tsx](apps/mobile/src/components/WeeklyGroceryList.tsx), [weekly-groceries.ts](apps/mobile/src/lib/weekly-groceries.ts), [browser checks](tests/browser/recipes.spec.ts).
- [x] Implement grocery-section grouping, quantity editing and editable notes/section overrides. Source and automated tests pass November 3. Hosted activation and real-account note/section edit/reload are user-confirmed; signed-device acceptance remains separate.
  - **Location:** [WeeklyGroceryList.tsx](apps/mobile/src/components/WeeklyGroceryList.tsx), [offline-groceries.ts](apps/mobile/src/lib/offline-groceries.ts), [grocery-details API](apps/api/src/grocery-details.ts), [activation guide](docs/grocery-details-upgrade.md).
- [x] Make recalculation idempotent; preserve manual additions, overrides, valid checked states, and deliberate item deletions; highlight changed quantities. Implemented and tested November 3; native acceptance remains separate.
  - **Location:** [grocery-review.ts](packages/contracts/src/grocery-review.ts), [WeeklyPlanner.tsx](apps/mobile/src/components/WeeklyPlanner.tsx), [grocery review tests](apps/api/test/grocery-review.test.ts), [browser scenarios](tests/browser/recipes.spec.ts).
- [ ] Validate shopping interactions with one hand on an actual phone. Large tap targets, row checkboxes and Add/Enter entry are implemented; in-store/native usability acceptance remains pending.
  - **Location:** [WeeklyGroceryList.tsx](apps/mobile/src/components/WeeklyGroceryList.tsx).

### Budget estimates — BUD-01 through BUD-08

- [x] Include all grocery checkout purchases: dinner, breakfast, lunch, snacks, regular purchases, manual additions, non-food groceries, sales tax and delivery fees. Confirmed scope and weekly budget behavior: `docs/grocery-budget-requirements.md:5`. Implemented in source November 3: all undeleted weekly items count, including checked/manual/regular/household purchases. Unknown prices, tax and fees remain explicit; no tax treatment is inferred.
  - **Location:** [checkout calculation](packages/contracts/src/checkout.ts), [checkout API](apps/api/src/checkout.ts).
- [ ] Estimate checkout spend using purchasable package sizes where available; distinguish it from per-serving cost and user-entered actual spending. Let the user enter/edit a final weekly actual total separately from the estimate: `docs/grocery-budget-requirements.md:5`. November 3: package-basis calculation and separate actual-spending storage/UI are implemented and tested; the initial catalog contains standard-unit averages only, and hosted weekly-total activation is confirmed by user SQL success and the read-only function/privacy check; authenticated save/reload is user-confirmed.
  - **Location:** [checkout calculation](packages/contracts/src/checkout.ts), [CheckoutSummary.tsx](apps/mobile/src/components/CheckoutSummary.tsx), [weekly totals migration](supabase/migrations/202611030002_weekly_checkout.sql), [limits](docs/massachusetts-pricing.md).
- [x] Store source, applicable store/region, currency, observation time, package size, confidence, and price/range. Implemented for the initial Northeast reference catalog, requested region Massachusetts. Observation month is preserved; store and package size are explicitly unverified.
  - **Location:** [reference catalog](packages/contracts/src/northeast-price-references.json), [price schemas](packages/contracts/src/checkout.ts), [pricing documentation](docs/massachusetts-pricing.md).
- [x] Mark missing prices as incomplete estimates or ranges; never count an unknown price as zero. Implemented and tested, including the $130 priced-subtotal/unpriced-item case and unknown tax/fees.
  - **Location:** [checkout calculation](packages/contracts/src/checkout.ts), [checkout tests](apps/api/test/checkout.test.ts).
- [ ] Suggest lower-cost meals, substitutions, and available ingredients when over budget. Show the difference and require user approval before applying cheaper swaps: `docs/grocery-budget-requirements.md:5`.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [x] Label prices as estimates and avoid exact retailer price/stock claims without a verified integration. Implemented with source/month/geography and standard-unit versus package-basis labels. No store price or stock claim is made.
  - **Location:** [CheckoutSummary.tsx](apps/mobile/src/components/CheckoutSummary.tsx), [pricing documentation](docs/massachusetts-pricing.md).

### Offline access and synchronization

- [x] Cache current groceries, planned recipes, and recent saved recipes in local mobile storage. Implemented and tested in source November 3. Native performance and physical two-device acceptance remain pending.
  - **Location:** [offline-groceries.ts](apps/mobile/src/lib/offline-groceries.ts), [library-cache.ts](apps/mobile/src/lib/library-cache.ts), [ThisWeek.tsx](apps/mobile/src/components/ThisWeek.tsx), [sync tests](apps/api/test/offline-groceries.test.ts), [browser tests](tests/browser/recipes.spec.ts).
- [x] Support offline grocery viewing/checking/editing and cached recipe viewing. Implemented and tested in source November 3. Native performance and physical two-device acceptance remain pending.
  - **Location:** [offline-groceries.ts](apps/mobile/src/lib/offline-groceries.ts), [library-cache.ts](apps/mobile/src/lib/library-cache.ts), [ThisWeek.tsx](apps/mobile/src/components/ThisWeek.tsx), [sync tests](apps/api/test/offline-groceries.test.ts), [browser tests](tests/browser/recipes.spec.ts).
- [x] Queue offline edits with unique operation IDs and visible pending/success/failed states; synchronize on reconnection. Implemented and tested in source November 3. Native performance and physical two-device acceptance remain pending.
  - **Location:** [offline-groceries.ts](apps/mobile/src/lib/offline-groceries.ts), [library-cache.ts](apps/mobile/src/lib/library-cache.ts), [ThisWeek.tsx](apps/mobile/src/components/ThisWeek.tsx), [sync tests](apps/api/test/offline-groceries.test.ts), [browser tests](tests/browser/recipes.spec.ts).
- [x] Merge at item level, preserving edits to different items and detecting conflicting edits to the same field. Implemented and tested in source November 3. Native performance and physical two-device acceptance remain pending.
  - **Location:** [offline-groceries.ts](apps/mobile/src/lib/offline-groceries.ts), [library-cache.ts](apps/mobile/src/lib/library-cache.ts), [ThisWeek.tsx](apps/mobile/src/components/ThisWeek.tsx), [sync tests](apps/api/test/offline-groceries.test.ts), [browser tests](tests/browser/recipes.spec.ts).
- [x] Ensure retries cannot duplicate grocery items or meal slots; reject stale revisions and provide a recovery flow. Implemented and tested in source November 3. Native performance and physical two-device acceptance remain pending.
  - **Location:** [offline-groceries.ts](apps/mobile/src/lib/offline-groceries.ts), [library-cache.ts](apps/mobile/src/lib/library-cache.ts), [ThisWeek.tsx](apps/mobile/src/components/ThisWeek.tsx), [sync tests](apps/api/test/offline-groceries.test.ts), [browser tests](tests/browser/recipes.spec.ts).

### Milestone 2 acceptance

- [ ] Three cooking sessions yield six portions; leftover slots create no duplicate ingredient requirements.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] Optional breakfasts/lunches respect leftover allocations.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] Swapping a dinner uses available ingredients, preserves locked meals, and updates groceries without losing manual purchases.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] Two half onions merge into one; fresh and canned tomatoes remain separate; uncertain pantry amounts require a decision.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] Repeated list generation preserves manual yogurt/snacks, overrides, and valid checked states without duplicates.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] A $130 estimate with unpriced items remains visibly incomplete.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] Checking milk offline on iPhone and adding bread online on iPad preserves both edits after synchronization.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.

## Milestone 3 — Imports and assistant

### Recipe imports — IMP-01 through IMP-08

- [ ] Implement manual URL entry and a native iOS Share Extension that saves incoming links promptly and hands off asynchronous processing.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Configure shared app/extension storage and ownership-safe handoff to the signed-in account.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Save bookmarks immediately, detect duplicate URLs within a user's collection, and offer open/update behavior.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Build queued import workers that prefer structured recipe metadata and access only legitimately accessible social content.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Model `queued -> processing -> needs_review -> ready`, with `link_only` and `failed` alternative outcomes, progress, and retry.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Preserve original links, extracted fields, warnings, attribution, and partial imports across failures.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Build a review editor for missing/uncertain data, pasted captions/text, inferred values, and manual completion.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Require reviewed ingredient quantities for automatic groceries and usable instructions for cooking mode.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Restrict URL schemes, destinations, redirects, payload sizes, and timeouts to prevent unsafe server-side fetching.
  - **Location:** Not implemented; no function or code line range exists for this task yet.

### Conversational assistant — CHAT-01 through CHAT-09

- [ ] Add server-side model access, structured outputs, and narrow validated tools: recipe search, week context, meal replacement, grocery addition, pantry updates, recipe saving, and Undo.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Support authorized meal add/move/remove/replace, serving changes, grocery add/remove, pantry additions, recipe saving, and overlap/budget explanations.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Load current preferences, plan, pantry, and authorized recipes into scoped context.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Separate exploratory questions from edit instructions; execute clear requests and clarify only consequential ambiguity.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Validate ownership, input schema, expected revision, and idempotency for every tool mutation; the model must never write directly to the database.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Commit meal and grocery changes together, record before/after revisions, show actual outcomes, and provide Undo with conflict handling.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Reject stale assistant writes, reload context before retrying, and prevent duplicate effects.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Treat imported pages, captions, recipes, and other external text as untrusted data that cannot authorize actions or override instructions.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Obtain explicit consent before sending personal data to third-party AI services and document the processing behavior.
  - **Location:** Not implemented; no function or code line range exists for this task yet.

### Milestone 3 acceptance

- [ ] An inaccessible social post remains a saved link with an editable fallback; unknown quantities never become confirmed groceries silently.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] Website and real-device TikTok/Instagram sharing follow documented extraction and fallback paths.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] “What could I make?” makes no changes; “Add eggs to my grocery list” applies once or resolves an existing entry and offers Undo.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] A request to use spinach and replace a dinner with something cheaper updates the plan and groceries consistently.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] Failed tools are reported as failed, stale writes are rejected, and imported prompt-injection text cannot trigger unauthorized changes.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.

## Milestone 4 — History, sharing, and release

### Cooking history and ratings — HIST-01 through HIST-05

- [ ] Add cooking mode and mark-cooked actions with date, prepared servings, and optional notes.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Preserve an immutable snapshot/version reference for what was actually cooked.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Add editable one-to-five-star personal ratings and saved-recipe filters for cooked, uncooked, favorites, ratings, and recency.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Use ratings/history in recommendations while preserving discovery and intentional repeats.
  - **Location:** Not implemented; no function or code line range exists for this task yet.

### Recipe sharing — SHARE-01 through SHARE-07

- [ ] Share through the system sheet/text messages and private account invitations or share links without a public user directory.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Let recipients save independent copies; include the sender's rating only when selected.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Limit access to explicitly shared recipe content; exclude pantry, groceries, chats, and cooking history.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Enforce provider redistribution rules; fall back to attribution and original links where full redistribution is unavailable.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Add scoped/revocable share tokens, Universal Links, and a useful browser fallback.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Add reporting, blocking, moderation, and support controls appropriate to shared content.
  - **Location:** Not implemented; no function or code line range exists for this task yet.

### Privacy and operations

- [ ] Implement in-app account deletion with clear status, associated data/job cleanup, and documented backup retention behavior. Source implementation and automated cleanup/privacy checks pass November 3. The user confirmed the hosted cleanup migration and readiness result true. Server credential setup, disposable-account/device acceptance, actual backup retention and restoration procedures remain launch blockers.
  - **Location:** [AccountDeletion.tsx](apps/mobile/src/components/AccountDeletion.tsx), [account API](apps/api/src/account.ts), [cleanup migration](supabase/migrations/202611030004_account_deletion.sql), [activation and limits](docs/account-deletion.md).
- [ ] Define data export, retention, deletion, backups, and third-party processing; verify backup restoration.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Enforce encrypted traffic, protected authentication storage, secret management, and appropriate API/job rate limits.
  - **Location:** Partial implementation: protected session storage/client — [apps/mobile/src/lib/supabase.ts:8–48](apps/mobile/src/lib/supabase.ts#L8-L48); redaction and API rate limiting — [apps/api/src/app.ts:29–267](apps/api/src/app.ts#L29-L267); api — [apps/mobile/src/lib/transport.ts:3–53](apps/mobile/src/lib/transport.ts#L3-L53). Deployment TLS, secret management and job limits remain pending.
- [ ] Provide privacy/support URLs and review provider permissions and applicable App Store requirements before submission.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Add traceable import, planning, chat, and sync failure monitoring with private-content redaction.
  - **Location:** Not implemented; no function or code line range exists for this task yet.
- [ ] Document deployment, migrations, provider configuration, recovery procedures, and ongoing hosting/data/AI/storage/monitoring costs separately from users' grocery budgets.
  - **Location:** Partial documentation/configuration: [README.md:1–103](README.md#L1-L103); [docs/architecture.md:1–32](docs/architecture.md#L1-L32); [docs/backend-services-decision.md:1–48](docs/backend-services-decision.md#L1-L48); [apps/mobile/eas.json:1–21](apps/mobile/eas.json#L1-L21). Production deployment/recovery and complete operational runbooks remain pending.

### Quality and release validation

- [ ] Add unit tests for quantities, compatible/incompatible conversions, serving arithmetic, leftover allocation, grocery regeneration, pantry uncertainty, and budget uncertainty.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] Add integration tests for authorization, revision conflicts, transactions, idempotency, Undo, offline reconciliation, deletion, and share isolation.
  - **Location:** Partial existing tests: [apps/api/test/app.test.ts:1–344](apps/api/test/app.test.ts#L1-L344); [supabase/tests/ownership.test.sql:1–26](supabase/tests/ownership.test.sql#L1-L26). API tests cover auth rejection, revisions and save retries; transactions, Undo, offline reconciliation, deletion and sharing are not implemented/tested.
- [ ] Add provider contract tests for recipe discovery, metadata parsing, inaccessible content, partial imports, and fallback states.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] Test Share Extension, deep links, iPhone/iPad synchronization, and offline shopping on supported devices.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] Verify VoiceOver labels, Dynamic Type, contrast, touch targets, and adaptive iPad layouts.
  - **Location:** Acceptance pending. Supporting controls/layout: Button — [apps/mobile/src/App.tsx:140–173](apps/mobile/src/App.tsx#L140-L173); Shell — [apps/mobile/src/App.tsx:234–809](apps/mobile/src/App.tsx#L234-L809); Suggestions — [apps/mobile/src/components/ProfileFields.tsx:52–198](apps/mobile/src/components/ProfileFields.tsx#L52-L198). No completed device accessibility verification.
- [ ] Validate proposed targets: cached groceries usable within one second; ordinary online reads at p95 within two seconds excluding external jobs; immediate progress for planning/imports; at least 99.5% crash-free beta sessions.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] Verify later recipe edits do not alter cooking history and recipients receive only explicitly shared information.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] Run the full journey: new account -> discover -> plan -> kitchen check -> groceries -> offline shopping -> cook -> rate -> share, including import and chat adjustments.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] Observe a user completing a weekly plan, kitchen check, and grocery list in approximately ten minutes.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] Complete TestFlight validation, resolve release blockers, and prepare screenshots, app metadata, privacy disclosures, reviewer access, and the App Store submission checklist.
  - **Location:** Verification pending; no implemented test or completed verification artifact for this specific check exists yet.
- [ ] Deliver source, setup instructions, migrations, API specification, provider configuration, automated checks, deployment instructions, and release checklist.
  - **Location:** Partial repository artifacts: [README.md:1–103](README.md#L1-L103); [.github/workflows/ci.yml:1–33](.github/workflows/ci.yml#L1-L33); [docs/architecture.md:1–32](docs/architecture.md#L1-L32). Full specification, provider/deployment configuration and release checklist remain pending.

## Deferred beyond the first release

These items require a separate scope decision before implementation.

- Public feed, followers, and direct messaging.
- Grocery ordering/checkout and guaranteed live retailer pricing/inventory.
- Receipt scanning and barcode inventory.
- Automatic private social-account or saved-post-library access.
- Full video transcription as a prerequisite for every import.
- Detailed macro/calorie targets and health integrations.
- Android support.
- Shared household pantry and collaborative meal planning.
