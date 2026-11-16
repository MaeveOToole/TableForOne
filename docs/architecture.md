# Foundation decisions - October 26, 2026

## Selected

- npm workspaces and TypeScript: mobile, API, and shared runtime contracts.
- Expo development builds: native iOS modules remain available, with shared React Native screens. Expo SDK 58 and its compatible native module versions form the initial baseline; review supported releases before production. Expo Go is not the acceptance environment.
- Supabase PostgreSQL and Auth, as requested. RLS protects private data, the API validates tokens through Supabase Auth, and credentials are kept in iOS SecureStore. API database calls carry the same user token; there is no administrative bypass.
- Fastify modular API: external provider/AI integrations will remain server-side. Keep deterministic quantity, leftover, grocery, and money logic in a future domain package with dedicated tests.
- Additive SQL migrations under supabase/migrations. User preferences initialize through an auth trigger; account deletion cascades private foundation tables. A deletion UI and full lifecycle cleanup are not yet implemented.
- Save/remove use stable user/recipe keys and repeat-safe semantics. Preferences require compare-and-set revisions. This is not the general mutation/undo framework needed for plans and groceries.

## Service selections and pending implementation

- Expo Share Extension config plugin, app groups, handoff ownership and Universal Links: prototype on real iOS devices before committing to the extension implementation. Expo supports extensions through native config plugins: https://docs.expo.dev/build-reference/app-extensions/.
- Local persistence: select Expo SQLite with SQL migrations and a durable operation outbox. Implementation awaits the grocery item conflict model; see docs/backend-services-decision.md.
- Background queue: select Supabase Queues/pgmq with a separate Node worker. Not implemented; imports and AI remain disabled until worker and consent flows exist.
- Hosting: select Render for the API and worker, targeting Virginia alongside Supabase US East. Use local development and separate hosted staging/production resources. No deployments created; see docs/backend-services-decision.md for deployment prerequisites.
- Operating costs: estimates and assumptions are recorded in docs/backend-services-decision.md. Base staging plus production with workers is approximately $63/month, before Apple membership, optional plans, variable services and overages. No spending committed. Recipe licensing and AI are unpriced; keep operating costs separate from the $150 grocery budget.
- Catalog source selected: user-supplied collection of 48 ChatGPT-suggested entries for personal use, with text-only storage/caching and no public redistribution in scope; see docs/recipe-collection.md:75. Runtime still uses development fixtures. Complete recipe details and integration remain pending; new clearly labeled AI-generated recipes are selected for the first release, with implementation pending; see docs/grocery-budget-requirements.md.
- Minimum versions: iOS/iPadOS 16.4, explicit in apps/mobile/app.json. Device/simulator matrix and access inventory are in docs/ios-test-matrix.md. User has a PC, iPhone and iPad and reports OS 26.2.2 (per-device assignment pending). Mac/Xcode and Apple membership/signing access remain unverified; native tests have not run.

## Boundaries

Catalog, saves and preferences have mobile workflows. Additive October 27 migrations provide the remaining domain schemas and API/transaction foundation described in docs/database-api-foundation.md. Future feature workflows remain separate; do not infer nutritional facts, prices or quantities from missing data. No AI requests, retailer claims or social extraction are implemented. The user selected saving a new plan with groceries marked needs_review when its grocery subtransaction fails; stored projections support explicit repair.

API monitoring logs contain safe route templates, status, duration and generated request IDs, omitting raw URLs, request bodies, credentials and raw upstream errors. Environment configuration, feature switches and the monitoring runbook are in docs/development-setup.md. IP-based in-memory rate limits are a development baseline; configure trusted proxy behavior and a shared limiter before scaling. Readiness distinguishes process health from database availability. External alert provisioning, retention and production recovery remain deployment/release work.

Supabase React Native authentication reference: https://supabase.com/docs/guides/auth/quickstarts/react-native.

## Dependency audit at scaffold time

Expo SDK 58 tooling currently brings npm advisories for node-forge (no newer fixed release was available in the registry during setup) and a nested Zod dependency. Compatible automatic fixes were applied; the audit suggested a major Expo downgrade for the remainder, which was not applied. Recheck `npm audit` before distribution and update the Expo toolchain when upstream fixes are available.
