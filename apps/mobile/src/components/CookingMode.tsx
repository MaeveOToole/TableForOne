import { preparationSteps } from '../lib/preparation';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  scaleRecipe,
  formatKitchenQuantity,
  type Recipe,
} from '@meal/contracts';
import { theme } from '../theme';

export function CookingMode({
  recipe,
  portions,
}: {
  recipe: Recipe;
  portions: number;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState<number[]>([]);
  if (!recipe.instructions.length || recipe.incomplete) return null;
  const scaled = scaleRecipe(recipe, portions);
  const finished = step === recipe.instructions.length;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        style={s.launch}
        onPress={() => setOpen(true)}
      >
        <Text style={s.white}>Start cooking</Text>
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={s.safe}>
          <ScrollView contentContainerStyle={s.content}>
            <View style={s.row}>
              <Text style={s.eyebrow}>IN YOUR KITCHEN</Text>
              <Pressable
                accessibilityRole="button"
                style={s.button}
                onPress={() => setOpen(false)}
              >
                <Text>Exit cooking</Text>
              </Pressable>
            </View>
            <Text style={s.title}>{recipe.title}</Text>
            <Text style={s.muted}>
              {portions} portions ? Progress stays while this recipe is open.
            </Text>
            <View style={s.track}>
              <View
                style={[
                  s.progress,
                  { width: `${(step / recipe.instructions.length) * 100}%` },
                ]}
              />
            </View>
            <View style={s.stepCard} accessibilityLiveRegion="polite">
              <Text style={s.eyebrow}>
                {finished
                  ? 'ALL DONE'
                  : `STEP ${step + 1} OF ${recipe.instructions.length}`}
              </Text>
              <Text style={s.instruction}>
                {finished
                  ? 'A good meal, made by you.'
                  : preparationSteps(recipe.instructions)[step]}
              </Text>
              {finished && (
                <Text style={s.muted}>
                  Enjoy your meal. Refrigerate leftovers promptly for another
                  day.
                </Text>
              )}
            </View>
            <View style={s.row}>
              <Pressable
                accessibilityRole="button"
                disabled={step === 0}
                style={[s.button, step === 0 && s.disabled]}
                onPress={() => setStep((n) => n - 1)}
              >
                <Text>Previous step</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={s.launch}
                onPress={() =>
                  finished ? setOpen(false) : setStep((n) => n + 1)
                }
              >
                <Text style={s.white}>
                  {finished
                    ? 'Finish cooking'
                    : step === recipe.instructions.length - 1
                      ? 'Complete recipe'
                      : 'Next step'}
                </Text>
              </Pressable>
            </View>
            <Text style={s.section}>Everything you need</Text>
            {!!scaled.warning && <Text style={s.muted}>{scaled.warning}</Text>}
            {scaled.ingredients.map((ingredient, index) => (
              <Pressable
                key={index}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: checked.includes(index) }}
                aria-checked={checked.includes(index)}
                accessibilityLabel={ingredient.raw}
                style={s.ingredient}
                onPress={() =>
                  setChecked((items) =>
                    items.includes(index)
                      ? items.filter((i) => i !== index)
                      : [...items, index],
                  )
                }
              >
                <View
                  style={[s.checkbox, checked.includes(index) && s.checked]}
                >
                  <Text style={s.white}>
                    {checked.includes(index) ? '\u2713' : ''}
                  </Text>
                </View>
                <Text
                  style={[
                    s.ingredientText,
                    checked.includes(index) && s.struck,
                  ]}
                >
                  {ingredient.quantity === null || portions === recipe.servings
                    ? ingredient.raw
                    : `${formatKitchenQuantity(ingredient.quantity)} ${ingredient.unit || ''} ${ingredient.name}`}
                </Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              style={s.button}
              onPress={() => {
                setStep(0);
                setChecked([]);
              }}
            >
              <Text>Reset cooking progress</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.canvas },
  content: {
    padding: 24,
    gap: 20,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  launch: {
    backgroundColor: theme.olive,
    padding: 16,
    borderRadius: 14,
    minHeight: 50,
    alignItems: 'center',
  },
  white: { color: '#FFFFFF', fontWeight: '600' },
  button: {
    padding: 14,
    borderRadius: 14,
    minHeight: 48,
    backgroundColor: theme.sage,
  },
  title: {
    fontFamily: 'Nunito',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
    color: theme.ink,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: theme.olive,
    fontWeight: '700',
  },
  muted: { fontSize: 14, color: theme.muted, lineHeight: 22 },
  track: {
    height: 6,
    borderRadius: 4,
    backgroundColor: theme.line,
    overflow: 'hidden',
  },
  progress: { height: 6, backgroundColor: theme.olive },
  stepCard: {
    padding: 26,
    gap: 18,
    backgroundColor: theme.paper,
    borderRadius: 24,
  },
  instruction: { fontSize: 25, lineHeight: 38, color: theme.ink },
  section: { fontSize: 20, fontWeight: '700', color: theme.ink },
  ingredient: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    minHeight: 56,
    padding: 10,
  },
  ingredientText: { flex: 1, color: theme.ink, fontSize: 16, lineHeight: 24 },
  checkbox: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: theme.olive,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: { backgroundColor: theme.olive },
  struck: { textDecorationLine: 'line-through', color: theme.muted },
  disabled: { opacity: 0.4 },
});
