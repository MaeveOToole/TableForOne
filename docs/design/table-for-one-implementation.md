# Table for One implementation

The Expo app now uses the approved ivory, charcoal, steel blue, and cool gray palette, with bundled Nunito display typography (SIL Open Font License in `apps/mobile/assets/fonts/OFL.txt`). Cards, inputs, recipe detail, settings, tablet navigation, and the device preview use the same theme.

Discover and Saved include illustrative food photography, time/portion/difficulty chips, direct save controls, search, and functional All/Quick/Simple filters. Quick means 25 minutes or less. Dietary filters are intentionally omitted because the catalog does not provide validated dietary attributes. Photos are externally hosted Unsplash serving inspiration, not photographs of each recipe; each has an explicit label and an offline error fallback. Replace with approved recipe-specific photographs before production.

Phone navigation keeps Week, Discover, and Saved visible, with existing secondary sections under More. The week view has a current-week day strip and an empty planner/grocery summary; planning and grocery generation remain future product features. Existing authentication, saving, and preference APIs are preserved.

Verification: workspace TypeScript checks, the eight existing API/contract tests, ESLint, and Expo web export. Interactive visual and physical iPhone/iPad checks remain necessary; the browser automation runtime failed to start in this environment.
