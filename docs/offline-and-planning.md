# Offline shopping and weekly planning

Implemented November 3, 2026. Browser and automated acceptance are separate from signed-device acceptance.

## Shopping

Groceries caches each account/week locally. Add, check, remove, and edit item names, quantities and units. Notes and section override editing are implemented behind the [grocery-details upgrade](grocery-details-upgrade.md) activation check and use the same durable queue. Local saves appear immediately after persistence; pending edits remain explicitly pending until the account API acknowledges them. Failed local storage does not acknowledge a save. Refresh retries synchronization; the open screen also retries every 30 seconds, on foregrounding, and on browser reconnection.

Native storage uses Expo SQLite; web storage uses localStorage. A new iOS development build is required after adding SQLite. Follow the [SDK 58 SQLite documentation](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/) when updating the storage adapter. Authentication remains in SecureStore on native devices.

Cache keys include the account and week. The transport verifies the expected account immediately before using its token. Signing out hides private cached content; this implementation retains that account's local cache for later sign-in. Account deletion and its local-cache cleanup remain separate work.

The durable outbox records operation IDs, base fields, desired changes and the exact attempted request/key. Reads refresh server revisions before writes. Edits to different items or different fields merge; conflicting edits to a field require a choice. Removed items cannot silently be restored by a stale edit. Selecting the other device's version discards dependent pending edits to that item; selecting this device's version re-bases on the latest item. Missing remote weeks do not silently become new replacement weeks. Queues are shared across tab mounts and serialized.

Cached groceries can be viewed while disconnected. Online requests still have transport deadlines, and queue work is serialized; immediate edit availability during a stalled connection and the one-second native target have not been accepted. Browser fixture checks do not establish actual iPhone/iPad synchronization.

## Recipes and plans

Validated catalog pages, saved recipe pages, saves, preferences and recommendation context are cached per account. Reload hydrates cached content before online refresh. Network/server failures can use cached copies with a visible offline notice; malformed responses and authentication/authorization errors remain errors. Planned meal snapshots are cached with their week and can be opened from the weekly overview while disconnected. Recipe and plan mutations still require a connection.

## Planning

This Week provides **Add from Discover**, **Add from Saved** and **Preview weekly plan**. Recipe cards have **+ Add to week**, using the selected week and existing saved-recipe organization. A new recipe is saved first, then marked as a week pick; existing collections are preserved. Existing picks show Added to week; a recipe marked for a different week offers Move pick to this week because the existing organization model holds one week per saved recipe. Return to weekly planning preserves the selected week and open preview. Picks appear in the week list and influence the next generated preview; they do not immediately commit dated cooking slots or groceries. **Find a recipe** opens Discover's Recipe chat area. AI chat/generation is explicitly deferred at the user's request until API setup; the UI states this and offers browsing. No prompts are sent to an AI service.

This Week provides **Preview weekly plan**. Defaults remain three dinners, two prepared portions each, and one linked next-day leftover per dinner. Dietary, equipment, time and difficulty requirements filter candidates before ranking. Suggestions use kitchen matches, use-soon flags, cuisine preferences, history, ratings and ingredient overlap. Optional breakfast/lunch counts come from Profile; leftovers count toward requested lunches. Week-marked recipes receive preference among eligible candidates.

Automatic suggestions avoid recipes recorded as cooked within the previous 28 days, the user-selected default. Profile can change the window or disable it. Eligible deliberate week picks and explicit swaps permit recent repeats; when no unused alternative fits, a fallback repeat is explained. This consumes recorded history; a cooking-history capture workflow remains pending.

The preview supports swapping, moving, removing, eating-out and explicit unplanned slots, adding meals, and changing prepared portions. Moving a cooking session moves its linked leftovers. Invalid dates, occupied slots and excess leftover allocations are rejected. Existing locked slots and sources of locked leftovers are retained during regeneration. Lock/unlock controls for saved meals become available after the [kitchen upgrade](kitchen-upgrade.md). There is no complete package-price or unused-package ranking yet; unknown checkout cost is stated explicitly.

After ingredient review, the grocery preview highlights changed quantities and their previous values, checkmarks that will reset, retained overrides/deletions, removed requirements and extra purchases being kept. Its paginated read includes deleted derived rows so deliberate removals remain visible. Previewing never writes a plan. Saving creates owner-scoped immutable recipe versions through the API, checks source revisions, and uses the existing revisioned/idempotent plan commit and grocery recovery transaction. Later source edits do not change those snapshots. If grocery regeneration fails after a plan save, the screen explicitly reports this and offers repair. The existing database projection preserves manual purchases, overrides, deliberate deletions and compatible checked states.

## Quantities and the kitchen check

Only confirmed quantities, or quantities the user explicitly reviews in the preview, participate in arithmetic. Unknown quantities or original servings stay unknown with original ingredient text and provenance. Unreviewed generated amounts are never silently promoted to confirmed totals.

Compatible known units normalize deterministically. US teaspoons/tablespoons/cups use US customary volume factors. Weight and volume remain separate; no ingredient density is guessed. Missing units remain unspecified. Ingredient identity includes conservative form markers so fresh/canned/frozen/dried forms are separate. Cooking sessions create requirements; leftover slots do not.

Known compatible pantry quantities can be deducted. Missing pantry records never imply available inventory. Matching pantry records without quantities or units require an explicit decision to include full recipe amounts and adjust the shopping list. Saving rechecks pantry record revisions; changed records require a new preview. The pantry editor and reusable regular-purchase workflow are implemented behind the kitchen activation check. The shopping list now uses general section grouping and keeps checked items last; existing explicit sections and notes are displayed. Section override and note editing are implemented and tested; hosted activation is confirmed; the user confirmed real-account notes and sections survive refresh. Original ingredient lines are retained in item origins even when totals merge.

## Verification

Automated coverage includes offline edits across restart, mixed-device item reconciliation, field conflicts, local-storage failure, account/week isolation, retry recovery, source snapshot idempotency and immutability, portions/leftovers, unit/form separation and pantry uncertainty. Browser checks cover signed-in fixtures, offline recipe reading, quantity editing, weekly planning, replanning with a checked manual purchase and cached planned recipes.

The user confirmed November 3 that real signed-in groceries survive refresh and complete Saved recipes display. Full authenticated isolation, native accessibility, native performance, physical two-device sync, kitchen testing of generated recipes, TestFlight and release acceptance remain open.
