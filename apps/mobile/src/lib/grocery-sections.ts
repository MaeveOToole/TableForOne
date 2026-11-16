type ShoppingItem = {
  name: string;
  section: string | null;
  checked: boolean;
  created_at: string;
  id: string;
};
export const grocerySections = [
  'Produce',
  'Meat and seafood',
  'Dairy and eggs',
  'Bakery',
  'Frozen',
  'Pantry',
  'Household',
  'Other',
];
const order = [...grocerySections, 'Checked off'];

// General shopping groups, not a claim about any particular store's aisle map.
// Explicit item sections take priority; uncertain names remain in Other.
export function grocerySection(
  item: Pick<ShoppingItem, 'name' | 'section' | 'checked'>,
) {
  if (item.checked) return 'Checked off';
  if (item.section?.trim()) return item.section.trim();
  const name = item.name.trim().toLowerCase();
  if (/\b(frozen|ice cream)\b/.test(name)) return 'Frozen';
  if (
    /\b(paper towels?|toilet paper|dish soap|detergent|trash bags?|foil|sponges?)\b/.test(
      name,
    )
  )
    return 'Household';
  if (
    /\b(canned|dried|pasta|rice|flour|olive oil|vinegar|salt|black pepper|ground pepper|beans?|lentils?|oats?|cereal|spices?|broth|stock|soup|peanut butter|almond butter)\b/.test(
      name,
    )
  )
    return 'Pantry';
  if (
    /\b(chicken|beef|pork|turkey|salmon|shrimp|cod|steak|ground meat)\b/.test(
      name,
    )
  )
    return 'Meat and seafood';
  if (/\b(bread|bagels?|tortillas?|pita|rolls?)\b/.test(name)) return 'Bakery';
  if (/\b(milk|eggs?|yog(?:u|hu)rt|cheese|butter|cream)\b/.test(name))
    return 'Dairy and eggs';
  if (
    /\b(onions?|tomato(?:es)?|spinach|lettuce|carrots?|broccoli|peppers?|potatoes?|avocados?|bananas?|apples?|lemons?|limes?|berries|fruit|cilantro|parsley|garlic)\b/.test(
      name,
    )
  )
    return 'Produce';
  return 'Other';
}
export function compareGroceries(a: ShoppingItem, b: ShoppingItem) {
  const sectionA = grocerySection(a),
    sectionB = grocerySection(b);
  const rank = (section: string) => {
    const index = order.indexOf(section);
    return index < 0 ? order.indexOf('Other') : index;
  };
  return (
    Number(a.checked) - Number(b.checked) ||
    rank(sectionA) - rank(sectionB) ||
    sectionA.localeCompare(sectionB) ||
    a.created_at.localeCompare(b.created_at) ||
    a.id.localeCompare(b.id)
  );
}
