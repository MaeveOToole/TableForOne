# Apple signing handoff

## Ownership and current status

Brandon's Apple Developer Program membership will own the app. Maeve will manage
development and submission using her existing Expo project and GitHub repository.

| Item                    | Destination                                  | Status                                                                                       |
| ----------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Source                  | `https://github.com/MaeveOToole/TableForOne` | Remote configured; handoff not pushed yet                                                    |
| Expo project            | `@maeveotoole/meal-planner`                  | Project ID `ab8bd930-7448-49b7-b350-fcc3032aafe0`; Brandon's current Expo login lacks access |
| Apple team              | Brandon's paid membership                    | Team ID and membership type not verified                                                     |
| Production bundle ID    | `com.mealplanner.app`                        | Configured in source; registration on the chosen Apple team not verified                     |
| Store build credentials | Maeve's Expo project, managed by EAS         | Not verified or created during this handoff                                                  |
| Submission credentials  | App Store Connect API key assigned in EAS    | Not configured during this handoff                                                           |
| App Store Connect app   | App record on Brandon's Apple team           | Apple ID (`ascAppId`) not yet recorded                                                       |

The temporary EAS project under `donarduous-1` is not the handoff target. No
credentials should be created there for this handoff.

## Complete the signing setup

1. Establish access to Maeve's Expo project. For ongoing collaboration, use an Expo
   organization with individual logins. A personal Expo account does not provide
   organization-style member access. Do not share passwords or create another
   replacement project. Confirm the project with `eas project:info` from
   `apps/mobile` before creating credentials.
2. Confirm Brandon's paid Apple membership, team ID, membership type and that
   `com.mealplanner.app` is available on that team. An Individual membership's
   Account Holder must create and renew signing credentials. An Organization
   membership supports additional roles with signing access.
3. Configure the production environment in Maeve's Expo project:
   `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The URLs must use HTTPS. Never put a
   secret/service-role key in the mobile app. The app's existing production config
   validation also applies when EAS loads the production profile for credentials.
4. From the repository root, run `npm run credentials:ios`. This loads the EAS
   production environment and opens the iOS credential manager. Select
   **production**, sign in to Brandon's Apple account locally and choose the
   confirmed Apple team. Select **Build Credentials**, then **All: Set up all the
   required credentials to build your project**. Reuse a suitable existing
   distribution certificate when offered; do not revoke other apps' certificates.
   Create the App Store distribution provisioning profile for `com.mealplanner.app`.
   Keep these credentials on EAS; production explicitly uses remote credentials.
5. Create or confirm the App Store Connect app record on the same Apple team.
   Record its numeric Apple ID under `submit.production.ios.ascAppId` in
   `apps/mobile/eas.json`, and the team ID under
   `submit.production.ios.appleTeamId`. These identifiers can be committed.
6. In the EAS credential manager, choose **App Store Connect: Manage your API Key**
   and **Set up your project to use an API Key for Expo Submit**. Associate the key
   with this app's submission setup. Store the private key in EAS, not GitHub.
7. Give Maeve the App Store Connect access needed to manage this app, such as App
   Manager with access limited to this app where supported. Account Holder tasks,
   including membership renewal and agreements, remain Brandon's responsibility.
8. Verify a signed production build and a TestFlight upload using Maeve's Expo
   login before calling the handoff complete. Update the status table above only
   after verification.

## Maeve's normal workflow

Install Node.js 24 and EAS CLI, clone/pull the repository, then run:

```sh
npm ci
eas login
npm run build:ios
npm run submit:ios
```

Use the Expo login that can access the project. When valid remote signing
credentials exist, a teammate can decline Apple account login during a build and
reuse the stored credentials. A Mac is not required for EAS cloud builds or
uploads from Windows. Submission uses the API key assigned to the app in EAS.

Uploading a build makes it available in App Store Connect/TestFlight after Apple
processes it. Public release still requires listing details, privacy information,
device testing and App Review. See [the first-release checklist](first-release.md).

## Maintenance and credentials

Provisioning profiles require renewal at expiry and may need regeneration when
capabilities change. Brandon may need to sign in again for these tasks, especially
with an Individual membership. Add any future native extension as a separate
signing target. Do not assume one setup permanently removes Apple account work.

Commit app configuration, non-secret identifiers, dependency locks and these
instructions. Keep Apple passwords, verification codes, `credentials.json`, `.p12`
certificates, `.p8` API keys and `.mobileprovision` profiles out of GitHub. These
file types are ignored by this repository.

References: [Expo managed credentials](https://docs.expo.dev/app-signing/managed-credentials/),
[Apple signing roles and renewals](https://docs.expo.dev/app-signing/apple-developer-program-roles-and-permissions/),
[Expo account collaboration](https://docs.expo.dev/accounts/account-types/),
[App Store Connect submission](https://docs.expo.dev/submit/ios/).
