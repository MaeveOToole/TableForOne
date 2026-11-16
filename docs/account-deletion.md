# Account deletion

Implemented in source November 3, 2026. The user reported hosted migration success and `account_deletion_ready()` returning true on November 3. Server credential setup, disposable-account acceptance and signed-device acceptance remain pending. No real account has been deleted by this implementation work.

## Behavior

Profile offers Delete my account when both the server credential and database cleanup trigger are ready. It explains the data being removed, requires explicit acknowledgement and provides a final Permanently delete account action. Cancelling sends no deletion request. Failed or unconfirmed requests do not show success or clear account data on the device.

The API authenticates with Supabase getUser, accepts only `{ "confirmation": "DELETE" }`, and obtains the deletion target from that verified identity. A request cannot supply another user ID. Supabase Auth's admin API performs a hard deletion using a server-only credential. The cleanup trigger runs in the same database transaction, removes dependent private records before their parents and lets Auth cascades remove profiles/preferences and authentication relationships. A constraint failure rolls back cleanup. Public recipes and other accounts remain; independent recipe copies retain their content while the deleted source pointer is cleared. There is no first-release sharing workflow.

After confirmed server deletion, the device clears only that owner's grocery queue, library, week snapshot and capability cache keys, then signs out locally. A persistent deletion marker prevents background writes from recreating those cached contents. If local cleanup fails, the screen reports the failure and offers another attempt without issuing a second server deletion while that screen remains open. Account switches must not sign out a different user.

## Activate in development

1. Run [202611030004_account_deletion.sql](../supabase/migrations/202611030004_account_deletion.sql) in the existing development project's SQL Editor. This installs a trigger and readiness function; applying it does not delete any account. Do not run a DELETE statement against your real account.
2. Add `SUPABASE_SECRET_KEY` to `apps/api/.env`, using the development project's server secret or legacy service-role key. Keep it out of chat, screenshots, mobile environment files, source control and every `EXPO_PUBLIC_` variable. The publishable key remains unchanged.
3. Restart the API so it reads the new variable, then refresh Profile. Deletion remains unavailable if either setup step is missing.
4. Create a disposable development account, save a private recipe/plan, groceries and spending, and test cancel, failure/retry and final deletion. Verify that account can no longer authenticate and its private records are removed while another test account and public catalog remain. Do not test by deleting the owner's real recipe collection.
5. Repeat the acceptance on signed devices and configure the production environment separately before launch.

## Retention and limitations

This removes active database/Auth data; it is not a promise of immediate erasure from backups, infrastructure logs or remote offline devices. Record actual Supabase backup retention and log policies before publishing the privacy policy. A restored backup can contain deleted records; the production recovery procedure must track deletion requests securely and reapply them before restored data serves traffic. That operational procedure remains pending.

The first release does not upload user files or run import/AI jobs. Future storage uploads require object deletion through the Storage API before deleting Auth users; future workers require cancellation/tombstone checks. Do not directly delete Storage metadata or silently enable those workflows without extending cleanup. If unknown references or stored objects prevent Auth deletion, the API returns failure rather than pretending success.

An already issued JWT may remain valid until expiry, but every private API route verifies the user with getUser; deleted identities are rejected. New owned database rows require an existing auth.users parent. Direct API/expired-session and two-device acceptance remain part of release testing.

## Verification

Tests cover self-only targeting, explicit confirmation, unavailable setup, failed Auth deletion, transactional cleanup/rollback, preservation of public recipes and another account, source-pointer cleanup and owner-scoped cache erasure across restart. Browser fixtures verify cancellation, final acknowledgement, failure/retry, local cache isolation and sign-out. These are not hosted acceptance.

Implementation references: [Supabase admin deletion](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), [Supabase user management and deletion limitations](https://supabase.com/docs/guides/auth/managing-user-data).
