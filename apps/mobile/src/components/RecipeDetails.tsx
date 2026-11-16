import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import {
  scaleRecipe,
  formatKitchenQuantity,
  type Recipe,
} from '@meal/contracts';
import { Suggestions } from './ProfileFields';
import { CookingMode } from './CookingMode';
import { api, preview } from '../lib/api';

function uid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });
}
const button = {
  padding: 14,
  minHeight: 48,
  borderWidth: 1,
  borderColor: '#647C8A',
  borderRadius: 8,
  marginVertical: 5,
} as const;
export function RecipeDetails({
  recipe,
  canEdit,
  userId,
  onChanged,
  rating,
  cookedAt,
  weekStartDay,
  timeZone,
}: {
  recipe: Recipe;
  canEdit: boolean;
  userId: string | null;
  onChanged: () => Promise<void>;
  rating?: number;
  cookedAt?: string;
  weekStartDay: 'Monday' | 'Sunday';
  timeZone: string;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const [portions, setPortions] = useState(recipe.servings || 2),
    [editing, setEditing] = useState(false),
    [title, setTitle] = useState(recipe.title),
    [description, setDescription] = useState(recipe.description),
    [ingredients, setIngredients] = useState(
      recipe.ingredients.map((i) => i.raw).join('\n'),
    ),
    [instructions, setInstructions] = useState(recipe.instructions.join('\n')),
    [note, setNote] = useState(''),
    [collection, setCollection] = useState(''),
    [collectionList, setCollectionList] = useState<
      { id: string; name: string }[]
    >([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    setPortions(recipe.servings || 2);
    setEditing(false);
    setTitle(recipe.title);
    setDescription(recipe.description);
    setIngredients(recipe.ingredients.map((i) => i.raw).join('\n'));
    setInstructions(recipe.instructions.join('\n'));
    setNote('');
    setMessage('');
  }, [recipe.id, recipe.revision]);
  useEffect(() => {
    if (canEdit && !preview)
      api('/collections')
        .then((r) => setCollectionList(r.items))
        .catch(() =>
          setMessage('Collections could not be loaded. Please refresh.'),
        );
  }, [canEdit, recipe.id]);
  const scaled = scaleRecipe(recipe, portions);
  async function organize(
    collectionId: string | null | undefined,
    plannedWeek: string | null | undefined,
  ) {
    setBusy(true);
    try {
      const records = await api('/saved');
      const saved = records.items.find(
        (i: { recipe_id: string }) => i.recipe_id === recipe.id,
      );
      if (!saved) throw new Error('Save this recipe before organizing it.');
      await api(`/saved/${recipe.id}/organization`, 'PUT', {
        revision: saved.revision,
        collectionId:
          collectionId === undefined ? saved.collection_id : collectionId,
        plannedWeek:
          plannedWeek === undefined ? saved.planned_week : plannedWeek,
      });
      await onChanged();
      setMessage('Recipe organization saved.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to organize.');
    } finally {
      setBusy(false);
    }
  }
  async function createCollection() {
    setBusy(true);
    try {
      const id = uid();
      await api(`/collections/${id}`, 'PUT', { name: collection });
      setCollectionList((current) => [...current, { id, name: collection }]);
      setCollection('');
      setMessage(
        'Collection created. Choose it below to organize this recipe.',
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Unable to create collection.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveCopy() {
    setBusy(true);
    try {
      const own = recipe.owner_id === userId;
      const parsed = ingredients
        .split('\n')
        .filter((s) => s.trim())
        .map(
          (raw) =>
            recipe.ingredients.find((i) => i.raw === raw) || {
              raw,
              name: raw,
              quantity: null,
              unit: null,
              notes: 'Manually edited; quantity and unit need review.',
            },
        );
      await api(`/personal-recipes/${own ? recipe.id : uid()}`, 'PUT', {
        revision: own ? recipe.revision : 0,
        ...(own ? {} : { sourceId: recipe.id }),
        title,
        description,
        ingredients: parsed,
        instructions: instructions.split('\n').filter((s) => s.trim()),
        note,
      });
      setEditing(false);
      setMessage('Your private recipe copy is saved. Find it in Saved.');
      await onChanged();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Your copy could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }
  function weekAfter(days: number) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(new Date());
    const number = (name: string) =>
      Number(parts.find((p) => p.type === name)?.value);
    const now = new Date(
      Date.UTC(number('year'), number('month') - 1, number('day')),
    );
    now.setUTCDate(
      now.getUTCDate() -
        ((now.getUTCDay() + (weekStartDay === 'Monday' ? 6 : 0)) % 7) +
        days,
    );
    return now.toISOString().slice(0, 10);
  }
  return (
    <View style={{ gap: 8 }}>
      <CookingMode key={recipe.id} recipe={recipe} portions={portions} />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showInfo }}
        style={button}
        onPress={() => setShowInfo((v) => !v)}
      >
        <Text>
          {showInfo
            ? 'Hide recipe information'
            : 'Recipe information, source and nutrition'}
        </Text>
      </Pressable>
      {showInfo && (
        <View style={{ gap: 10 }}>
          <Text>
            Confidence: {recipe.extraction_confidence}.{' '}
            {recipe.incomplete
              ? 'Incomplete draft: review before planning or cooking.'
              : ''}
          </Text>
          <Text>
            {rating ? `Your rating: ${rating}/5` : 'Not rated'} |{' '}
            {cookedAt
              ? `Last cooked: ${cookedAt.slice(0, 10)}`
              : 'No cooking history'}
          </Text>
          <Text>
            {recipe.equipment_known
              ? `Equipment: ${recipe.equipment.join(', ') || 'No cooking equipment'}`
              : 'Equipment unknown'}{' '}
            | {recipe.difficulty || 'Difficulty unknown'}
          </Text>
          <Text>
            Source: {recipe.provenance.source}
            {recipe.creator ? ` | ${recipe.creator}` : ''}
          </Text>
          {recipe.provenance.url &&
            /^https?:\/\//.test(recipe.provenance.url) && (
              <Pressable
                style={button}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(recipe.provenance.url!)}
              >
                <Text>Open original source</Text>
              </Pressable>
            )}
          <Text>{recipe.provenance.permission}</Text>
          <Text>
            {recipe.nutrition
              ? `${recipe.nutrition.summary} (${recipe.nutrition.method}; ${recipe.nutrition.source})`
              : 'Nutrition not supplied.'}
          </Text>
          <Text>
            {recipe.estimated_additional_cost_cents !== null &&
            recipe.cost_source
              ? `Additional groceries estimate: $${(recipe.estimated_additional_cost_cents / 100).toFixed(2)} (${recipe.cost_source})`
              : 'Additional grocery cost unknown; excluded from cost-limited results.'}
          </Text>
          {recipe.dietary_tags.length > 0 && (
            <Text>
              Ingredient-based dietary tags: {recipe.dietary_tags.join(', ')}.
              Generated recipes and product labels need review.
            </Text>
          )}
          {recipe.personal_modifications.length > 0 && (
            <View>
              <Text>
                Personal changes (separate from original attribution):
              </Text>
              {recipe.personal_modifications.map((m, i) => (
                <Text key={i}>
                  {String(m.method || 'Unknown method')}:{' '}
                  {String(m.note || 'No note')}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
      <Text style={{ fontSize: 20 }}>Portions</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Pressable
          accessibilityLabel="Fewer portions"
          style={button}
          disabled={portions <= 1 || recipe.servings === null}
          onPress={() => setPortions((n) => n - 1)}
        >
          <Text>-</Text>
        </Pressable>
        <Text>{recipe.servings === null ? 'Unknown' : portions}</Text>
        <Pressable
          accessibilityLabel="More portions"
          style={button}
          disabled={portions >= 24 || recipe.servings === null}
          onPress={() => setPortions((n) => n + 1)}
        >
          <Text>+</Text>
        </Pressable>
      </View>
      <Text>{scaled.warning}</Text>
      <Text style={{ fontSize: 20 }}>Ingredients</Text>
      {scaled.ingredients.map((i, n) => (
        <Text key={n}>
          {i.quantity === null || portions === recipe.servings
            ? i.raw
            : `${formatKitchenQuantity(i.quantity)} ${i.unit || ''} ${i.name}`}
          {i.notes ? ` - ${i.notes}` : ''}
          {i.quantity === null ? ' (quantity unknown)' : ''} [{i.confidence}]
        </Text>
      ))}
      <Text style={{ fontSize: 20 }}>Instructions</Text>
      {recipe.instructions.map((instruction, i) => (
        <Text key={i}>
          {i + 1}. {instruction}
        </Text>
      ))}
      {canEdit && !preview && (
        <>
          <Text style={{ fontSize: 20 }}>Your library</Text>
          <TextInput
            accessibilityLabel="New collection name"
            placeholder="New collection"
            value={collection}
            onChangeText={setCollection}
            style={button}
            maxLength={80}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy || !collection.trim()}
            style={button}
            onPress={() => void createCollection()}
          >
            <Text>Create collection</Text>
          </Pressable>
          {collectionList.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              disabled={busy}
              style={button}
              onPress={() => void organize(c.id, undefined)}
            >
              <Text>Put in {c.name}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={button}
            onPress={() => void organize(null, undefined)}
          >
            <Text>Remove from collection</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={button}
            onPress={() => void organize(undefined, null)}
          >
            <Text>Clear selected week</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={button}
            onPress={() => void organize(undefined, weekAfter(7))}
          >
            <Text>Mark for next week</Text>
          </Pressable>
          <Suggestions
            label="Recipe week"
            values={[]}
            options={[0, 7, 14, 21, 28].map(weekAfter)}
            disabled={busy}
            emptyLabel="Choose a week"
            onChange={([value]) => void organize(undefined, value)}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={button}
            onPress={() => setEditing((s) => !s)}
          >
            <Text>
              {recipe.owner_id === userId
                ? '✎ Edit your private recipe'
                : '✎ Create an editable private copy'}
            </Text>
          </Pressable>
          {editing && (
            <View>
              <Text>
                Source attribution stays unchanged. Changed ingredient lines
                keep unknown quantities until reviewed.
              </Text>
              <TextInput
                accessibilityLabel="Recipe title"
                value={title}
                onChangeText={setTitle}
                style={button}
              />
              <TextInput
                accessibilityLabel="Recipe description"
                multiline
                value={description}
                onChangeText={setDescription}
                style={button}
              />
              <TextInput
                accessibilityLabel="Ingredients, one per line"
                multiline
                value={ingredients}
                onChangeText={setIngredients}
                style={button}
              />
              <TextInput
                accessibilityLabel="Instructions, one step per line"
                multiline
                value={instructions}
                onChangeText={setInstructions}
                style={button}
              />
              <TextInput
                accessibilityLabel="Personal change note"
                value={note}
                onChangeText={setNote}
                style={button}
                placeholder="Describe your changes"
              />
              <Pressable
                accessibilityRole="button"
                disabled={busy || !note.trim()}
                style={button}
                onPress={() => void saveCopy()}
              >
                <Text>Save private recipe</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
      {!!message && <Text accessibilityRole="alert">{message}</Text>}
    </View>
  );
}
