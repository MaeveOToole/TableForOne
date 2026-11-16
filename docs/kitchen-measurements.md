# Recipes without a scale

User direction, November 4, 2026: recipes should use cups, tablespoons, teaspoons and item counts instead of gram amounts.

The 12 public starter recipes, the browser sample catalog and the 48 personal recipe detail sets now use US kitchen measures, individual items or portions of a labeled package. A can's ounce size and a package's pound size identify what to buy; the recipe does not ask the cook to weigh an amount. Recipe reading retains preparation and packing wording. Cooking mode retains that wording at the original portion count and uses familiar fractions for scaled normalized quantities.

These are practical recipe adaptations, not exact equivalents. Cup packing, pasta shapes, berries, meat cuts and produce sizes vary. Some nearby amounts intentionally round to the same convenient kitchen measure. Existing generated/untested provenance stays visible; the kitchen-measure note explicitly says the amounts are approximate and not kitchen-tested. Retest the adapted recipes as part of recipe review, including yield, sauce balance and cooking time.

Reference checks: [Quaker's measuring chart](https://www.quakeroats.com/cooking-and-recipes/baking-101/welcome-to-baking-101/measuring-and-conversions) for ordinary rolled oats; [King Arthur's ingredient chart](https://www.kingarthurbaking.com/learn/ingredient-weight-chart) for ingredient-specific volume context; [Barilla's pasta guide](https://www.barilla.com/en-us/help-with/pasta-kitchen-tips/pasta-serving-size) for differences between pasta shapes. These references do not establish kitchen testing of these recipes or exact equivalence for every ingredient.

`withKitchenMeasurements` uses explicit legacy ingredient-text matches so existing hosted account recipes and cached library pages can show the same measures without a database rewrite. It preserves unrelated edits, unknown normalized quantities, original summaries and saved ownership. It does not guess a universal density for an unknown ingredient, reinterpret a separately changed normalized amount or rewrite immutable historical snapshots. The current weekly list reads the adapted library recipes. Future custom/imported recipes require their own ingredient review.

Tests check all current recipe sets for metric weight amounts, legacy adaptation, serving arithmetic, immutability, unknown/custom amounts and readable fractions. The browser scenario covers public recipe reading, cooking mode and a completed personal chicken recipe.
