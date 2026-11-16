# Share-input findings

Checked October 26, 2026. These are web-tool observations, not native iOS Share Extension results. Creator details are omitted per user preference.

## Website sample

Input: https://pinchofyum.com/roasted-peanut-kale-crunch-salad

The page was readable through the web tool. Recipe title: Roasted Peanut Kale Crunch Salad. Visible fields include ingredient quantities in two groups, ordered instructions, a 15-minute total time, a 4-6 serving yield range, category and method. Preserve the yield as a range rather than choosing one serving count. Editorial classification: lunch or side. The recipe uses kale, cabbage and a peanut vinaigrette.

This establishes that recipe content is visible in this retrieval environment. It does not prove the app receives that content when a user shares the URL, that structured recipe metadata has been parsed, or that image/caching permissions exist. No page images were downloaded and no recipe was seeded into the app.

Expected prototype flow: receive the URL, attempt permitted recipe extraction, preview the available fields and flag missing fields. This flow is proposed and unimplemented. If access or extraction fails, retain the link and offer pasted recipe text, screenshots or manual details instead of inventing content.

## TikTok sample

Input: https://www.tiktok.com/t/ZTf4KcKms/

The web tool reported this URL inaccessible. No destination post URL, title, caption, ingredients, directions or video content was recovered. Do not assign this link to any of the previously supplied screenshot recipes without confirmation. This is a tool-access limitation, not proof that the post is private, deleted or inaccessible on the user's device.

Proposed fallback: keep the original link, show that details could not be retrieved, and accept user-supplied caption text/screenshots. The five screenshots already documented in `docs/tiktok-recipe-samples.md:5` exercise the manual content-review example, but are not native share payload evidence. A native test must still establish whether TikTok shares only a URL or additional fields on the actual devices.

## Instagram sample

The user supplied the same TikTok URL in the Instagram field. The user asked to skip the Instagram sample for now on October 26, 2026. It is deferred, not tested; no corrected link is currently required to continue other work.

## Account and device status

The user reports Apple Developer Program membership and Expo account availability as 'neither yet or unsure'. No account login, signing access, registered device or cloud build has been verified. The user has a PC, iPhone and iPad. Account setup and signed development-build installation must precede physical Share Extension testing. No account, membership purchase, cloud deployment or signing operation was started.

## Completion status

Start here item 5 remains open. Website content inspection and an inaccessible TikTok-link fallback are documented. Still required: a native extension/handoff prototype, actual share-payload capture and device fallback/retry checks. Instagram sample inspection and sharing tests are deferred by user request, not removed from release scope. Start here item 7 still needs a configured development backend and signed two-device acceptance.
