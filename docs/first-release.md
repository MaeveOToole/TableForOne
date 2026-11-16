# First public release

Scope approved November 3, 2026. The target is a public App Store launch, without an invited beta group as a prerequisite. Signed builds still need internal testing on real iPhones and iPads before submission. This document defines release scope; the full original TODO remains unfinished.

## Included

- Account sign-in, recovery, preferences and account deletion.
- Discover and Saved recipes, reading and existing cooking mode.
- A running weekly list of breakfast, lunch, dinner and optional side recipes picked from Discover/Saved, with future-week selection and removal that preserves Saved recipes.
- Simple pantry entry in Settings and reusable regular purchases. Existing richer kitchen data remains preserved.
- Adding weekly ingredients to groceries, explicit purchase-quantity selection, sections, notes, manual purchases and offline edits. Removing a weekly recipe does not automatically remove its groceries.
- Weekly budget ceilings and separately saved actual spending. Advanced regional estimates remain outside the current interface.

## Deferred from this release

AI recipe chat/generation, URL/social imports and Share Extension, cooking-history capture and ratings, post-cook pantry updates, private recipe sharing, full retailer/package-price coverage, cheaper-swap suggestions and richer protein/package-waste ranking. These remain open in TODO.md. Regional references must not be marketed as live Whole Foods, Wegmans, Shaw's or Trader Joe's prices. The four-week planning rule currently consumes recorded history; it must not be advertised as automatically recording cooking activity.

All EAS profiles set `EXPO_PUBLIC_RELEASE_SCOPE=core` in `apps/mobile/eas.json`; core is also the default for local previews. Discover hides the deferred chat entry point, and Find a recipe opens ordinary Discover browsing while preserving the selected week. An explicit `extended` scope can expose the placeholder only during development; build configuration rejects it for staging/production. Verify the production behavior in the signed build.

## Current work order — November 4

AI and secret-key setup are deferred at the user's request. Continue with source fixes, automated checks, recipe review, listing copy and device preparation. Do not treat the deferred deletion/production setup as completed release gates. The app is not yet ready for public submission.

- [x] Restore core-release feature gating after the weekly-list redesign and add the full core-mode browser suite to CI.
- [x] Prepare [App Store copy](app-store-draft.md) for review, without AI, imports or live-price claims.
- [ ] Review the public recipes and record actual findings; kitchen testing requires cooking the recipes.
- [ ] Run the real-account checks below, then the signed-device checks once a build is available.
- [ ] Supply real support/developer details and prepare screenshots from the final build.

For a short real-account review, select a future week, add recipes from Discover and Saved, reload, remove one pick and confirm it remains in Saved. Add ingredients to groceries twice and confirm no duplicates; include a manual purchase and confirm it is preserved. Edit quantity, note, section, budget and actual spending, reload, and confirm week isolation. In Settings, save a pantry name and profile change, then reload. Record actual results and failures; browser fixtures do not count as this acceptance.

## Gates before public submission

- [ ] Review the public starter recipes and private draft handling. Confirm measured quantities/servings where known; keep unreviewed values visibly uncertain. The 48 private drafts remain untested and must not be presented as kitchen-tested. Record actual reviewer findings, not inferred completion.
- [ ] Activate and validate account deletion using a disposable development account. Implementation is in source; activation and live acceptance are separate. See [account deletion](account-deletion.md).
- [ ] Publish privacy/support URLs with the real developer identity and support contact; document collected data, deletion/export handling, backup retention, offline copies and third-party processing. Do not publish invented retention periods.
- [ ] Provision production API/Supabase environments, HTTPS, credentials, migrations, production authentication redirects/email delivery and rate limits. No production deployment has been completed.
- [ ] Verify backup restoration and removal handling after restoration; decide actual backup retention, monitoring/log retention, deletion/export support and incident procedures.
- [ ] Confirm Expo account, Apple membership access, final bundle identifier, signing credentials, app icon and production environment variables. Never put the Supabase secret key in the mobile app.
- [ ] Build and install on real iPhone/iPad; test new-account setup, recovery, saving, week picks, planning, kitchen check, regular purchases, locks, groceries, spending, offline edits/reconnection and cross-account isolation. Verify two-device conflict behavior without losing either device's unrelated edits.
- [ ] Check VoiceOver, Dynamic Type, contrast, touch targets, iPad layout, stalled-network responsiveness and native cache performance. Observe a complete planning/shopping preparation journey and record timing.
- [ ] Verify release builds expose no unfinished placeholders or development server URLs. Test pending/error states, including unavailable account deletion and incomplete pricing.
- [ ] Prepare App Store screenshots, description, age rating, privacy disclosures, support/privacy links, reviewer login and review notes. Confirm requirements against current Apple guidance before submission.
- [ ] Run final checks, install the exact signed release candidate, resolve blockers and submit only after review of the concrete build and listing.

## Current evidence

See the latest checkpoint in [TODO.md](../TODO.md) for current check results. Automated checks and browser fixtures establish source behavior only. They do not establish production hosting, real-device acceptance, kitchen testing, published policies or App Store approval. No launch date is committed while those gates remain open.
