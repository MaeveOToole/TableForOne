import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Preferences, Recipe, savedListSchema } from '@meal/contracts';
import { mealColor, theme } from '../theme';
import { api } from '../lib/api';
import { getGroceryEngine } from '../lib/grocery-engine';
import { shoppingName, weeklyIngredients } from '../lib/shopping-quantities';
function plus(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function today(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function startOfWeek(p: Preferences) {
  const date = today(p.timeZone),
    day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return plus(date, -((day + (p.weekStartDay === 'Monday' ? 6 : 0)) % 7));
}

export function ThisWeek({
  preferences,
  recipes,
  records,
  signedIn,
  onOpen,
  onDiscover,
  onBrowse,
  onSaved,
  onRefresh,
  owner,
  onWeekChange,
}: {
  preferences: Preferences;
  recipes: Recipe[];
  records: ReturnType<typeof savedListSchema.parse>['items'];
  signedIn: boolean;
  onOpen: (recipe: Recipe) => void;
  onDiscover: (week: string) => void;
  onBrowse: (week: string) => void;
  onSaved: (week: string) => void;
  onRefresh: () => Promise<void>;
  owner: string | null;
  onWeekChange: (week: string) => void;
}) {
  const [week, setWeek] = useState(() => startOfWeek(preferences));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => onWeekChange(week), [week, onWeekChange]);
  const marked = records
    .filter((record) => record.planned_week === week)
    .flatMap((record) => {
      const recipe = recipes.find((recipe) => recipe.id === record.recipe_id);
      return recipe ? [recipe] : [];
    });
  async function remove(recipe: Recipe) {
    const record = records.find((record) => record.recipe_id === recipe.id);
    if (!record || !owner || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await api(
        `/saved/${recipe.id}/organization`,
        'PUT',
        {
          revision: record.revision,
          collectionId: record.collection_id,
          plannedWeek: null,
        },
        undefined,
        owner,
      );
      await onRefresh();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Unable to update your week.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function groceries() {
    if (!owner || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const engine = getGroceryEngine(owner, week);
      await engine.load();
      await engine.sync();
      const existing = new Set(
        engine
          .snapshot()
          .items.map((item) => shoppingName(item.name).toLowerCase()),
      );
      let added = 0;
      for (const ingredient of weeklyIngredients(marked, preferences.people)) {
        if (existing.has(ingredient.name.toLowerCase())) continue;
        await engine.add(ingredient.name);
        const item = engine.snapshot().items.at(-1)!;
        if (ingredient.quantity !== null)
          await engine.edit(item.id, {
            quantity: Math.ceil(ingredient.quantity),
            unit: ingredient.unit,
          });
        existing.add(ingredient.name.toLowerCase());
        added++;
      }
      await engine.sync();
      setMessage(
        added
          ? 'Ingredients added to Grocery List. Choose package quantities with the pencil; items already on your list were kept.'
          : 'Your ingredients are already on Grocery List.',
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : 'Unable to update groceries. Retry to sync saved changes.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.hero}>
        <Text style={s.eyebrow}>A LITTLE PLANNING. PLENTY OF FLEXIBILITY.</Text>
        <Text style={s.title}>This week's options.</Text>
        <Text style={s.description}>
          A few favorites. Cook what sounds good, whenever you're ready.
        </Text>
        <Pressable
          accessibilityRole="button"
          style={s.primary}
          onPress={() => onSaved(week)}
        >
          <Text style={s.primaryText}>+ Add meals</Text>
        </Pressable>
      </View>
      <View style={s.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          style={s.button}
          onPress={() => {
            setWeek(plus(week, -7));
            setMessage('');
          }}
        >
          <Text>‹</Text>
        </Pressable>
        <Text style={s.week}>
          Week of{' '}
          {new Date(`${week}T12:00:00Z`).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next week"
          style={s.button}
          onPress={() => {
            setWeek(plus(week, 7));
            setMessage('');
          }}
        >
          <Text>›</Text>
        </Pressable>
      </View>
      <View style={s.row}>
        <Pressable
          accessibilityRole="button"
          style={s.button}
          onPress={() => onBrowse(week)}
        >
          <Text>+ Discover</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={s.button}
          onPress={() => onSaved(week)}
        >
          <Text>+ Saved</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={s.button}
          onPress={() => onDiscover(week)}
        >
          <Text>Find a recipe</Text>
        </Pressable>
      </View>
      {(['breakfast', 'lunch', 'dinner', 'side', null] as const).map(
        (category) => {
          const items = marked.filter((recipe) => recipe.category === category);
          if ((category === 'side' || category === null) && !items.length)
            return null;
          const label =
            category === null
              ? 'Other options'
              : category === 'side'
                ? 'Sides'
                : category[0].toUpperCase() + category.slice(1);
          return (
            <View key={category || 'other'} style={s.group}>
              <View style={s.row}>
                <Text accessibilityRole="header" style={s.heading}>
                  {label}
                </Text>
                <Text style={s.muted}>
                  {items.length} {items.length === 1 ? 'option' : 'options'}
                </Text>
              </View>
              {!items.length && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${label.toLowerCase()} options`}
                  style={s.empty}
                  onPress={() => onSaved(week)}
                >
                  <Text style={s.muted}>
                    + Add a few {label.toLowerCase()} favorites
                  </Text>
                </Pressable>
              )}
              {items.map((recipe) => (
                <View
                  key={recipe.id}
                  style={[
                    s.recipe,
                    { backgroundColor: mealColor(category).background },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open weekly recipe ${recipe.title}`}
                    style={{ flex: 1, gap: 5 }}
                    onPress={() => onOpen(recipe)}
                  >
                    <Text style={s.recipeTitle}>{recipe.title}</Text>
                    <Text style={s.muted}>
                      {recipe.minutes === null
                        ? 'View recipe'
                        : `${recipe.minutes} min · View recipe`}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove from week: ${recipe.title}`}
                    disabled={busy}
                    style={s.icon}
                    onPress={() => void remove(recipe)}
                  >
                    <Text>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          );
        },
      )}
      {!!marked.length && signedIn && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={s.primary}
          onPress={() => void groceries()}
        >
          <Text style={s.primaryText}>
            {busy ? 'Updating…' : 'Add ingredients to Grocery List'}
          </Text>
        </Pressable>
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={s.muted}>
          {message}
        </Text>
      )}
      {!signedIn && (
        <Text style={s.muted}>
          Sign in in Settings to keep your weekly meals.
        </Text>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  content: { gap: 20, paddingBottom: 24 },
  hero: {
    backgroundColor: theme.olive,
    padding: 22,
    borderRadius: 24,
    gap: 12,
  },
  eyebrow: {
    color: theme.accent,
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  title: {
    color: '#fff',
    fontFamily: 'Nunito',
    fontSize: 27,
    fontWeight: '800',
  },
  description: { color: '#EDF1E6', fontSize: 14, lineHeight: 22 },
  primary: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    padding: 14,
    minHeight: 48,
    alignItems: 'center',
  },
  primaryText: { color: theme.ink, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  button: {
    minHeight: 44,
    padding: 10,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: theme.paper,
  },
  week: { color: theme.ink, fontSize: 16, fontWeight: '600' },
  group: { gap: 10 },
  heading: { color: theme.ink, fontSize: 20, fontWeight: '700' },
  muted: { color: theme.muted, fontSize: 13, lineHeight: 20 },
  empty: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.line,
  },
  recipe: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
  },
  recipeTitle: { color: theme.ink, fontSize: 16, fontWeight: '600' },
  icon: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
