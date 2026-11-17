# Apple signing handoff

## Ownership and current status

Brandon's Apple Developer Program membership will own the app. Maeve will manage
development and submission using a copy of the Expo project and her GitHub repository.
Maeve must receive access to the copied Expo project before she can reuse its credentials.

| Item                    | Destination                                  | Status                                                                                                                   |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Source                  | `https://github.com/MaeveOToole/TableForOne` | [Draft handoff PR #1](https://github.com/MaeveOToole/TableForOne/pull/1) from `brarduous/TableForOne`                    |
| Expo project            | `@donarduous-1/meal-planner`                 | Project ID `137583ff-377c-4c8a-8094-457257421a38`; accessible copy authorized by Brandon                                 |
| Apple team              | Brandon's paid membership                    | Verified team `QKQ2WNHKWS`, Brandon Jones (Individual)                                                                   |
| Production bundle ID    | `com.maevemealplanner.app`                   | Verified in EAS with active App Store provisioning on team `QKQ2WNHKWS`                                                  |
| Store build credentials | Copied Expo project, managed by EAS          | Verified November 17, 2026: certificate and active App Store profile expire November 17, 2027                            |
| Submission credentials  | App Store Connect API key assigned in EAS    | App Manager key setup attempted November 17, 2026; Apple returned an internal server error; EAS assignment not confirmed |
| App Store Connect app   | App record on Brandon's Apple team           | Apple ID (`ascAppId`) not yet recorded                                                                                   |

Brandon authorized using the EAS copy under `donarduous-1` because his account cannot
access Maeve's original project (`ab8bd930-7448-49b7-b350-fcc3032aafe0`). The original
project has not been modified. The copy now uses the requested production bundle
ID `com.maevemealplanner.app`, with an active App Store provisioning profile in EAS. Maeve will need access to the copy through an Expo
organization, or a verified project transfer, before she can build independently.

## Complete the signing setup

1. Confirm the copied project with `eas project:info` from `apps/mobile`. For the
   eventual handoff, use an Expo organization with individual logins or transfer
   the project to Maeve and verify credential access afterward. A personal Expo
   account does not provide organization-style member access. Do not share passwords.
2. The signing setup is verified on Brandon Jones's Individual team
   `QKQ2WNHKWS` for `com.maevemealplanner.app`. An Individual membership's
   Account Holder must create and renew signing credentials. An Organization
   membership supports additional roles with signing access.
3. From the repository root, run `npm run credentials:ios`. This generates an
   ignored signing workspace in `tmp/ios-signing` using the same production
   identity and native plugins as the real app. It opens the iOS credential manager
   without requiring backend settings. Actual builds continue to enforce all
   production environment validation in `apps/mobile/app.config.js`. Select
   **production**, sign in to Brandon's Apple account locally and choose the
   confirmed Apple team. Select **Build Credentials**, then **All: Set up all the
   required credentials to build your project**. Reuse a suitable existing
   distribution certificate when offered; do not revoke other apps' certificates.
   Create the App Store distribution provisioning profile for `com.maevemealplanner.app`.
   Keep these credentials on EAS; production explicitly uses remote credentials.
4. Create or confirm the App Store Connect app record on the same Apple team.
   Record its numeric Apple ID under `submit.production.ios.ascAppId` in
   `apps/mobile/eas.json`. The verified team ID is already recorded under
   `submit.production.ios.appleTeamId`. These identifiers can be committed.
5. In the EAS credential manager, choose **App Store Connect: Manage your API Key**
   and **Set up your project to use an API Key for Expo Submit**. Associate the key
   with this app's submission setup. Store the private key in EAS, not GitHub.
6. Give Maeve the App Store Connect access needed to manage this app, such as App
   Manager with access limited to this app where supported. Account Holder tasks,
   including membership renewal and agreements, remain Brandon's responsibility.
7. Configure the production EAS environment before building:
   `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Use HTTPS URLs and only the Supabase
   publishable key. No production service values are needed for credential setup.
8. Verify a signed production build and a TestFlight upload using Maeve's Expo
   login before calling the handoff complete. Update the status table above only
   after verification.

The certificate and active profile were verified from EAS metadata without another
Apple login. A signed build and TestFlight upload have not yet been tested.

### Submission-key troubleshooting

Apple login succeeded using the saved session, but Apple returned an internal
server error when EAS attempted to create the approved App Manager API key. Do not
assume the key is stored in EAS. Check App Store Connect under **Users and Access >
Integrations > App Store Connect API**. If **Request Access** appears, Brandon must
review and submit that request himself, including any Apple terms. If API access
is already active, verify whether the failed attempt created a key before
retrying. See [Apple's API access instructions](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/).

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

`npm run submit:ios` uses the same generated production identity as credential
management and copies the submission profile from `apps/mobile/eas.json`. This
keeps uploads on `com.maevemealplanner.app` rather than the default development
identity. Backend settings are required for a production build, but not to upload
an existing build.

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
