# Table for One

An iPhone/iPad meal-planning app for people cooking for themselves. This repository contains the initial framework from TODO.md, using Supabase PostgreSQL and Auth.

Current handoff: [November 4 progress and remaining work](TODO.md#latest-checkpoint---november-4-2026). Core mode now hides deferred AI entry points in previews and release builds. AI and secret-key setup remain deferred at the user's request. See the [first-release checklist](docs/first-release.md) and [App Store copy draft](docs/app-store-draft.md). The [kitchen upgrade](docs/kitchen-upgrade.md) is active, and the user confirmed an authenticated pantry save with an unknown amount.

Massachusetts checkout estimates now use a limited, labeled Northeast BLS reference catalog. The [weekly checkout upgrade](docs/massachusetts-pricing.md#activate-account-backed-totals) is active; the user confirmed actual spending saves and survives refresh in the real signed-in account. Unknown prices and package sizes keep estimates incomplete.

## What works in this foundation

- Expo React Native app with adaptive iPhone navigation and iPad sidebar, recipe search/detail, account creation/sign-in/sign-out, saving/removing recipes, and a weekly budget preference.
- Fastify API with shared Zod contracts, validated Supabase tokens, structured errors, server-generated request IDs, rate limiting, health/readiness checks, and graceful shutdown.
- Supabase migrations for the catalog, saved recipes, and revisioned preferences. Ownership is enforced by PostgreSQL row-level security, including when accessing Supabase directly. No service-role key is used.
- Six AI-generated, untested development recipes with explicit provenance and unknown normalized quantities. These are fixtures, not the launch catalog.

Editable weekly plan previews, linked leftovers, reviewed recipe-derived groceries, offline shopping and cached recipe/plan reading are implemented. Pantry editing, regular purchases and meal locks are implemented behind the kitchen upgrade activation check. Imports, assistant, sharing, full checkout estimates and release workflows remain unfinished. Shopping retries on refresh, foregrounding and periodically while open; general account changes still use refresh rather than realtime subscriptions. See [behavior and limits](docs/offline-and-planning.md).

## Chrome phone preview

Run `npm run preview` from the repository root, then open http://localhost:8081/phone.html in Chrome. Choose iPhone, large iPhone, or iPad to change the actual app viewport. The same React Native screens run through Expo Web.

Without mobile Supabase environment variables, the browser uses a clearly labeled local demo: six sample recipes, saves, and the weekly budget. Demo edits persist only in this browser's local storage; they do not create a Supabase account or sync to devices. Remove the `meal-planner-browser-demo-v1` localStorage entry to reset it.

With Supabase configured, start the API too. The development API accepts requests from http://localhost:8081; set WEB_ORIGIN on the API to use another browser origin. Sign-in sessions persist across reloads and app restarts: web uses browser local storage, and iOS uses SecureStore. Sessions refresh automatically and are removed when you sign out. Clearing browser storage or a server-revoked session requires signing in again. Share extensions, Keychain behavior, and native gestures still require an iOS build.

## Profile

Milestone 1 account/preferences and recipe-library implementation is described in [the acceptance guide](docs/milestone-one-acceptance.md). Apply the reviewed development upgrade before using the updated API. Hosted and signed-device acceptance remains pending.

Open **More > Profile** on iPhone (or **Profile** in the iPad sidebar) to create/sign into an account, recover a password, and review onboarding defaults. Edit cooking routine, dietary needs, equipment, stores, regular groceries, nutrition preference, units, time zone and week start; save to persist account preferences. Groceries provides weekly ceiling overrides and reset. Discover explains recommendations; Saved supports private copies, collections and week assignments. Pull to refresh or use **Refresh from other devices** to reload account data. Browser demo edits remain local. Native and live-account acceptance is still pending.

## Local setup

For a hosted API preview, see [free Render backend setup](docs/render-setup.md). The root `render.yaml` configures a free web service using the existing Supabase database.

See [the development setup guide](docs/development-setup.md) for configuration, migrations, separate environments, monitoring and feature switches. Preserve existing `.env` files. The hosted development database is initialized; do not rerun the one-time setup SQL.

Use Node.js 24 and npm. Local Supabase also requires Docker and the Supabase CLI. Run from the repository root:

```powershell
npm ci
supabase start
supabase db reset
if (!(Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
if (!(Test-Path apps/mobile/.env)) { Copy-Item apps/mobile/.env.example apps/mobile/.env }
```

`supabase db reset` destroys local database contents and recreates schema/fixtures. Use it only for your disposable local environment. Get the local URL and anon key from `supabase status`; enter them in both .env files. For a hosted Supabase development project, apply the migration through the Supabase CLI or SQL editor, then load seed.sql only if you want development fixtures. Never load these fixtures into production automatically. Auth settings must permit email/password sign-up. Hosted email confirmation remains enabled; confirm the email before signing in. The local Supabase email inbox is available through the URL shown by `supabase status`.

Use only a publishable key (or local legacy anon key), never a secret/service-role key in the app. The API also deliberately uses the publishable key plus the user's bearer token so RLS remains active.

Start these in separate terminals:

```powershell
npm run dev:api
npm run dev:mobile
```

On a physical iPhone, use your computer's LAN IP for EXPO_PUBLIC_API_URL and the local Supabase URL in **both** environment files; localhost on the phone refers to the phone. Ensure the device can reach those ports. Alternatively use a separate hosted Supabase development project. Restart Expo after environment changes.

The mobile app uses native SecureStore and needs an iOS development build. On a Mac with Xcode, run `npm run ios -w @meal/mobile`. On Windows, use EAS Build with an Expo account, Apple signing credentials, a unique bundle identifier in app.json, and a registered device: `npx eas-cli build --platform ios --profile development` from apps/mobile. Install that build and connect it to the Metro server. No Apple credentials or hosted project is configured by this repository.

## Checks

Run `npm run test:web:core` for the core-release browser flows, or `npm run test:web` for the development extended-scope regression suite. Both use isolated API/session fixtures rather than real account writes; see [browser regression checks](docs/browser-regression-checks.md). Windows uses installed Chrome; CI installs Playwright Chromium and runs both modes.

With the API running against your development Supabase project, run `npm run check:connection -w @meal/api`. This read-only check verifies health, database reachability, a catalog recipe and anonymous-save rejection. It does not create accounts or prove cross-device synchronization. Set `API_CHECK_URL` to check a reachable hosted API instead of localhost. API startup accepts hosting-provided environment variables without a local `.env` file; local development still uses the example environment files above.

```powershell
npm run check
```

This runs lint, strict TypeScript checks across all workspaces, the API/contract tests, and formatting checks in the same order as CI. Formatting and lint exclude generated `tmp/`, `output/`, build and coverage files. To run an individual check or the local database policy suite:

```powershell
npm run lint
npm run typecheck
npm test
npm run format:check
supabase test db
```

Database tests need the local Supabase stack and seeded fixtures. CI runs the TypeScript/API checks and a separate database-policy job. Manual acceptance: create two accounts, save a recipe and change budget with account A, sign in as A on a second device and refresh; then sign in as B and confirm A's saves and budget are inaccessible. Test iPhone and iPad independently.

## API

See [database/API foundation](docs/database-api-foundation.md) and the generated [OpenAPI specification](docs/openapi.json) for domain reads, plan/grocery transactions and recovery. Apply the two October 27 migrations before deploying the updated API; no hosted migration was executed here. Every write now requires an `Idempotency-Key`, supplied by the mobile transport.

All responses include x-request-id. Private routes require `Authorization: Bearer <Supabase access token>`.

| Method       | Path                             | Behavior                                            |
| ------------ | -------------------------------- | --------------------------------------------------- |
| GET          | /health                          | Process status and disabled feature flags           |
| GET          | /ready                           | Database/catalog reachability                       |
| GET          | /v1/recipes?q=&offset=0&limit=20 | Public catalog, stable pagination; details included |
| GET          | /v1/saved                        | Current user's saved recipe IDs                     |
| PUT / DELETE | /v1/saved/:recipeId              | Repeat-safe save/removal                            |
| GET          | /v1/preferences                  | Current preferences and revision                    |
| PUT          | /v1/preferences                  | `{revision, preferences}`; 409 on stale revision    |

Errors use `{error: {code, message, requestId, fields?}}`. Invalid input returns 400; invalid authentication 401. Reload data after a 409 before reapplying an edit. Shared schemas live in packages/contracts. `npm run check` verifies the generated OpenAPI specification.

## Verification status

As of November 4: full `npm run check` passes, including lint, TypeScript, all 65 backend/configuration/contract/PostgreSQL tests, API specification consistency and repository formatting. All 23 isolated browser scenarios pass in both core and development modes, including Settings, weekly picks, offline groceries and separate actual spending. Earlier live-account grocery persistence, Saved details and pantry saves are user-confirmed. No new hosted checks or writes were performed during this checkpoint. Native builds, full accessibility, new-account/recovery/cross-account and physical two-device acceptance remain pending. See the latest checkpoint in TODO.md for exact scope.

## Next steps

Weekly planning links to Discover and Saved with **+ Add to week** on recipe cards, a selected-week banner and return navigation. **Find a recipe** opens ordinary Discover browsing in core mode, the default. Signed-in users can open **Recipe chat** or request **AI meal suggestions** in Discover. The API loads `OPENAI_API_KEY` from the root `.env.local` (or server environment); restart the API after changing it. Optional `OPENAI_MODEL` defaults to `gpt-4.1-mini`. The key stays server-side. Requests send the conversation, food preferences and up to 20 matching recipe titles to OpenAI with response storage disabled. Conversations remain in screen memory only; AI suggestions do not modify weekly plans.

Resume with `npm run dev:api` and `npm run preview`, using existing running services if present. Verify planning/regular purchases and meal locks in the real account, then validate native/two-device behavior. Real-account [grocery note/section edits](docs/grocery-details-upgrade.md) now survive refresh, confirmed by the user. Planning defaults to avoiding recorded cooked dishes from the past four weeks, permits intentional repeats, supports unplanned slots and previews changed grocery amounts before saving. Remaining work includes broader verified price/package coverage and cheaper-meal suggestions, imports/Share Extension, assistant, cooking history/ratings/sharing and release operations. Review and kitchen-test the AI-drafted personal recipes.

The approved first public release is scoped in [the release checklist](docs/first-release.md). Account deletion is implemented in source but awaits [server/database activation and disposable-account acceptance](docs/account-deletion.md). No real account was deleted during implementation.
