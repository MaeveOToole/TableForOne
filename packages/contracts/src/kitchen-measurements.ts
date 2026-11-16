import type { Recipe } from './index';

export function formatKitchenQuantity(quantity: number): string {
  const whole = Math.floor(quantity);
  const remainder = quantity - whole;
  if (remainder < 0.00001) return String(whole);
  for (const denominator of [2, 3, 4, 8, 16]) {
    const numerator = Math.round(remainder * denominator);
    if (
      numerator > 0 &&
      numerator < denominator &&
      Math.abs(remainder - numerator / denominator) < 0.00001
    ) {
      return `${whole ? `${whole} ` : ''}${numerator}/${denominator}`;
    }
  }
  return String(Number(quantity.toPrecision(4)));
}

// Explicit recipe adaptations, not a general mass-to-volume conversion table.
// Cup packing, pasta shapes and produce/cut sizes vary; these remain untested.
// Keep legacy strings here so existing account data and caches can be read
// without a destructive database rewrite or changing unrelated user edits.
const adaptations: [string, string, number, string][] = [
  [
    '1 400 g can chickpeas, drained and rinsed',
    '1 can chickpeas (15-ounce can), drained and rinsed',
    1,
    '15-ounce can',
  ],
  [
    '1 400 g can white beans, drained and rinsed',
    '1 can white beans (15-ounce can), drained and rinsed',
    1,
    '15-ounce can',
  ],
  [
    '1 400 g can black beans, drained and rinsed',
    '1 can black beans (15-ounce can), drained and rinsed',
    1,
    '15-ounce can',
  ],
  [
    '1 400 g can cooked lentils, drained and rinsed',
    '1 can cooked lentils (15-ounce can), drained and rinsed',
    1,
    '15-ounce can',
  ],
  [
    '1 400 g can diced tomatoes',
    '1 can diced tomatoes (14.5-ounce can)',
    1,
    '14.5-ounce can',
  ],
  [
    '100 g spinach, washed',
    '3 1/2 cups loosely packed spinach, washed',
    3.5,
    'cup',
  ],
  [
    '60 g spinach, washed and chopped',
    '2 cups loosely packed spinach, washed and chopped',
    2,
    'cup',
  ],
  [
    '150 g pasta, dry; cook according to package',
    '1 1/2 cups dry short pasta; cook according to package',
    1.5,
    'cup',
  ],
  ['100 g rice, dry', '1/2 cup dry rice', 0.5, 'cup'],
  [
    '400 g sweet potato, cut into 2 cm cubes',
    '3 cups sweet potato, cut into 3/4-inch cubes',
    3,
    'cup',
  ],
  ['200 g broccoli, small florets', '2 cups broccoli, small florets', 2, 'cup'],
  ['100 g frozen peas', '2/3 cup frozen peas', 2 / 3, 'cup'],
  [
    '120 g red lentils, dry; rinsed',
    '2/3 cup dry red lentils, rinsed',
    2 / 3,
    'cup',
  ],
  [
    '300 g zucchini, cut into small cubes',
    '2 cups zucchini, cut into small cubes',
    2,
    'cup',
  ],
  [
    '200 g cucumber, washed and diced',
    '1 1/2 cups cucumber, washed and diced',
    1.5,
    'cup',
  ],
  [
    '200 g tomato, washed and diced',
    '1 cup tomato, washed and diced',
    1,
    'cup',
  ],
  ['80 g rolled oats', '1 cup rolled oats', 1, 'cup'],
  ['300 g plain yogurt', '1 1/3 cups plain yogurt', 1 + 1 / 3, 'cup'],
  [
    '150 g berries, washed; use fresh berries',
    '1 cup fresh berries, washed',
    1,
    'cup',
  ],
  [
    '40 g rolled oats, ready-to-eat or prepare according to package',
    '1/2 cup rolled oats, ready-to-eat or prepare according to package',
    0.5,
    'cup',
  ],
  ['300 g raw chicken tenderloins', '5 raw chicken tenderloins', 5, 'whole'],
  ['250 g raw chicken tenderloins', '4 raw chicken tenderloins', 4, 'whole'],
  [
    '300 g raw chicken breast',
    '1 large raw boneless skinless chicken breast',
    1,
    'whole',
  ],
  [
    '250 g raw chicken breast',
    '1 large raw boneless skinless chicken breast',
    1,
    'whole',
  ],
  [
    '350 g raw boneless chicken thighs',
    '3 medium raw boneless skinless chicken thighs',
    3,
    'whole',
  ],
  [
    '250 g cooked chicken breast, chilled',
    '1 3/4 cups chopped cooked chicken breast, chilled',
    1.75,
    'cup',
  ],
  [
    '200 g cooked chicken breast',
    '1 1/2 cups chopped cooked chicken breast',
    1.5,
    'cup',
  ],
  ['150 g dry pasta', '1 1/2 cups dry short pasta', 1.5, 'cup'],
  ['150 g dry elbow macaroni', '1 1/4 cups dry elbow macaroni', 1.25, 'cup'],
  ['150 g dry macaroni', '1 1/4 cups dry macaroni', 1.25, 'cup'],
  ['150 g dry noodles', '1 1/2 cups dry short noodles', 1.5, 'cup'],
  ['150 g dry ziti', '1 1/2 cups dry ziti', 1.5, 'cup'],
  ['150 g dry rigatoni', '1 3/4 cups dry rigatoni', 1.75, 'cup'],
  [
    '150 g dry spaghetti',
    '1/3 of a 1-pound package dry spaghetti',
    1 / 3,
    '1-pound package',
  ],
  [
    '150 g dry angel hair pasta',
    '1/3 of a 1-pound package dry angel hair pasta',
    1 / 3,
    '1-pound package',
  ],
  ['150 g dry orzo', '3/4 cup dry orzo', 0.75, 'cup'],
  ['150 g dry penne', '1 3/4 cups dry penne', 1.75, 'cup'],
  ['100 g fresh mozzarella', '3/4 cup diced fresh mozzarella', 0.75, 'cup'],
  ['100 g burrata', '1 small burrata ball', 1, 'whole'],
  ['75 g burrata', '1 small burrata ball', 1, 'whole'],
  [
    '300 g peeled butternut squash cubes',
    '2 cups peeled butternut squash cubes',
    2,
    'cup',
  ],
  [
    '400 g peeled butternut squash cubes',
    '3 cups peeled butternut squash cubes',
    3,
    'cup',
  ],
  [
    '250 g raw ground beef',
    '1/2 of a 1-pound package raw ground beef',
    0.5,
    '1-pound package',
  ],
  [
    '200 g fully cooked Italian chicken sausage',
    '2 fully cooked Italian chicken sausage links',
    2,
    'whole',
  ],
  [
    '200 g fully cooked chicken sausage',
    '2 fully cooked chicken sausage links',
    2,
    'whole',
  ],
  ['300 g raw steak', '1 medium raw steak, about 1 inch thick', 1, 'whole'],
  ['85 g sliced cooked turkey', '4 slices cooked deli turkey', 4, 'slice'],
  ['300 g Brussels sprouts', '3 cups Brussels sprouts', 3, 'cup'],
  ['300 g broccoli florets', '3 cups broccoli florets', 3, 'cup'],
];

export const kitchenMeasurementNote = {
  method: 'generated',
  kind: 'kitchen_measurements_v1',
  note: 'Adapted to US kitchen measures and item/package counts. Amounts are approximate; produce and meat sizes vary. Not kitchen-tested.',
};

const byRaw = new Map(
  adaptations.map(([before, raw, quantity, unit]) => [
    before,
    { raw, quantity, unit },
  ]),
);

export function withKitchenMeasurements(recipe: Recipe): Recipe {
  let changed = false;
  const ingredients = recipe.ingredients.map((ingredient) => {
    const adapted = byRaw.get(ingredient.raw);
    if (!adapted) return ingredient;
    // Do not reinterpret a separately edited/scaled normalized quantity.
    const oldQuantity = Number(ingredient.raw.match(/^\d+/)?.[0]);
    const oldUnit = oldQuantity === 1 ? '400 g can' : 'g';
    if (
      ingredient.quantity !== null &&
      (ingredient.quantity !== oldQuantity || ingredient.unit !== oldUnit)
    )
      return ingredient;
    changed = true;
    return {
      ...ingredient,
      raw: adapted.raw,
      name: ingredient.name === ingredient.raw ? adapted.raw : ingredient.name,
      quantity: ingredient.quantity === null ? null : adapted.quantity,
      unit: ingredient.quantity === null ? null : adapted.unit,
      confidence: 'generated' as const,
    };
  });
  if (!changed) return recipe;
  return {
    ...recipe,
    ingredients,
    personal_modifications: recipe.personal_modifications.some(
      (change) => change.kind === kitchenMeasurementNote.kind,
    )
      ? recipe.personal_modifications
      : [...recipe.personal_modifications, kitchenMeasurementNote],
  };
}
