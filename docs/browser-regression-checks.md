# Recipe page regression checks

## Current verification — November 4, 2026

The full repository check passes with 65 unit/API/configuration/database tests. Both browser commands pass all 23 scenarios: `npm run test:web:core` exercises the launch scope on port 18092; `npm run test:web` exercises explicit development extended scope on port 8091. Set `PLAYWRIGHT_PORT` to another available port for the development suite if needed. CI runs both modes. Core checks verify Find a recipe opens browsing, retains weekly context and exposes no Recipe chat placeholder. Both suites include the current Settings layout, saved/weekly recipes, offline groceries, notes/sections, spending and deletion fixtures. Tests make no real-account writes. Historical notes below describe earlier versions.

October 27, 2026. The reported Discover/Saved/Week failures exposed gaps in the earlier build-only verification.

## Causes and fixes

- Filters above a constrained list pushed recipe cards outside the phone viewport. `RecipeBrowser` puts search/filters inside the list's scrollable header and collapses advanced filters by default.
- Discover filters were reused on Saved. Separate keyed browser instances now keep those controls independent and allow incomplete private drafts in Saved.
- The personal import uses deterministic MD5-based PostgreSQL UUID values; strict RFC version/variant validation rejected many. `recordIdSchema` accepts the database GUID format without changing IDs. API routes, recipe contracts and saved references share it.
- Profile/context failures stopped the serial loader before useful data appeared. Independent reads now return available catalog and saved data with section-specific errors. A separate paginated saved-recipe endpoint includes private drafts and previously saved development entries.
- React Native Web's Alert implementation did not display save failures. The app now shows save success/error state inline and refreshes saved organization data after a write.
- Session lookup had no deadline, so a stalled refresh could leave loading unresolved. It now times out with a recoverable message; repeated pagination also terminates safely.
- Week was a placeholder. It now reads existing plan slots, changes selected days/weeks, and displays recipes marked for the chosen week. This is not the later meal-generation engine; a week-marked recipe is not assigned a cooking day automatically.

## Verification

`npm run check` covers types, lint, 32 API/contract/SQL tests, resilient loading and specification/formatting consistency. `npm run test:web` runs six Playwright browser tests against an isolated Expo preview on port 8091, using synthetic sessions and API fixtures. Windows uses installed Chrome; Linux CI installs Playwright Chromium. No real accounts, recovery emails or private writes occur in the browser suite.

Browser checks exercise phone-sized visible/clickable recipe controls, save/remove feedback, all 48 private draft records, filtering despite a profile failure, visible save errors, marking a recipe for next week, Week navigation and signed-out save behavior. CI has a separate browser job so a successful TypeScript build no longer substitutes for interaction checks. Screenshots/failure artifacts are written under ignored `output/browser-tests`.

The live preview remains `http://localhost:8083/phone.html`; API and Metro were restarted with source watching enabled. Refresh the browser after updates. These fixture tests do not prove the user's real private import or native-device acceptance.

## Personal data activation

The user ran the personal import on October 27, 2026 and reported the expected result, 48. A subsequent read-only check still returned twelve public recipes and no private records anonymously. Real signed-in browsing and native-device acceptance remain separate from the isolated browser suite. The six browser checks also include iPad-sized opening/closing of inline recipe details. A refresh race that cleared successful organization feedback was reproduced and fixed by resetting recipe fields only when recipe ID/revision changes.

The starter-catalog upgrade intentionally did not import the personal collection. Run the entire `supabase/import-personal-recipes.sql` in a new development-project SQL Editor query; expected result is `personal_recipe_drafts = 48`. It requires exactly one app account and aborts on ambiguity. Never delete accounts to bypass that guard. The import was tested twice against the upgraded schema: 48 private draft rows and 48 saves, with no duplicates, unchanged unknown details, and anonymous access denied. All imported rows also pass the corrected recipe API contract.

After successful import, sign into that account and use Saved's **Refresh recipes** control. The 48 entries remain drafts because the original summaries do not contain complete reviewed measurements/instructions. No details were invented to make them appear complete.
