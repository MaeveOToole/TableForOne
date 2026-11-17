# Free Render backend setup

## Active deployment — November 16, 2026

- GitHub: <https://github.com/MaeveOToole/TableForOne>, branch `main`.
- Render API: <https://table-for-one-api.onrender.com> (Free, Node, `APP_ENV=staging`).
- Render service: <https://dashboard.render.com/web/srv-dbtkbq88v5cc73998b90>.
- Expo: <https://expo.dev/accounts/maeveotoole/projects/meal-planner>.

The live API passed the read-only connection check: health, database readiness, catalog recipe details, and anonymous saved-recipe rejection. This does not establish authenticated writes or physical-device acceptance. The Expo production build environment now has the Render API URL and the matching Supabase public settings; no privileged key was configured. Apple signing and TestFlight submission are still pending. The TestFlight candidate uses the existing hosted Supabase project for testing; this is not a separate production database rollout.

This deploys the Fastify API only. Keep the existing Supabase database and Auth; no Render database is needed. The Blueprint uses `APP_ENV=staging` for a hosted preview, Node 24 from `.node-version`, and the Free service plan. It does not run migrations or load fixtures.

## Deploy

1. Push this project, including `render.yaml`, `.node-version` and `package-lock.json`, to GitHub. Keep all actual `.env` files out of Git.
2. Sign into <https://dashboard.render.com/>. Choose **New > Blueprint**, connect the GitHub repository, and select the branch containing these files.
3. Use the root `render.yaml`. Enter the values Render requests:

   | Variable                   | Value                                                                                                 |
   | -------------------------- | ----------------------------------------------------------------------------------------------------- |
   | `SUPABASE_URL`             | Your existing hosted project's HTTPS URL                                                              |
   | `SUPABASE_PUBLISHABLE_KEY` | That project's publishable key (or legacy anon key)                                                   |
   | `WEB_ORIGIN`               | The frontend's exact HTTPS origin, e.g. `https://your-site.example`, without a path or trailing slash |

4. Confirm the service shows **Free / $0**, then deploy. If a Blueprint asks for payment information, you can instead use the manual Web Service settings below and select Free.
5. Open the service's assigned URL with `/health` appended. Expect HTTP 200 and `status: "ok"`. Open `/ready`; expect HTTP 200 and `status: "ready"`. Readiness checks the existing database, whereas health checks only the process.

Use the existing initialized Supabase environment for a personal preview. Do not rerun one-time setup or reset the hosted database. A public production release should use its separate production Supabase environment and `APP_ENV=production`.

The optional `SUPABASE_SECRET_KEY` is deliberately excluded. Account deletion requires the separately documented migration and server-only key activation in [account deletion](account-deletion.md). Never put that privileged key in frontend variables.

## Manual Web Service alternative

Choose **New > Web Service**, connect the repository, and enter:

| Setting           | Value                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime           | Node                                                                                                                                                                        |
| Root directory    | Leave blank (repository root)                                                                                                                                               |
| Build command     | `npm ci --include=dev --workspace=@meal/api --workspace=@meal/contracts --include-workspace-root && npm run typecheck -w @meal/contracts && npm run typecheck -w @meal/api` |
| Start command     | `npm run start -w @meal/api`                                                                                                                                                |
| Instance type     | Free                                                                                                                                                                        |
| Health check path | `/health`                                                                                                                                                                   |

Add the three prompted environment variables above, plus `NODE_ENV=production`, `APP_ENV=staging`, `HOST=0.0.0.0`, and `LOG_LEVEL=info`. Leave `PORT` unset so Render supplies it. Development dependencies are explicitly installed because this API runs TypeScript with `tsx`. The workspace install includes the shared contracts without installing the mobile app.

## Connect the frontend

Set `EXPO_PUBLIC_API_URL` in the frontend's build environment (or `apps/mobile/.env` for local Expo) to the assigned Render HTTPS URL, without a trailing slash. Keep its Supabase URL and publishable key pointed at the same project as the API. Restart Expo or rebuild/redeploy the hosted frontend after changing public variables. Render does not serve the frontend in this setup.

`WEB_ORIGIN` permits one browser origin. A staging API requires HTTPS for this value; for the local HTTP browser preview, continue using the local development API. Native iOS requests do not require browser CORS.

After opening `/health` to wake the service, optionally run this read-only smoke check from PowerShell at the repo root:

```powershell
$env:API_CHECK_URL = 'https://YOUR-SERVICE.onrender.com'
npm run check:connection -w @meal/api
```

The smoke check requires an enabled, populated catalog. It does not prove authenticated writes or cross-device behavior; verify sign-in and saving a recipe in the frontend too.

## Free plan behavior

Render sleeps free web services after 15 minutes without inbound traffic. Waking takes about a minute, so the app's first request may time out; wait for `/health` and retry. Free hours are shared across the workspace (750 per month). Bandwidth and build minutes also have limits. To avoid usage charges, keep the service on Free and check billing/spend controls, especially if a payment method is attached. Supabase has its own separate quotas.

See Render's current [free plan limits](https://render.com/docs/free) and [Blueprint reference](https://render.com/docs/blueprint-spec).
