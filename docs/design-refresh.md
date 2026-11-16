# Table for One design refresh

The React Native app now uses warm ivory, charcoal, olive and a lime accent. Shared colors live in `apps/mobile/src/theme.ts`. Category colors follow the approved earthy palette: breakfast warm cream, lunch sage, dinner muted olive and sides pale clay.

## Review locally

Run `npm run dev:api` and `npm run preview` in separate terminals at the repository root. Open http://localhost:8081/phone.html and select iPhone, large iPhone or iPad. Expo refreshes the app when source files are saved. Existing environment files and account data are preserved.

## Implemented

- This Week opens first, with an overview, actual cooking/leftover counts, day selector, empty state and saved weekly picks.
- Groceries is a primary phone tab, with a weekly manual shopping list and budget editor. Type an item and press Add or Enter, check/uncheck purchases, remove items or refresh from your account. Lists stay with their selected week. Creating a manual list uses an empty weekly plan and the existing grocery mutation API; existing meal slots are never replaced. No schema upgrade is needed. Browser demo lists persist only in browser storage.
- Discover and Saved have visual recipe covers, permitted photos when available, prominent quick filters and existing detailed filters.
- Text-only recipes use editorial covers rather than fabricated dish photography.
- Discover and Saved group recipes as Breakfast, Lunch, Dinner and Sides, with titles sorted A-Z inside each group. Unclassified recipes remain visible under Uncategorized. Meal filters are always visible.
- Opening a recipe shows its name, cooking time, required appliances, ingredient list and numbered preparation steps. All 48 untouched private PDF imports now receive complete AI-drafted versions, explicitly marked untested with estimated times; original summaries are retained. See [recipe collection](recipe-collection.md) for the versioned-data approach and limits.
- Organize recipe on a card opens the separate management view for collections, week assignments and editing; the iPad side panel remains available.
- Cooking mode, available through the management view, has larger steps, next/previous controls, completion, a progress bar and an ingredient checklist. It uses the selected portion count. Progress remains while the recipe is open; it does not record a cooking event or change pantry inventory.
- Metro explicitly resolves the local contracts workspace so Windows checkout moves do not leave the app dependent on stale junction discovery.

## Remaining product work

This iteration does not implement automatic week generation, editing/swapping/locking meal slots, pantry checks, grocery calculation, checkout estimates or offline synchronization. Those remain the Milestone 2 work in TODO.md. The weekly screen reads existing plans and saved week assignments; counts are not sample values. No database migrations are needed for this design refresh.
