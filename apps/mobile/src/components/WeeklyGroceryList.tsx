import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, preview } from '../lib/api';
import { getGroceryEngine } from '../lib/grocery-engine';
import {
  isWater,
  shoppingCount,
  shoppingName,
  shoppingQuantity,
} from '../lib/shopping-quantities';
import { localStore } from '../lib/local-store';
import {
  type GrocerySnapshot,
  type GroceryChanges,
} from '../lib/offline-groceries';
import { theme } from '../theme';
import {
  compareGroceries,
  grocerySection,
  grocerySections,
} from '../lib/grocery-sections';
import { Suggestions } from './ProfileFields';
const automaticSection = 'Automatic (suggested section)';
export function WeeklyGroceryList({
  week,
  owner,
  onSynced,
}: {
  week: string;
  owner: string;
  onSynced?: () => void;
}) {
  const engine = useMemo(() => getGroceryEngine(owner, week), [owner, week]);
  const [snapshot, setSnapshot] = useState<GrocerySnapshot>({
    plan: null,
    items: [],
    pending: 0,
    conflicts: [],
    refreshedAt: null,
  });
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editUnit, setEditUnit] = useState('each');
  const [detailsAvailable, setDetailsAvailable] = useState(preview);
  const [detailsEditing, setDetailsEditing] = useState<string | null>(null),
    [sectionText, setSectionText] = useState(''),
    [notesText, setNotesText] = useState('');
  useEffect(() => {
    let active = true;
    if (preview) return;
    const key = `meal-grocery-details-cap-v1:${owner}`;
    void (async () => {
      try {
        if ((await localStore.getItem(key)) === 'true' && active)
          setDetailsAvailable(true);
      } catch {
        /* Online availability can still be checked. */
      }
      try {
        const status = z
          .object({ available: z.boolean() })
          .parse(
            await api(
              '/grocery-details-status',
              'GET',
              undefined,
              undefined,
              owner,
            ),
          );
        if (active) setDetailsAvailable(status.available);
        await localStore.setItem(key, String(status.available));
      } catch {
        /* Keep the last confirmed capability while disconnected. */
      }
    })();
    return () => {
      active = false;
    };
  }, [owner]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Loading saved groceries...');
  const [loaded, setLoaded] = useState(false);
  const alive = useRef(true);
  const working = useRef(false);
  const ready = useRef(false);
  function display() {
    if (alive.current) setSnapshot(engine.snapshot());
  }
  async function sync() {
    display();
    try {
      await engine.sync();
      if (alive.current) {
        onSynced?.();
        setError('');
        setStatus(
          engine.snapshot().conflicts.length
            ? 'Some edits need your decision.'
            : 'All grocery changes synced.',
        );
      }
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : 'Sync failed. Please retry.');
        setStatus(
          engine.snapshot().pending
            ? 'Changes saved on this device. Waiting to sync.'
            : 'Showing groceries saved on this device. Connection unavailable.',
        );
      }
    } finally {
      display();
    }
  }
  async function refresh() {
    if (working.current || !ready.current) return;
    working.current = true;
    setBusy(true);
    try {
      await sync();
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    working.current = true;
    setBusy(true);
    void (async () => {
      try {
        await engine.load();
        ready.current = true;
        if (alive.current) {
          setLoaded(true);
          setLoading(false);
          display();
        }
        await sync();
      } catch {
        if (alive.current)
          setError(
            'Local grocery storage could not be read. Reload before editing.',
          );
      } finally {
        working.current = false;
        if (alive.current) {
          setLoading(false);
          setBusy(false);
        }
      }
    })();
    const timer = setInterval(() => void refresh(), 30000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const online = () => void refresh();
    if (typeof window !== 'undefined')
      window.addEventListener('online', online);
    return () => {
      alive.current = false;
      clearInterval(timer);
      subscription.remove();
      if (typeof window !== 'undefined')
        window.removeEventListener('online', online);
    };
  }, [engine]);
  async function mutate(action: () => Promise<unknown>, added = false) {
    if (working.current || !ready.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      display();
      if (added && alive.current) setDraft('');
      await sync();
      return true;
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : 'Unable to save on this device.',
        );
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const items = snapshot.items
    .filter((item) => !isWater(item.name))
    .sort(compareGroceries);
  const plan = snapshot.plan;
  const needsReview = plan?.groceryState === 'needs_review';
  const disabled = busy || loading || !loaded || needsReview;
  const edit = (id: string, changes: Partial<GroceryChanges>) =>
    mutate(() => engine.edit(id, changes));
  async function saveEdit() {
    if (!editing) return;
    const quantity = Number(editQuantity || '1');
    if (
      !editName.trim() ||
      (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0))
    ) {
      setError(
        'Enter an item name and a positive quantity, or leave the quantity blank.',
      );
      return;
    }
    const unit = editUnit;
    const name = editName.trim();
    const saved = await edit(editing, {
      name,
      raw_text: [quantity, unit, name]
        .filter((value) => value !== null)
        .join(' '),
      quantity,
      unit,
    });
    if (saved) setEditing(null);
  }
  return (
    <View style={s.card}>
      <View style={s.heading}>
        <Text accessibilityRole="header" style={s.title}>
          Your list
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh grocery list"
          disabled={busy || loading}
          style={s.refresh}
          onPress={() => void refresh()}
        >
          <Text style={s.muted}>Refresh</Text>
        </Pressable>
      </View>
      <Text style={s.muted}>
        Type anything you need, from dinner ingredients to everyday essentials.
      </Text>
      {preview && (
        <Text style={s.muted}>Demo list: saved only in this browser.</Text>
      )}
      <Text accessibilityLiveRegion="polite" style={s.muted}>
        {status}
      </Text>
      {!!snapshot.pending && (
        <Text style={s.muted}>
          {snapshot.pending} pending grocery{' '}
          {snapshot.pending === 1 ? 'edit' : 'edits'}. Kept on this device until
          synced.
        </Text>
      )}
      <View style={s.entry}>
        <TextInput
          accessibilityLabel="Grocery item"
          placeholder="e.g. milk, eggs, paper towels"
          placeholderTextColor={theme.muted}
          value={draft}
          onChangeText={setDraft}
          maxLength={200}
          editable={!disabled}
          returnKeyType="done"
          blurOnSubmit={false}
          onSubmitEditing={() => {
            if (!disabled && draft.trim())
              void mutate(() => engine.add(draft), true);
          }}
          style={s.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add grocery item"
          disabled={disabled || !draft.trim()}
          style={[s.add, (disabled || !draft.trim()) && s.disabled]}
          onPress={() => void mutate(() => engine.add(draft), true)}
        >
          <Text style={s.white}>{busy ? 'Saving...' : 'Add'}</Text>
        </Pressable>
      </View>
      {loading && (
        <ActivityIndicator
          accessibilityLabel="Loading grocery list"
          color={theme.olive}
        />
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {editing && (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Edit grocery item</Text>
          <TextInput
            accessibilityLabel="Edit grocery name"
            value={editName}
            onChangeText={setEditName}
            maxLength={200}
            style={s.input}
            editable={!busy}
          />
          <Suggestions
            label="Quantity to buy"
            values={[editQuantity || '1']}
            options={Array.from({ length: 30 }, (_, i) => String(i + 1))}
            disabled={busy}
            onChange={([value]) => setEditQuantity(value)}
          />
          <Suggestions
            label="Buy as"
            values={[editUnit]}
            options={[
              'each',
              'bags',
              'boxes',
              'bottles',
              'cans',
              'jars',
              'packages',
              'bunches',
              'heads',
              'cloves',
            ]}
            disabled={busy}
            onChange={([value]) => setEditUnit(value)}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={s.refresh}
            onPress={() => void saveEdit()}
          >
            <Text>Save grocery changes</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={s.refresh}
            onPress={() => setEditing(null)}
          >
            <Text>Cancel grocery edit</Text>
          </Pressable>
        </View>
      )}
      {detailsEditing && (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Grocery notes and section</Text>
          <Text style={s.muted}>
            Choose a store section, or Automatic to use the suggested group.
          </Text>
          <Suggestions
            label="Grocery shopping section"
            values={[sectionText || automaticSection]}
            options={[automaticSection, ...grocerySections]}
            onChange={([value]) =>
              setSectionText(value === automaticSection ? '' : value)
            }
            disabled={busy}
          />
          <TextInput
            accessibilityLabel="Grocery notes"
            placeholder="e.g. unsweetened, preferred brand"
            value={notesText}
            onChangeText={setNotesText}
            maxLength={2000}
            multiline
            editable={!busy}
            style={s.input}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={s.refresh}
            onPress={async () => {
              const saved = await edit(detailsEditing, {
                section: sectionText.trim() || null,
                notes: notesText.trim() || null,
              });
              if (saved) setDetailsEditing(null);
            }}
          >
            <Text>Save grocery notes and section</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={s.refresh}
            onPress={() => setDetailsEditing(null)}
          >
            <Text>Cancel grocery notes edit</Text>
          </Pressable>
        </View>
      )}
      {snapshot.conflicts.map((conflict) => (
        <View key={conflict.id} style={s.empty}>
          <Text accessibilityRole="alert" style={s.error}>
            {conflict.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={s.refresh}
            onPress={() =>
              void mutate(() => engine.resolve(conflict.id, 'server'))
            }
          >
            <Text>Keep other device version</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={s.refresh}
            onPress={() =>
              void mutate(() => engine.resolve(conflict.id, 'device'))
            }
          >
            <Text>Keep this device version</Text>
          </Pressable>
        </View>
      ))}
      {needsReview ? (
        <Text accessibilityRole="alert" style={s.error}>
          {plan.recovery?.message ||
            'Your grocery list needs review. Refresh after it has been repaired.'}
        </Text>
      ) : (
        <>
          {!loading && loaded && !items.length && (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>A fresh list for the week.</Text>
              <Text style={s.muted}>
                Add your first item above. It will stay with this week.
              </Text>
            </View>
          )}
          {items.map((item, index) => (
            <View key={item.id}>
              {(index === 0 ||
                grocerySection(items[index - 1]) !== grocerySection(item)) && (
                <Text
                  accessibilityRole="header"
                  style={{
                    color: theme.olive,
                    fontSize: 18,
                    fontWeight: '700',
                    marginTop: 18,
                    padding: 14,
                    backgroundColor: theme.sage,
                    borderRadius: 12,
                    borderLeftWidth: 4,
                    borderLeftColor: theme.olive,
                  }}
                >
                  {grocerySection(item)}
                </Text>
              )}
              <View style={[s.item, { flexWrap: 'wrap' }]}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={item.name}
                  accessibilityState={{ checked: item.checked, disabled: busy }}
                  aria-checked={item.checked}
                  disabled={busy}
                  style={s.checkRow}
                  onPress={() => void edit(item.id, { checked: !item.checked })}
                >
                  <View style={[s.checkbox, item.checked && s.checked]}>
                    <Text style={s.white}>{item.checked ? '\u2713' : ''}</Text>
                  </View>
                  <Text style={[s.itemName, item.checked && s.struck]}>
                    {shoppingName(item.name)}
                    {'\n'}
                    <Text style={s.muted}>
                      {shoppingQuantity(item.quantity, item.unit, item.name)}
                    </Text>
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit grocery item: ${item.name}`}
                  disabled={busy}
                  style={s.remove}
                  onPress={() => {
                    setEditing(item.id);
                    setDetailsEditing(null);
                    setEditName(shoppingName(item.name));
                    setEditUnit(
                      shoppingQuantity(item.quantity, item.unit, item.name) ===
                        'Choose quantity'
                        ? 'packages'
                        : item.unit || 'each',
                    );
                    setEditQuantity(
                      shoppingQuantity(item.quantity, item.unit, item.name) ===
                        'Choose quantity'
                        ? ''
                        : String(
                            Math.ceil(
                              item.quantity ?? shoppingCount(item.name) ?? 1,
                            ),
                          ),
                    );
                  }}
                >
                  <Text style={s.muted}>Qty / name</Text>
                </Pressable>
                {detailsAvailable && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit notes and section: ${item.name}`}
                    disabled={busy}
                    style={s.remove}
                    onPress={() => {
                      setEditing(null);
                      setDetailsEditing(item.id);
                      setSectionText(item.section || '');
                      setNotesText(item.notes || '');
                    }}
                  >
                    <Text style={s.muted}>Notes / aisle</Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove grocery item: ${item.name}`}
                  disabled={busy}
                  style={s.remove}
                  onPress={() => void edit(item.id, { deleted: true })}
                >
                  <Text style={s.muted}>{'\u00d7'}</Text>
                </Pressable>
              </View>
              {!!item.notes && <Text style={s.muted}>{item.notes}</Text>}
            </View>
          ))}
          {!!items.length && (
            <Text style={s.muted}>
              {items.filter((item) => item.checked).length} of {items.length}{' '}
              items checked
            </Text>
          )}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: { gap: 14, paddingVertical: 12 },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 23, fontWeight: '700', color: theme.ink },
  muted: { fontSize: 13, lineHeight: 20, color: theme.muted },
  refresh: { minHeight: 44, padding: 10, justifyContent: 'center' },
  entry: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.canvas,
    borderRadius: 14,
    padding: 12,
    color: theme.ink,
    fontSize: 15,
  },
  add: {
    minHeight: 50,
    minWidth: 64,
    padding: 14,
    borderRadius: 14,
    backgroundColor: theme.olive,
    justifyContent: 'center',
    alignItems: 'center',
  },
  white: { color: '#FFFFFF', fontWeight: '600' },
  disabled: { opacity: 0.45 },
  error: { fontSize: 14, lineHeight: 21, color: '#8A4935' },
  empty: { padding: 18, backgroundColor: theme.sage, borderRadius: 16, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: theme.ink },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: theme.line,
  },
  checkRow: {
    flex: 1,
    flexBasis: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
    paddingVertical: 10,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.olive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: { backgroundColor: theme.olive },
  itemName: { flex: 1, fontSize: 16, lineHeight: 23, color: theme.ink },
  struck: { textDecorationLine: 'line-through', color: theme.muted },
  remove: {
    marginRight: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
    backgroundColor: theme.canvas,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 10,
    minWidth: 44,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
