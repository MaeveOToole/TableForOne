# Weekly grocery budget requirements

Confirmed by the user October 26, 2026. November 3 update: Massachusetts selected; partial Northeast reference estimates and separate account-backed weekly actual spending are implemented and locally tested. The weekly checkout migration is active; authenticated real-account actual-spending save/reload is user-confirmed. See [implementation and limits](massachusetts-pricing.md). Cheaper meal suggestions and broader verified price/package coverage remain unfinished.

## Confirmed behavior

- Price region: Massachusetts, selected November 3. Clearly labeled Northeast averages may be used where state/store observations are unavailable; missing values remain unknown.

- Default budget starts at $150 USD. Groceries supports a separate override for each week; editing one week's amount does not change the default or other weeks.
- Count everything paid at grocery checkout: planned meals, regular purchases, snacks, manual additions, non-food groceries, sales tax and delivery fees.
- Show the weekly budget, estimated grocery total and difference. When the estimate exceeds the budget, offer cheaper swaps for user approval; do not apply them automatically.
- Let the user enter and edit one final actual spending total for the week after shopping. Keep it separate from the estimate; never replace the estimate with actual spending or combine them into one total.
- Require no individual item price entry. Use app-maintained general reference prices to produce clearly labeled rough estimates when available. Flag items still missing prices, and label the overall estimate incomplete. Never treat an unknown price as zero or claim the list fits the budget while prices are missing.
- Open Groceries to the current week. Provide previous/next week controls and a reset-to-default action for the selected week's budget.

## Proposed details still to confirm

These details are recommendations, not additional user-confirmed choices:

- Compare package checkout costs with the weekly budget using general reference estimates; users do not enter individual item prices. The reference dataset and maintenance process still need implementation.
- Compare package checkout costs with the weekly budget, including already selected purchases. Show an incomplete priced subtotal and missing-price count when needed. Do not present rough estimates as verified store prices.
- A week without an override inherits the default. Decide whether changing the default also affects past weeks before implementing historical totals; preferably retain a budget snapshot once a week is finalized.
- Use the account's time zone and week-start setting to identify weeks. Confirm the preferred week-start day.
- Reset removes only the selected week's budget override; it should preserve groceries, checked items and actual spending.
- Actual spending is editable, initially blank, and applies to the whole selected week. Define how multiple shopping trips contribute to that one final weekly total.
- Allow a zero budget for a pantry-only week; reject negative values and store currency amounts as integer cents.

## Examples for acceptance testing

1. With a $150 default, setting one week to $100 leaves another week at $150. Returning to the edited week still shows $100.
2. A complete $120 estimate against a $100 budget shows $20 over and offers swaps. Dismissing them leaves the plan and groceries intact.
3. A $90 priced subtotal plus two unpriced items against a $100 budget is labeled incomplete; it is not shown as confirmed $10 under budget.
4. Entering $112 actual spending preserves the estimate, budget and their separate comparisons. A blank actual total differs from an entered $0.
5. Navigating weeks preserves each override and actual total. Resetting the selected budget returns it to the default without deleting grocery data.

## Price-estimation and AI-recipe decisions

Start here item 6 is complete as a product decision. Baseline method: app-maintained general reference prices, using package sizes where available, to calculate a rough grocery estimate. No individual item price entry is required or included in the initial flow. Store reference source, observation date, region, currency and confidence; leave unavailable prices unknown and flag incomplete totals. Never use AI-invented prices as verified reference data. Selecting, sourcing and maintaining the actual reference table remain implementation work; no dataset has been integrated.

The user enters only the final checkout total after shopping, including tax, fees and non-food groceries, separately from the estimate. Unknown tax/fees must not silently become zero; label these omissions when estimating the all-in checkout amount. The existing single weekly actual-total choice remains in effect; multiple-trip aggregation is still a detail to settle.

New AI-generated recipes belong in the first release. Label them clearly as AI-generated and preserve that label after saving or editing. This is a scope decision, not an implemented generation feature. Model/provider, generation cost limits and recipe validation remain implementation decisions. Existing catalog and import flows remain available separately.
