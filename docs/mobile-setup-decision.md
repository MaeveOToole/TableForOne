# React Native setup decision

Decision date: October 26, 2026. Status: selected; native acceptance testing pending.

## Decision

Use Expo development builds with Continuous Native Generation (CNG). Keep native changes in version-controlled config plugins or local native modules so regeneration can reproduce them. Use a bare React Native project if the Share Extension prototype demonstrates native target or signing requirements that cannot be maintained reliably through config plugins. This selects the setup; it does not certify the unbuilt extension.

## Evaluation

| Need                         | Expo development builds with CNG                                                                                                                       | Bare React Native                                                                       | Decision and remaining proof                                                                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| iOS Share Extension          | Config plugins can add an extension target during prebuild. Expo labels CNG extension support experimental.                                            | Direct ownership of Xcode targets and extension code; manual project upkeep.            | Start with a small native extension and a maintained or local plugin. Verify website, TikTok and Instagram inputs on devices before adopting a third-party plugin.                                                                                                       |
| Shared app/extension storage | Requires matching App Group entitlements on both targets and native access to the shared container. Development builds can include custom native code. | Same Apple entitlements and native shared-container work, configured directly in Xcode. | Prototype a minimal URL handoff with stable IDs, atomic writes and consumption acknowledgments. Keep credentials out of the handoff. Validate cold launch, retries and signing. No App Group is configured yet.                                                          |
| Offline persistence          | Expo SQLite persists across app restarts and supports an iOS App Group container configuration.                                                        | SQLite libraries or native SQLite are available, with manual native integration.        | Neither setup implements sync automatically. Leave the local database choice to the next checklist item; define item revisions and queued operations before implementation. Prefer a small shared handoff over concurrent extension writes to the main offline database. |
| Adaptive iPad layout         | React Native layout APIs work inside the development build; tablet support is enabled.                                                                 | Same React Native layout APIs and native platform capabilities.                         | Existing width-based sidebar is a starting point. Verify resizing, rotation, split view, keyboard and accessibility on iPad.                                                                                                                                             |
| Maintenance                  | Config plugins describe generated native changes; custom native dependencies require rebuilding the client.                                            | Native project files are maintained directly across upgrades.                           | Existing Expo scaffold avoids an immediate migration while retaining native escape paths.                                                                                                                                                                                |

## Repository evidence

- `apps/mobile/package.json:7`: development-client start command; line 8: native iOS build command; line 17: development-client dependency.
- `apps/mobile/app.json:9`: iOS configuration; line 10: tablet support; line 13: current native plugins.
- `apps/mobile/src/App.tsx:177`: window-width layout branch. This is not complete iPad acceptance coverage.
- `apps/mobile/src/lib/supabase.ts:2`: SecureStore integration for authentication. This is credential persistence, not the offline recipe/grocery database.

## Validation and follow-up

Reviewed the existing configuration and current official documentation. No dependency or runtime code changes were necessary for this selection. No iOS build or physical-device validation was performed on this Windows workspace. Share inputs, App Group handoff, offline edits and iPad acceptance remain unchecked in their implementation tasks. Revisit CNG if clean prebuild cannot reproduce both targets, entitlements and signing, or a necessary native dependency is incompatible.

## Sources

- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/): custom native code and a development client.
- [Expo iOS app extensions](https://docs.expo.dev/build-reference/app-extensions/): extension targets through config plugins; experimental CNG support.
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/): persistent local storage and App Group shared-container guidance.
