import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  discoverRecipes,
  generateWeek,
  plusDays,
  validateDraftWeek,
  reviewGroceryProjection,
  wasCookedRecently,
  type DraftSlot,
  type Preferences,
  type Recipe,
  type DiscoveryContext,
} from '@meal/contracts';
import { api as accountApi } from '../lib/api';
import {
  groceryId,
  type GroceryPlan,
  type GroceryApi,
} from '../lib/weekly-groceries';
import {
  groceryPreview,
  loadPlanningWeek,
  recipeForSlot,
  repairPlanningGroceries,
  savePlanningWeek,
  type LoadedPlanningWeek,
} from '../lib/planning-workflow';
import { theme } from '../theme';

const button = {
  minHeight: 44,
  padding: 12,
  borderWidth: 1,
  borderColor: theme.line,
  borderRadius: 12,
  justifyContent: 'center' as const,
};
export function WeeklyPlanner({
  week,
  preferences,
  recipes,
  context,
  preferredRecipeIds,
  onOpen,
  onSaved,
  owner,
}: {
  week: string;
  preferences: Preferences;
  recipes: Recipe[];
  context: DiscoveryContext;
  preferredRecipeIds: string[];
  onOpen: (recipe: Recipe) => void;
  onSaved: (plan: GroceryPlan) => void;
  owner: string;
}) {
  const api = useMemo<GroceryApi>(
    () => (path, method, body, key) =>
      accountApi(path, method, body, key, owner),
    [owner],
  );
  const [loaded, setLoaded] = useState<LoadedPlanningWeek | null>(null);
  const [slots, setSlots] = useState<DraftSlot[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [fullAmounts, setFullAmounts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [repair, setRepair] = useState<GroceryPlan | null>(null);
  const rotation = useRef(0),
    working = useRef(false);
  const operation = useRef({
    fingerprint: '',
    key: groceryId(),
    planId: groceryId(),
  });
  const preview = useMemo(() => {
    if (!loaded) return null;
    try {
      return groceryPreview(slots, loaded, recipes, reviewed);
    } catch {
      return null;
    }
  }, [slots, loaded, recipes, reviewed]);
  const groceryReview = useMemo(
    () =>
      preview && loaded
        ? reviewGroceryProjection(preview.items, loaded.storedGroceries)
        : null,
    [preview, loaded],
  );
  async function generate(regenerate = false) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setMessage('Loading your week and kitchen...');
    try {
      const current =
        regenerate && loaded ? loaded : await loadPlanningWeek(api, week, true);
      if (current.plan?.groceryState === 'needs_review') {
        setRepair(current.plan);
        throw new Error(
          'Repair this week’s groceries before making another plan.',
        );
      }
      const snapshots = [...current.snapshots.values()];
      const available = [
        ...recipes,
        ...snapshots.filter(
          (snapshot) => !recipes.some((r) => r.id === snapshot.id),
        ),
      ];
      const result = generateWeek({
        week,
        preferences,
        recipes: available,
        context,
        existing: regenerate ? slots : current.slots,
        preferredRecipeIds,
        id: groceryId,
        rotation: rotation.current++,
      });
      setLoaded(current);
      setSlots(result.slots);
      setWarnings(result.warnings);
      setReviewed(false);
      setFullAmounts(false);
      setMessage('Preview only. Review meals and your kitchen before saving.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to make a plan.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function change(next: DraftSlot[]) {
    try {
      validateDraftWeek(week, next, preferences.people);
      setSlots(next);
      setReviewed(false);
      setMessage('Plan preview updated. Save to apply it.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to edit this meal.');
    }
  }
  function remove(slot: DraftSlot, kind?: 'eating_out' | 'unplanned') {
    if (
      slot.locked ||
      slots.some((s) => s.preparedSlotId === slot.id && s.locked)
    ) {
      setMessage('This meal or one of its leftovers is locked.');
      return;
    }
    const remaining = slots.filter(
      (s) => s.id !== slot.id && s.preparedSlotId !== slot.id,
    );
    change(
      kind
        ? [
            ...remaining,
            {
              ...slot,
              kind,
              recipeId: null,
              preparedSlotId: null,
              servings: null,
            },
          ]
        : remaining,
    );
  }
  function move(slot: DraftSlot, days: number) {
    if (
      slot.locked ||
      slots.some((s) => s.preparedSlotId === slot.id && s.locked)
    )
      return;
    change(
      slots.map((s) =>
        s.id === slot.id || s.preparedSlotId === slot.id
          ? { ...s, day: plusDays(s.day, days) }
          : s,
      ),
    );
  }
  function swap(slot: DraftSlot) {
    const candidates = discoverRecipes(recipes, preferences, context, {
      meal: slot.meal,
    }).filter(
      (c) => c.recipe.servings !== null && c.recipe.instructions.length,
    );
    const index = candidates.findIndex((c) => c.recipe.id === slot.recipeId);
    const selected = candidates[(index + 1) % candidates.length]?.recipe;
    if (!selected) {
      setMessage('No suitable alternative is available with your preferences.');
      return;
    }
    change(
      slots.map((s) =>
        s.id === slot.id ? { ...s, recipeId: selected.id } : s,
      ),
    );
    const overlap = selected.ingredients.filter((i) =>
      slots.some(
        (s) =>
          s.id !== slot.id &&
          recipes
            .find((r) => r.id === s.recipeId)
            ?.ingredients.some(
              (other) => other.name.toLowerCase() === i.name.toLowerCase(),
            ),
      ),
    ).length;
    setMessage(
      `Swapped to ${selected.title}. ${overlap} ingredients overlap with other planned meals.${wasCookedRecently(context.cooked[selected.id], slot.day, preferences.recentRecipeDays) ? ' This explicit swap selects a recently cooked recipe.' : ''} Save to apply.`,
    );
  }
  function add(meal: DraftSlot['meal']) {
    const recipe = discoverRecipes(recipes, preferences, context, {
      meal,
    }).find(
      (c) => c.recipe.servings !== null && c.recipe.instructions.length,
    )?.recipe;
    const day = Array.from({ length: 7 }, (_, index) =>
      plusDays(week, index),
    ).find(
      (date) =>
        !slots.some(
          (s) =>
            s.day === date &&
            s.meal === meal &&
            (s.kind !== 'unplanned' || s.locked),
        ),
    );
    if (!recipe || !day) {
      setMessage('No suitable recipe or available slot remains for this meal.');
      return;
    }
    const openSlot = slots.find((s) => s.day === day && s.meal === meal);
    change([
      ...slots.filter((s) => s.id !== openSlot?.id),
      {
        id: openSlot?.id || groceryId(),
        day,
        meal,
        kind: 'cook',
        recipeId: recipe.id,
        preparedSlotId: null,
        servings: preferences.people,
        locked: false,
      },
    ]);
  }
  async function save() {
    if (!loaded || working.current || !preview) return;
    if (preview.questions.length && !fullAmounts) {
      setMessage(
        'Choose how to handle pantry items with unknown amounts before saving.',
      );
      return;
    }
    working.current = true;
    setBusy(true);
    setMessage('Saving meals and updating groceries...');
    const fingerprint = JSON.stringify({
      slots,
      reviewed,
      revision: loaded.plan?.revision,
      groceryRevision: loaded.plan?.groceries.revision,
    });
    if (operation.current.fingerprint !== fingerprint)
      operation.current = {
        ...operation.current,
        fingerprint,
        key: groceryId(),
      };
    try {
      const saved = await savePlanningWeek({
        api,
        week,
        planId: operation.current.planId,
        operationId: operation.current.key,
        preferences,
        loaded,
        slots,
        recipes,
        reviewed,
      });
      onSaved(saved);
      if (saved.groceryState === 'needs_review') {
        setRepair(saved);
        setMessage('Meals saved. Groceries need repair before shopping.');
      } else {
        setLoaded(null);
        setSlots([]);
        setMessage(
          'Week and groceries saved. Manual purchases and existing grocery overrides are kept.',
        );
      }
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : 'Unable to save. Your preview has been kept.',
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function repairGroceries() {
    if (!repair || working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const result = await repairPlanningGroceries(api, repair, groceryId());
      setRepair(result.groceryState === 'needs_review' ? result : null);
      onSaved(result);
      setLoaded(null);
      setMessage(
        result.groceryState === 'ready'
          ? 'Groceries repaired. Your week is ready.'
          : 'Groceries still need review. Refresh and retry.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Repair failed.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <View
      style={{
        padding: 18,
        gap: 12,
        borderRadius: 18,
        backgroundColor: theme.paper,
        borderWidth: 1,
        borderColor: theme.line,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: 21, fontWeight: '700', color: theme.ink }}
      >
        Plan your week
      </Text>
      <Text style={{ color: theme.muted }}>
        Automatic suggestions avoid recorded dishes from the previous{' '}
        {preferences.recentRecipeDays} days when suitable alternatives exist.
        Your week picks and explicit swaps can include repeats.
      </Text>
      <Text style={{ color: theme.muted, lineHeight: 21 }}>
        Start with {preferences.cookingSessions} dinners, {preferences.portions}{' '}
        prepared portions each, and next-day leftovers. Your preferences guide
        the suggestions.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        style={button}
        onPress={() => void generate(!!loaded)}
      >
        <Text>
          {loaded ? 'Regenerate unlocked meals' : 'Preview weekly plan'}
        </Text>
      </Pressable>
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: theme.ink, lineHeight: 21 }}
        >
          {message}
        </Text>
      )}
      {warnings.map((warning) => (
        <Text key={warning} style={{ color: theme.muted }}>
          {warning}
        </Text>
      ))}
      {repair && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={button}
          onPress={() => void repairGroceries()}
        >
          <Text>Repair weekly groceries</Text>
        </Pressable>
      )}
      {loaded && (
        <>
          <Text style={{ fontWeight: '600' }}>
            {slots.filter((s) => s.kind === 'cook').length} cooking sessions ·{' '}
            {slots
              .filter((s) => s.kind === 'cook')
              .reduce((sum, s) => sum + (s.servings || 0), 0)}{' '}
            prepared portions ·{' '}
            {slots.filter((s) => s.kind === 'leftover').length} leftover meals
          </Text>
          {slots.map((slot) => {
            const source =
              slot.kind === 'leftover'
                ? slots.find((s) => s.id === slot.preparedSlotId)
                : slot;
            const recipe = source
              ? recipeForSlot(source, loaded, recipes)
              : undefined;
            return (
              <View
                key={slot.id}
                style={{
                  gap: 8,
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: theme.sage,
                }}
              >
                <Text style={{ fontWeight: '600' }}>
                  {slot.day} · {slot.meal} · {slot.kind.replace('_', ' ')}
                  {slot.locked ? ' · Locked' : ''}
                </Text>
                {recipe && (
                  <Pressable
                    accessibilityRole="button"
                    style={button}
                    onPress={() => onOpen(recipe)}
                  >
                    <Text>{recipe.title}</Text>
                  </Pressable>
                )}
                {slot.kind === 'leftover' && (
                  <Text>From {source?.day}. No additional groceries.</Text>
                )}
                {slot.kind === 'cook' && (
                  <TextInput
                    accessibilityLabel={`Prepared portions for ${slot.day} ${slot.meal}`}
                    value={String(slot.servings || '')}
                    editable={!busy && !slot.locked}
                    keyboardType="decimal-pad"
                    onChangeText={(text) => {
                      const portions = Number(text);
                      if (
                        Number.isFinite(portions) &&
                        portions > 0 &&
                        portions <= 24
                      )
                        change(
                          slots.map((s) =>
                            s.id === slot.id ? { ...s, servings: portions } : s,
                          ),
                        );
                    }}
                    style={{ ...button, color: theme.ink }}
                  />
                )}
                {!slot.locked && (
                  <View
                    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
                  >
                    {slot.kind === 'cook' && (
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        style={button}
                        accessibilityLabel={`Swap ${slot.day} ${slot.meal}`}
                        onPress={() => swap(slot)}
                      >
                        <Text>Swap</Text>
                      </Pressable>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      style={button}
                      accessibilityLabel={`Move ${slot.day} ${slot.meal} earlier`}
                      onPress={() => move(slot, -1)}
                    >
                      <Text>Earlier</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      style={button}
                      accessibilityLabel={`Move ${slot.day} ${slot.meal} later`}
                      onPress={() => move(slot, 1)}
                    >
                      <Text>Later</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      style={button}
                      accessibilityLabel={`Remove ${slot.day} ${slot.meal}`}
                      onPress={() => remove(slot)}
                    >
                      <Text>Remove</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      style={button}
                      accessibilityLabel={`Eating out ${slot.day} ${slot.meal}`}
                      onPress={() => remove(slot, 'eating_out')}
                    >
                      <Text>Eating out</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      style={button}
                      accessibilityLabel={`Leave unplanned ${slot.day} ${slot.meal}`}
                      onPress={() => remove(slot, 'unplanned')}
                    >
                      <Text>Leave unplanned</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['breakfast', 'lunch', 'dinner'] as const).map((meal) => (
              <Pressable
                key={meal}
                accessibilityRole="button"
                disabled={busy}
                style={button}
                onPress={() => add(meal)}
              >
                <Text>Add {meal}</Text>
              </Pressable>
            ))}
          </View>
          <Text
            accessibilityRole="header"
            style={{ fontSize: 18, fontWeight: '600' }}
          >
            Kitchen check and groceries
          </Text>
          <Text style={{ color: theme.muted }}>
            Check the recipe amounts before combining quantities. Unconfirmed
            amounts stay as separate original ingredient lines. Review checkout
            estimates in Groceries; missing prices and package sizes stay
            flagged.
          </Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: reviewed }}
            aria-checked={reviewed}
            disabled={busy}
            style={button}
            onPress={() => setReviewed(!reviewed)}
          >
            <Text>
              {reviewed ? '✓ ' : '□ '}I reviewed the ingredient quantities in
              these recipes
            </Text>
          </Pressable>
          {!!preview?.questions.length && (
            <>
              <Text>
                Unknown kitchen amounts:{' '}
                {preview.questions.map((q) => q.name).join(', ')}.
              </Text>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: fullAmounts }}
                aria-checked={fullAmounts}
                disabled={busy}
                style={button}
                onPress={() => setFullAmounts(!fullAmounts)}
              >
                <Text>
                  {fullAmounts ? '✓ ' : '□ '}Include full recipe amounts for
                  these items; I will adjust the shopping list
                </Text>
              </Pressable>
            </>
          )}
          {groceryReview?.rows.map(({ item, previous, status }) => (
            <View key={item.originKey} style={{ gap: 4, paddingVertical: 3 }}>
              <Text
                style={{
                  color: theme.ink,
                  fontWeight:
                    reviewed && status === 'quantity_changed' ? '700' : '400',
                }}
              >
                {reviewed && status === 'kept_deletion'
                  ? `Still removed: ${item.rawText}`
                  : reviewed && status === 'kept_override'
                    ? `Your override stays: ${previous!.raw_text}`
                    : item.rawText}
                {item.quantity === null ? ' · Total needs review' : ''}
              </Text>
              {reviewed && status === 'quantity_changed' && (
                <Text style={{ color: theme.olive, fontWeight: '600' }}>
                  Changed quantity or unit. Previously: {previous!.raw_text}.
                  {previous!.checked ? ' The checkmark will reset.' : ''}
                </Text>
              )}
              {reviewed && status === 'kept_override' && (
                <Text style={{ color: theme.muted }}>
                  Recipe calculation: {item.rawText}. Your shopping edit is
                  kept.
                </Text>
              )}
              {reviewed && status === 'new' && (
                <Text style={{ color: theme.muted }}>
                  New recipe requirement.
                </Text>
              )}
              {reviewed && status === 'unchanged' && previous?.checked && (
                <Text style={{ color: theme.muted }}>
                  Already checked; checkmark stays.
                </Text>
              )}
            </View>
          ))}
          {reviewed &&
            groceryReview?.removed.map((item, index) => (
              <Text
                key={`removed:${item.origin_key || index}`}
                style={{ color: theme.muted }}
              >
                No longer required: {item.raw_text}.
              </Text>
            ))}
          {reviewed && !!groceryReview?.kept.length && (
            <Text style={{ color: theme.muted }}>
              Existing purchases kept:{' '}
              {groceryReview.kept.map((item) => item.name).join(', ')}.
            </Text>
          )}
          {!!preview?.warnings.length && (
            <Text style={{ color: theme.muted }}>
              {preview.warnings.length} ingredient amounts need review. No
              quantities were guessed.
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={busy || !preview}
            style={{ ...button, backgroundColor: theme.olive }}
            onPress={() => void save()}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>
              Save week and groceries
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={button}
            onPress={() => {
              setLoaded(null);
              setSlots([]);
              setMessage('Preview discarded.');
            }}
          >
            <Text>Discard preview</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
