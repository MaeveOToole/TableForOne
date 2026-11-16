import { RecipeAssistant } from './RecipeAssistant';
import { useState } from 'react';
import { Suggestions } from './ProfileFields';
import { RecipeArtwork } from './RecipeArtwork';
import { mealColor, theme } from '../theme';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  discoverRecipes,
  type Recipe,
  type Preferences,
  type DiscoveryContext,
  type savedListSchema,
} from '@meal/contracts';
type Saved = ReturnType<typeof savedListSchema.parse>['items'];
type Props = {
  mode: 'Discover' | 'Saved';
  recipes: Recipe[];
  preferences: Preferences;
  context: DiscoveryContext;
  saved: string[];
  records: Saved;
  collections: { id: string; name: string }[];
  signedIn: boolean;
  demo: boolean;
  loading: boolean;
  busy: boolean;
  wide: boolean;
  onOpen: (r: Recipe) => void;
  onManage: (r: Recipe) => void;
  onSave: (r: Recipe) => Promise<void>;
  onReload: () => Promise<void>;
  onProfile: () => void;
  planningWeek?: string | null;
  onAddToWeek?: (recipe: Recipe) => Promise<void>;
  onReturnToWeek?: () => void;
  chatOpen?: boolean;
  onChatChange?: (open: boolean) => void;
  showChat?: boolean;
};
export function RecipeBrowser(p: Props) {
  const [query, setQuery] = useState(''),
    [expanded, setExpanded] = useState(false),
    [meal, setMeal] = useState(''),
    [cuisine, setCuisine] = useState(''),
    [ingredient, setIngredient] = useState(''),
    [cost, setCost] = useState(''),
    [quick, setQuick] = useState(false),
    [simple, setSimple] = useState(false),
    [collection, setCollection] = useState(''),
    [week, setWeek] = useState('');
  const invalidCost =
    !!cost.trim() && (!Number.isFinite(Number(cost)) || Number(cost) < 0);
  const base =
    p.mode === 'Saved'
      ? p.recipes.filter((r) => p.saved.includes(r.id))
      : p.recipes;
  const ranked = discoverRecipes(base, p.preferences, p.context, {
    query,
    meal: meal || undefined,
    cuisine: cuisine || undefined,
    ingredient: ingredient || undefined,
    maxMinutes: quick ? 25 : p.preferences.maxMinutes,
    difficulty: simple ? 'simple' : undefined,
    includeDrafts: p.mode === 'Saved',
    respectPreferences: p.mode === 'Discover',
    ...(cost.trim() && !invalidCost
      ? { maxCostCents: Math.round(Number(cost) * 100) }
      : {}),
  });
  const visible = invalidCost
    ? []
    : ranked.filter(
        (r) =>
          (!collection ||
            p.records.find((s) => s.recipe_id === r.recipe.id)
              ?.collection_id === collection) &&
          (!week ||
            p.records.find((s) => s.recipe_id === r.recipe.id)?.planned_week ===
              week),
      );
  const mealGroups = [
    { value: 'breakfast', label: 'Breakfast' },
    { value: 'lunch', label: 'Lunch' },
    { value: 'dinner', label: 'Dinner' },
    { value: 'side', label: 'Sides' },
    { value: null, label: 'Uncategorized' },
  ];
  type RankedRecipe = (typeof ranked)[number];
  type RecipeRow =
    | {
        key: string;
        heading: string;
        count: number;
        category: string | null;
        recipes?: never;
      }
    | { key: string; recipes: RankedRecipe[]; heading?: never; count?: never };
  const rows: RecipeRow[] = [];
  for (const group of mealGroups) {
    const items = visible
      .filter((item) => item.recipe.category === group.value)
      .sort(
        (a, b) =>
          a.recipe.title.localeCompare(b.recipe.title, 'en', {
            sensitivity: 'base',
            numeric: true,
          }) || a.recipe.id.localeCompare(b.recipe.id),
      );
    if (!items.length) continue;
    rows.push({
      key: `heading-${group.value}`,
      heading: group.label,
      category: group.value,
      count: items.length,
    });
    const columns = p.wide ? 2 : 1;
    for (let index = 0; index < items.length; index += columns) {
      rows.push({
        key: items[index].recipe.id,
        recipes: items.slice(index, index + columns),
      });
    }
  }
  const filtered = !!(
    query ||
    meal ||
    cuisine ||
    ingredient ||
    cost ||
    quick ||
    simple ||
    collection ||
    week
  );
  function clear() {
    setQuery('');
    setMeal('');
    setCuisine('');
    setIngredient('');
    setCost('');
    setQuick(false);
    setSimple(false);
    setCollection('');
    setWeek('');
  }
  const activeFilters = [
    ...(meal
      ? [
          {
            key: 'meal',
            label:
              meal === 'side' ? 'Sides' : meal[0].toUpperCase() + meal.slice(1),
            remove: () => setMeal(''),
          },
        ]
      : []),
    ...(quick
      ? [
          {
            key: 'quick',
            label: '25 min or less',
            remove: () => setQuick(false),
          },
        ]
      : []),
    ...(simple
      ? [{ key: 'simple', label: 'Simple', remove: () => setSimple(false) }]
      : []),
    ...(cuisine
      ? [{ key: 'cuisine', label: cuisine, remove: () => setCuisine('') }]
      : []),
    ...(ingredient
      ? [
          {
            key: 'ingredient',
            label: ingredient,
            remove: () => setIngredient(''),
          },
        ]
      : []),
    ...(cost
      ? [{ key: 'cost', label: 'Budget $' + cost, remove: () => setCost('') }]
      : []),
    ...(collection
      ? [
          {
            key: 'collection',
            label:
              p.collections.find((c) => c.id === collection)?.name ||
              'Collection',
            remove: () => setCollection(''),
          },
        ]
      : []),
    ...(week
      ? [{ key: 'week', label: 'Week ' + week, remove: () => setWeek('') }]
      : []),
  ];
  const header = (
    <View style={s.header}>
      {p.planningWeek && (
        <View style={{ padding: 12, gap: 8, backgroundColor: theme.sage }}>
          <Text>Choosing meals for week starting {p.planningWeek}</Text>
          <Text>
            Tap + to build your weekly meal options. Cook them whenever you
            like.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={p.onReturnToWeek}
            style={s.control}
          >
            <Text>Return to weekly planning</Text>
          </Pressable>
        </View>
      )}
      {p.mode === 'Discover' && p.showChat !== false && (
        <View style={{ paddingVertical: 8 }}>
          <Pressable
            accessibilityRole="button"
            style={s.control}
            onPress={() => p.onChatChange?.(!p.chatOpen)}
          >
            <Text>
              {p.chatOpen ? 'Browse Discover recipes' : 'Recipe chat'}
            </Text>
          </Pressable>
        </View>
      )}

      {p.mode === 'Discover' && (
        <RecipeAssistant
          suggestionsOnly
          preferences={p.preferences}
          recipes={ranked.map((r) => r.recipe)}
          signedIn={p.signedIn}
          demo={p.demo}
        />
      )}
      <Text style={s.intro}>
        {p.mode === 'Saved'
          ? 'Your own little cookbook. Keep the good ones close.'
          : 'A few good ideas for your next delicious dinner.'}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.mealFilters}
      >
        {[
          { value: '', label: 'All recipes' },
          ...mealGroups.filter((group) => group.value !== null),
        ].map((group) => (
          <Pressable
            key={group.value}
            accessibilityRole="button"
            accessibilityLabel={
              group.value ? `Filter ${group.value}` : 'All meals'
            }
            accessibilityState={{ selected: meal === group.value }}
            hitSlop={5}
            onPress={() => setMeal(group.value!)}
            style={[
              s.filterChip,
              {
                backgroundColor:
                  meal === group.value ? theme.sage : 'transparent',
                borderWidth: 1,
                borderColor:
                  meal === group.value
                    ? mealColor(group.value).foreground
                    : 'transparent',
              },
              !group.value && meal === group.value && s.selected,
            ]}
          >
            <Text
              style={[
                s.chipText,
                {
                  color: mealColor(group.value).foreground,
                  fontWeight: meal === group.value ? '700' : '400',
                },
              ]}
            >
              {group.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <TextInput
            accessibilityLabel={
              p.mode === 'Saved' ? 'Search saved recipes' : 'Search recipes'
            }
            value={query}
            onChangeText={setQuery}
            placeholder={
              p.mode === 'Saved' ? 'Search saved recipes' : 'Search recipes'
            }
            placeholderTextColor="#737D80"
            style={s.searchInput}
          />
          {!!query && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={4}
              onPress={() => setQuery('')}
              style={s.clearSearch}
            >
              <Text style={s.cross}>×</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Hide filters' : 'Show filters'}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((v) => !v)}
          style={[
            s.filterButton,
            (expanded || activeFilters.length > 0) && s.filterButtonActive,
          ]}
        >
          <View accessible={false} style={s.filterGlyph}>
            <View style={[s.filterLine, { width: 17 }]} />
            <View style={[s.filterLine, { width: 11 }]} />
            <View style={[s.filterLine, { width: 5 }]} />
          </View>
          {activeFilters.length > 0 && (
            <View style={s.filterBadge}>
              <Text style={s.filterBadgeText}>{activeFilters.length}</Text>
            </View>
          )}
        </Pressable>
      </View>
      {activeFilters.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
          keyboardShouldPersistTaps="handled"
        >
          {activeFilters.map((filter) => (
            <Pressable
              key={filter.key}
              accessibilityRole="button"
              accessibilityLabel={'Remove ' + filter.label + ' filter'}
              onPress={filter.remove}
              hitSlop={4}
              style={s.activeChip}
            >
              <Text style={s.chipText}>{filter.label}</Text>
              <Text style={s.chipClose}>×</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {expanded && (
        <View style={s.filterPanel}>
          <View style={s.panelHeading}>
            <Text style={s.panelTitle}>Refine recipes</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={6}
              style={s.smallAction}
              onPress={() => setExpanded(false)}
            >
              <Text style={s.actionText}>Done</Text>
            </Pressable>
          </View>
          <View style={s.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: quick }}
              onPress={() => setQuick((v) => !v)}
              hitSlop={4}
              style={[s.filterChip, quick && s.selected]}
            >
              <Text style={s.chipText}>25 min or less</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: simple }}
              onPress={() => setSimple((v) => !v)}
              hitSlop={4}
              style={[s.filterChip, simple && s.selected]}
            >
              <Text style={s.chipText}>Simple</Text>
            </Pressable>
          </View>
          <Suggestions
            label="Cuisine"
            values={[cuisine || 'Any cuisine']}
            options={['Any cuisine', ...new Set(base.map((r) => r.cuisine))]}
            disabled={false}
            onChange={([value]) =>
              setCuisine(value === 'Any cuisine' ? '' : value)
            }
          />
          <Suggestions
            label="Ingredient"
            values={[ingredient || 'Any ingredient']}
            options={[
              'Any ingredient',
              ...new Set(base.flatMap((r) => r.ingredients.map((i) => i.name))),
            ].sort()}
            disabled={false}
            onChange={([value]) =>
              setIngredient(value === 'Any ingredient' ? '' : value)
            }
          />
          <Suggestions
            label="Grocery budget"
            values={[cost ? '$' + cost : 'Any budget']}
            options={['Any budget', '$5', '$10', '$15', '$20', '$30']}
            disabled={false}
            onChange={([value]) =>
              setCost(value === 'Any budget' ? '' : value.slice(1))
            }
          />
          {p.mode === 'Saved' && (
            <>
              {p.collections.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.chipRow}
                  keyboardShouldPersistTaps="handled"
                >
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setCollection('')}
                    hitSlop={4}
                    style={[s.filterChip, !collection && s.selected]}
                  >
                    <Text style={s.chipText}>All collections</Text>
                  </Pressable>
                  {p.collections.map((c) => (
                    <Pressable
                      key={c.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: collection === c.id }}
                      onPress={() => setCollection(c.id)}
                      hitSlop={4}
                      style={[s.filterChip, collection === c.id && s.selected]}
                    >
                      <Text style={s.chipText}>{c.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <Suggestions
                label="Saved week"
                values={[week || 'Any week']}
                options={[
                  'Any week',
                  ...new Set(
                    p.records.flatMap((r) =>
                      r.planned_week ? [r.planned_week] : [],
                    ),
                  ),
                ]}
                disabled={false}
                onChange={([value]) =>
                  setWeek(value === 'Any week' ? '' : value)
                }
              />
            </>
          )}
        </View>
      )}
      {invalidCost && (
        <Text accessibilityRole="alert" style={s.filterHint}>
          Enter a valid non-negative cost limit.
        </Text>
      )}
      {p.mode === 'Saved' && !p.signedIn && !p.demo && (
        <View>
          <Text>Sign in to see your account's saved recipes.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={p.onProfile}
            style={s.control}
          >
            <Text>Sign in to view Saved</Text>
          </Pressable>
        </View>
      )}
      <View style={s.summaryRow}>
        <Text accessibilityLiveRegion="polite" style={s.resultCount}>
          {p.loading
            ? 'Loading recipes...'
            : visible.length +
              ' ' +
              (p.mode === 'Saved' ? 'saved recipes' : 'recipes')}
        </Text>
        <View style={s.summaryActions}>
          {filtered && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear filters"
              hitSlop={6}
              onPress={clear}
              style={s.smallAction}
            >
              <Text style={s.actionText}>Reset</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh recipes"
            hitSlop={6}
            disabled={p.loading}
            onPress={() => void p.onReload()}
            style={s.smallAction}
          >
            <Text style={s.actionText}>↻ Refresh</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
  const renderRecipe = ({ recipe, reasons }: RankedRecipe) => (
    <View
      key={recipe.id}
      style={[s.card, { borderColor: mealColor(recipe.category).background }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${recipe.title}`}
        onPress={() => p.onOpen(recipe)}
        style={{ gap: 14 }}
      >
        <RecipeArtwork key={recipe.id} recipe={recipe} />
        <Text style={s.title}>{recipe.title}</Text>
      </Pressable>
      <Text
        style={[
          s.recipeFacts,
          { color: mealColor(recipe.category).foreground },
        ]}
      >
        {recipe.minutes === null ? 'Time unknown' : `${recipe.minutes} min`} |{' '}
        {recipe.category || recipe.cuisine} |{' '}
        {recipe.incomplete
          ? 'Draft'
          : recipe.difficulty || 'Difficulty unknown'}
      </Text>
      {recipe.personal_modifications.some(
        (change) => change.kind === 'personal_recipe_completion_v1',
      ) && (
        <Text style={s.meta}>
          AI-drafted details | time estimated | not kitchen-tested
        </Text>
      )}
      <Text numberOfLines={3} style={s.description}>
        {recipe.description}
      </Text>
      {p.mode === 'Discover' && (
        <Text style={s.meta}>{reasons.join(' | ')}</Text>
      )}
      {p.mode === 'Saved' && (
        <Text style={s.meta}>
          {p.collections.find(
            (c) =>
              c.id ===
              p.records.find((x) => x.recipe_id === recipe.id)?.collection_id,
          )?.name || 'No collection'}{' '}
          |{' '}
          {p.records.find((x) => x.recipe_id === recipe.id)?.planned_week ||
            'No week selected'}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        style={s.primary}
        onPress={() => p.onOpen(recipe)}
      >
        <Text style={s.white}>View recipe</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {p.planningWeek && p.onAddToWeek && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add to week: ${recipe.title}`}
            disabled={
              p.busy ||
              p.records.some(
                (record) =>
                  record.recipe_id === recipe.id &&
                  record.planned_week === p.planningWeek,
              )
            }
            style={s.control}
            onPress={() => void p.onAddToWeek!(recipe)}
          >
            <Text>
              {p.records.some(
                (record) =>
                  record.recipe_id === recipe.id &&
                  record.planned_week === p.planningWeek,
              )
                ? 'Added to week'
                : p.records.some(
                      (record) =>
                        record.recipe_id === recipe.id && record.planned_week,
                    )
                  ? 'Move pick to this week'
                  : 'Add to Week'}
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${p.saved.includes(recipe.id) ? 'Remove saved recipe' : 'Save recipe'}: ${recipe.title}`}
          accessibilityState={{
            selected: p.saved.includes(recipe.id),
            disabled: p.busy,
          }}
          disabled={p.busy}
          onPress={() => void p.onSave(recipe)}
          style={s.control}
        >
          <Text>
            {p.busy
              ? 'Please wait...'
              : !p.signedIn && !p.demo
                ? 'Sign in to save'
                : p.saved.includes(recipe.id)
                  ? 'Remove'
                  : 'Save recipe'}
          </Text>
        </Pressable>
        {(p.signedIn || p.demo) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Organize recipe: ${recipe.title}`}
            style={s.control}
            onPress={() => p.onManage(recipe)}
          >
            <Text>Edit / organize</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      {p.showChat !== false && p.chatOpen ? (
        <View style={s.card}>
          <RecipeAssistant
            preferences={p.preferences}
            recipes={ranked.map((r) => r.recipe)}
            signedIn={p.signedIn}
            demo={p.demo}
          />
          {p.planningWeek && (
            <Pressable
              accessibilityRole="button"
              style={s.control}
              onPress={p.onReturnToWeek}
            >
              <Text>Return to weekly planning</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            style={s.control}
            onPress={() => p.onChatChange?.(false)}
          >
            <Text>Choose a recipe from Discover</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          testID="recipe-list"
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          data={rows}
          key={p.wide ? 'wide' : 'phone'}
          ListHeaderComponent={header}
          refreshing={p.loading}
          onRefresh={() => void p.onReload()}
          keyExtractor={(r) => r.key}
          ListEmptyComponent={
            <View style={s.empty}>
              {p.loading ? (
                <ActivityIndicator accessibilityLabel="Loading recipes" />
              ) : (
                <>
                  <Text>
                    {p.mode === 'Saved' && !p.saved.length
                      ? 'No recipes saved to this account yet. Open Discover and choose Save recipe.'
                      : filtered
                        ? 'No matching recipes. Clear filters to see the full list.'
                        : p.mode === 'Saved'
                          ? 'Some saved recipe details could not be loaded. Refresh to retry.'
                          : 'No recipes match your profile. Review your equipment and dietary settings, or refresh.'}
                  </Text>
                  {filtered && (
                    <Pressable
                      accessibilityRole="button"
                      style={s.control}
                      onPress={clear}
                    >
                      <Text>Show all recipes</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          }
          renderItem={({ item }) =>
            item.recipes ? (
              <View style={{ flexDirection: 'row', gap: 16 }}>
                {item.recipes.map(renderRecipe)}
                {p.wide && item.recipes.length === 1 && (
                  <View style={{ flex: 1 }} />
                )}
              </View>
            ) : (
              <View
                style={[
                  s.sectionHeading,
                  {
                    borderLeftWidth: 4,
                    borderLeftColor: mealColor(item.category).foreground,
                    paddingLeft: 12,
                  },
                ]}
              >
                <Text
                  accessibilityRole="header"
                  style={[
                    s.sectionTitle,
                    { color: mealColor(item.category).foreground },
                  ]}
                >
                  {item.heading}
                </Text>
                <Text style={s.resultCount}>{item.count}</Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  mealFilters: { flexDirection: 'row', gap: 4, paddingVertical: 4 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    gap: 12,
  },
  sectionTitle: {
    fontFamily: 'Nunito',
    fontSize: 24,
    fontWeight: '800',
    color: theme.ink,
  },
  intro: { fontSize: 15, lineHeight: 22, color: theme.muted, marginBottom: 8 },
  recipeFacts: {
    color: theme.olive,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  description: { color: theme.muted, fontSize: 14, lineHeight: 21 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E5E5',
    borderRadius: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 15,
    color: '#25292B',
  },
  clearSearch: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cross: { fontSize: 20, color: '#647C8A', lineHeight: 24 },
  filterButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#EBEEEE',
    borderWidth: 1,
    borderColor: '#E0E5E5',
  },
  filterButtonActive: { backgroundColor: '#DDE6E8', borderColor: '#B6C6CB' },
  filterGlyph: { alignItems: 'center', gap: 4 },
  filterLine: { height: 1.5, backgroundColor: '#445B66', borderRadius: 2 },
  filterBadge: {
    position: 'absolute',
    right: -3,
    top: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: '#445B66',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: { fontSize: 10, fontWeight: '600', color: '#FFFFFF' },
  chipRow: {
    gap: 8,
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 1,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    minHeight: 36,
    borderRadius: 16,
    backgroundColor: '#E7EDEE',
  },
  chipText: { fontSize: 13, color: '#344B56' },
  chipClose: { fontSize: 16, lineHeight: 18, color: '#647C8A' },
  filterPanel: {
    gap: 8,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E9E9',
    borderRadius: 12,
    marginTop: 3,
  },
  panelHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelTitle: { fontSize: 13, fontWeight: '600', color: '#505E64' },
  filterChip: {
    paddingHorizontal: 11,
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#F3F5F4',
  },
  fieldRow: { flexDirection: 'row', gap: 8 },
  halfField: { flex: 1, minWidth: 0 },
  filterInput: {
    minHeight: 44,
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 14,
    color: '#25292B',
    backgroundColor: '#F6F7F5',
    borderRadius: 8,
  },
  filterHint: { fontSize: 12, lineHeight: 17, color: '#58686E' },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  summaryActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  resultCount: { fontSize: 12, color: '#647279' },
  smallAction: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  actionText: { fontSize: 12, color: '#526C79' },

  list: { paddingBottom: 24, gap: 16 },
  header: { gap: 10, paddingBottom: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  control: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 10,
    justifyContent: 'center',
  },
  selected: { backgroundColor: theme.accent },
  primary: {
    padding: 14,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: theme.olive,
    alignItems: 'center',
  },
  white: { color: '#fff' },
  card: {
    flex: 1,
    padding: 16,
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E9E9',
    borderRadius: 24,
  },
  title: { fontSize: 21, lineHeight: 27, fontWeight: '700', color: '#25292B' },
  meta: { fontSize: 13, lineHeight: 19, color: '#50585B' },
  empty: { padding: 16, gap: 12 },
});
