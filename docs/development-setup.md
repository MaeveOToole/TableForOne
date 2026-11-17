# Repository and environment setup

Repository setup covers the current foundation. Provisioning hosted services, signing iOS builds, database-policy execution and device acceptance remain separate work. The existing hosted development database is initialized: do not rerun `supabase/setup-development.sql`.

## Reproducible local setup

Use Node.js 24 (`.node-version`) and the committed npm lockfile. From the repository root run `npm ci`, then `npm run check`. Checks run lint, strict types, API/contract tests and formatting without database credentials. CI runs the same command and separately runs PostgreSQL ownership tests against disposable Supabase.

For a new checkout, copy `apps/api/.env.example` to `apps/api/.env` and `apps/mobile/.env.example` to `apps/mobile/.env` only if the destination does not already exist. Fill in the development project URL and publishable key locally. Preserve existing configuration. `.env` files, build output and temporary files are ignored by version control. Examples contain placeholders only. Never put service-role keys, database passwords or AI keys in the mobile app; `EXPO_PUBLIC_*` values are embedded in the client.

Start `npm run dev:api` and `npm run dev:mobile` in separate terminals. Use `npm run preview` for the browser. For physical devices, set reachable LAN/hosted API and Supabase URLs; phone localhost is the phone. The API example binds to `0.0.0.0` for LAN development. Set `WEB_ORIGIN` to the browser preview origin when needed.

## Database migrations and fixtures

For disposable local development, install Docker and Supabase CLI, run `supabase start`, then `supabase db reset` and `supabase test db`. Reset destroys the local database and applies ordered migrations and `supabase/seed.sql`. The seed contains six generated development fixtures. Tests roll back their own account/private-recipe fixtures. Never reset a hosted database or seed production with development recipes.

For initialized hosted development, use the canonical files in `supabase/migrations` and track migration history. Do not execute combined one-time setup again. If initialized manually, reconcile applied migrations with migration history before CLI pushes. Review pending SQL against the target environment before applying it. The personal-recipe import is a separate optional, account-scoped script, not an automatic seed or production migration.

With the API running, `npm run check:connection -w @meal/api` verifies health, readiness, catalog and anonymous-save rejection without mutations. It requires an enabled, populated catalog; it is a development smoke check. Authenticated ownership and iPhone/iPad acceptance remain separate.

## Development, staging and production

| Configuration            | Development                            | Staging                                          | Production                                          |
| ------------------------ | -------------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| API template             | `apps/api/.env.example`                | `config/environments/staging/api.env.example`    | `config/environments/production/api.env.example`    |
| Mobile template          | `apps/mobile/.env.example`             | `config/environments/staging/mobile.env.example` | `config/environments/production/mobile.env.example` |
| API/mobile `APP_ENV`     | `development`                          | `staging`                                        | `production`                                        |
| EAS profile              | `development`                          | `staging` (`preview` alias)                      | `production`                                        |
| EAS variable environment | `development`                          | `preview`                                        | `production`                                        |
| iOS bundle ID            | `com.maevemealplanner.app.development` | `com.maevemealplanner.app.staging`               | `com.maevemealplanner.app`                          |
| URL scheme               | `mealplanner-development`              | `mealplanner-staging`                            | `mealplanner`                                       |

Use different Supabase projects, API services, and variable sets for staging and production. Replace endpoints and publishable keys in each hosting/EAS environment; do not reuse development credentials. Actual values belong in hosting/EAS configuration or ignored `.env` files. For local rehearsal, copy the chosen templates into the corresponding app `.env`, fill them in, and run `npm run start -w @meal/api`. The mobile `APP_ENV` selects build identity; the API's `APP_ENV` selects server configuration. Both must match the intended environment.

Hosted configurations reject HTTP service endpoints and missing/template publishable keys. API startup validates ports, environment names, log levels and boolean switches. Omit `WEB_ORIGIN` to disable browser CORS outside development, or set an exact HTTPS origin. Native requests do not use CORS. Distinct app identities allow side-by-side installation and need corresponding signing. Add each selected scheme to the matching Supabase auth redirect allowlist when implementing recovery/deep links; current auth does not consume callback URLs. Rebuild after changing bundled mobile variables.

EAS profiles select identities and variable environments. No EAS project, signing credentials, hosted staging/production projects or deployments have been created. Database calls continue to carry the user token with the project's publishable key so RLS remains active.

## Monitoring, errors and switches

`GET /health` checks the process and reports environment/features without database access. `GET /ready` checks database access, returning 200/ready or 503/unavailable, including thrown network failures. Configure a hosting/uptime probe to poll `/ready` every 60 seconds with a ten-second timeout and alert after three consecutive failures; use `/health` for process health. External monitoring provisioning and alert delivery are deployment work.

Each request receives a server-generated `x-request-id`; clients cannot replace it. Validation/authentication/server errors and unknown routes use structured errors with that ID. Health/readiness retain probe-specific payloads.

JSON `http_request` events on stdout contain request ID, method, registered route template, HTTP status and duration in milliseconds. Unknown routes use `unmatched`. Logs omit raw URLs/queries, bodies, cookies, authorization, recipe IDs and upstream errors. Completions at 5xx use error level, others info. `LOG_LEVEL=info` is the baseline; `silent` disables logs. Forward stdout to the host log service, inspect error rates and p95 duration grouped by route/status, and correlate by requestId. Alert on sustained 5xx increases. No durable retention or external alerts exist until a destination is provisioned.

`FEATURE_CATALOG=false` disables catalog reads; `FEATURE_SAVED_RECIPES=false` disables save reads/writes before database access. Both default to true and accept exactly `true` or `false`. Restart the API after changing them. Disabled routes return structured 503/`FEATURE_DISABLED` errors; health/readiness remain available. Imports, assistant and planning remain disabled and cannot be enabled before implementation. The mobile app displays recoverable API errors; switches are server controls.

## Verification recorded October 27, 2026

Tests cover hosted configuration validation, isolated mobile identities, switches preventing database access, generated IDs, readiness failure and monitoring redaction, alongside API/contract tests. PostgreSQL migration, RLS and transaction tests now run locally in PGlite; see docs/database-api-foundation.md. Docker/Supabase CLI and live Supabase/pgTAP verification remain unavailable locally. CI execution, external alert delivery, signed builds and device synchronization remain unverified.
