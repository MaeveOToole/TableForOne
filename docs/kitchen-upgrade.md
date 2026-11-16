# Activate pantry, regular purchases and meal locks

Activated in the existing development project November 3, 2026: user SQL success, read-only function/privacy check and authenticated blank-quantity pantry save are confirmed. Real-account regular-purchase/lock and native acceptance remain pending.

This upgrade is for the existing development database with the October 27 migrations already applied. Do not run setup-development.sql, the personal import, a seed or a database reset to activate it.

The reviewed SQL is [202611030001_kitchen_workflows.sql](../supabase/migrations/202611030001_kitchen_workflows.sql). It adds `pantry_items.staple` with a false default and creates/replaces the kitchen workflow and readiness functions. It does not replace recipes, saves, plans, lists, preferences or existing pantry values. It does not change the existing foundation readiness marker. The column addition and function definitions can be rerun without importing account data.

Before activation, the API reports the feature unavailable and the app keeps the new kitchen controls inactive. Existing shopping and planning continue to work.

1. Open the development Supabase project's SQL Editor.
2. Review and run only the SQL in that migration file.
3. Run `select public.kitchen_ready();` in the SQL Editor. Expect `true`.
4. Refresh the app. Open More > Kitchen, create a pantry item with no quantity, and confirm it says Amount unknown after refreshing.
5. Create a reusable purchase with quantity, unit and cadence. In Groceries, include/exclude it for one week. Confirm another week is independent.
6. In This Week, save a plan, select a day and lock a meal. Regeneration must preserve it. Unlock the meal and confirm it can be edited again.

Kitchen mutations require authentication, an operation key and the expected revision. The SQL binds ownership to `auth.uid()`, serializes repeated operation keys, records receipts atomically and checks list/plan revisions. Regular inclusion locks the grocery list and finds the existing template-origin item, preventing duplicate inclusion even with a different retry key. Removing templates keeps previously included weekly purchases. Lock changes increment both the slot and plan revisions, using the same plan lock as plan commits.

Local PostgreSQL tests execute every migration, verify pantry uncertainty, stale/idempotent requests, regular-purchase deduplication, cross-account rejection and lock/unlock revisions. Browser fixtures exercise the actual screens. These checks do not establish activation in the hosted database or native device acceptance.
