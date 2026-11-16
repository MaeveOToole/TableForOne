import { preparationSteps } from '../lib/preparation';
import { StyleSheet, Text, View } from 'react-native';
import type { Recipe } from '@meal/contracts';
import { mealColor, theme } from '../theme';

export function RecipeReadingView({ recipe }: { recipe: Recipe }) {
  const drafted = recipe.personal_modifications.some(
    (change) => change.kind === 'personal_recipe_completion_v1',
  );
  return (
    <View style={s.content}>
      <Text accessibilityRole="header" style={s.title}>
        {recipe.title}
      </Text>
      <Text style={[s.time, { color: mealColor(recipe.category).foreground }]}>
        {recipe.minutes === null
          ? 'Cooking time not available'
          : `${recipe.minutes} minutes${drafted ? ' total (estimated)' : ''}`}
      </Text>
      {drafted && (
        <Text style={s.empty}>
          AI-drafted from your recipe notes. Not kitchen-tested. Makes{' '}
          {recipe.servings} {recipe.servings === 1 ? 'portion' : 'portions'}.
        </Text>
      )}
      {recipe.personal_modifications.some(
        (change) => change.kind === 'kitchen_measurements_v1',
      ) && (
        <Text style={s.empty}>
          Kitchen measures are approximate. Item sizes vary; these recipes have
          not been kitchen-tested.
        </Text>
      )}
      <Text accessibilityRole="header" style={s.section}>
        Appliances needed
      </Text>
      <Text style={s.time}>
        {recipe.equipment_known
          ? recipe.equipment.length
            ? recipe.equipment.join(', ')
            : 'No cooking appliance needed'
          : 'Appliances have not been recorded yet.'}
      </Text>
      <Text accessibilityRole="header" style={s.section}>
        Ingredients
      </Text>
      {recipe.ingredients.length ? (
        recipe.ingredients.map((ingredient, index) => (
          <View key={index} style={s.ingredient}>
            <Text style={s.bullet}>{'\u2022'}</Text>
            <Text style={s.body}>
              {ingredient.raw ||
                [ingredient.quantity, ingredient.unit, ingredient.name]
                  .filter((value) => value !== null && value !== '')
                  .join(' ')}
            </Text>
          </View>
        ))
      ) : (
        <Text style={s.empty}>
          Ingredients have not been added to this recipe yet.
        </Text>
      )}
      <Text accessibilityRole="header" style={s.section}>
        Preparation
      </Text>
      {recipe.instructions.length ? (
        preparationSteps(recipe.instructions).map((instruction, index) => (
          <View key={index} style={s.step}>
            <View
              style={[
                s.number,
                { backgroundColor: mealColor(recipe.category).background },
              ]}
            >
              <Text
                style={[
                  s.numberText,
                  { color: mealColor(recipe.category).foreground },
                ]}
              >
                {index + 1}
              </Text>
            </View>
            <Text style={s.body}>{instruction}</Text>
          </View>
        ))
      ) : (
        <Text style={s.empty}>
          Preparation steps have not been added to this recipe yet.
        </Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  content: { gap: 18 },
  title: {
    fontFamily: 'Nunito',
    fontSize: 30,
    lineHeight: 37,
    color: theme.ink,
    fontWeight: '800',
  },
  time: { fontSize: 15, color: theme.muted },
  section: { fontSize: 22, color: theme.ink, fontWeight: '700', marginTop: 14 },
  ingredient: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bullet: { fontSize: 18, lineHeight: 26, color: theme.olive },
  body: { flex: 1, fontSize: 16, lineHeight: 27, color: theme.ink },
  empty: { fontSize: 15, lineHeight: 24, color: theme.muted },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 8,
  },
  number: {
    width: 30,
    height: 30,
    backgroundColor: theme.sage,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { fontSize: 14, fontWeight: '700', color: theme.olive },
});
