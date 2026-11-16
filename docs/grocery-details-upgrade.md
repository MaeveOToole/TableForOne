# Grocery notes and shopping sections

Implemented and activated November 3, 2026. The user reported SQL success, and the read-only hosted readiness/privacy check passes. The user confirmed both notes and sections survive refresh in the real signed-in account. Native acceptance remains pending.

The shopping list's Notes button edits an optional shopping section and note. The section dropdown offers Produce, Meat and seafood, Dairy and eggs, Bakery, Frozen, Pantry, Household and Other. Automatic restores the suggested group; new sections do not require typing. Existing saved custom sections remain selectable for compatibility. Notes display under the item; checking an item moves it into Checked off without removing its section or note. A cleared note becomes null. Existing name/quantity/unit editing stays available separately.

The same durable account/week queue stores notes and section edits offline. Metadata patches do not implicitly clear omitted fields. Base snapshots accept legacy rows, while new edits enforce section/note length limits. Metadata operations record which endpoint and key were attempted, so retries replay the same request. Sync merges unrelated checkmark/quantity changes. A note conflict can retain this device's intended fields, including dependent queued checkmarks, or discard that item's pending edits in favor of the server.

The account API applies core fields and metadata together with the item's current revision. The database locks the list/item, binds ownership to Auth, records an atomic operation receipt, increments item/list revisions and preserves recipe origins. Notes/section-only edits do not freeze a generated item's calculated quantity; existing plan regeneration preserves those metadata fields. Inaccessible or removed items cannot be recreated through this endpoint.

## Activation

Run only [202611030003_grocery_details.sql](../supabase/migrations/202611030003_grocery_details.sql) in the existing development Supabase SQL Editor. It creates scoped functions and does not replace tables, recipes, grocery items, budgets or spending totals. Older grocery operations continue to work before activation; Notes remains hidden until readiness is confirmed. The last confirmed capability is cached per account so Notes can work while disconnected after activation.

After running the SQL, refresh Groceries. Open Notes beside an item, enter a section/note, save and refresh. Choose Automatic to return to the suggested group. Use `npm run check:grocery-details -w @meal/api` for read-only hosted function/privacy verification; this does not establish authenticated or native acceptance.

## Automated verification

PostgreSQL checks cover ownership, repeated operation keys, stale revisions and metadata preservation through plan regeneration. Queue tests cover restart, a note edit merged with another device's checkmark and a note conflict resolved without dropping a pending core edit. Browser tests cover save, check/uncheck, offline reload, reconnection and clearing back to suggested groups. Signed iPhone/iPad accessibility, one-handed use and physical two-device acceptance remain separate.
