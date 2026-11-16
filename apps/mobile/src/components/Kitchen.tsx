import { capitalizeItem } from '../lib/item-name';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { z } from 'zod';
import {
  pantryEditSchema,
  regularPurchaseEditSchema,
  resourceSchemas,
} from '@meal/contracts';
import { api as accountApi } from '../lib/api';
import { groceryId, type GroceryApi } from '../lib/weekly-groceries';
import { resources } from '../lib/planning-workflow';
import { theme } from '../theme';
type Pantry = z.infer<typeof resourceSchemas.pantry_items>;
type Regular = z.infer<typeof resourceSchemas.regular_purchases>;
const button = {
  minHeight: 46,
  padding: 12,
  borderWidth: 1,
  borderColor: theme.line,
  borderRadius: 12,
  justifyContent: 'center' as const,
};
export function Kitchen({
  owner,
  onChanged,
}: {
  owner: string;
  onChanged: () => Promise<void>;
}) {
  const api = useMemo<GroceryApi>(
    () => (path, method, body, key) =>
      accountApi(path, method, body, key, owner),
    [owner],
  );
  const [available, setAvailable] = useState<boolean | null>(null);
  const [pantry, setPantry] = useState<Pantry[]>([]),
    [regular, setRegular] = useState<Regular[]>([]);
  const [mode, setMode] = useState<'pantry' | 'regular'>('pantry');
  const [editing, setEditing] = useState<Pantry | Regular | null>(null);
  const [name, setName] = useState(''),
    [quantity, setQuantity] = useState(''),
    [unit, setUnit] = useState(''),
    [notes, setNotes] = useState('');
  const [soon, setSoon] = useState(false),
    [staple, setStaple] = useState(false),
    [cadence, setCadence] = useState('1'),
    [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('Loading your kitchen...');
  const working = useRef(false),
    alive = useRef(true),
    draftId = useRef(groceryId());
  const attempt = useRef({ fingerprint: '', key: groceryId() });
  async function refresh() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const status = z
        .object({ available: z.boolean() })
        .parse(await api('/kitchen-status'));
      if (alive.current) setAvailable(status.available);
      if (!status.available) {
        if (alive.current)
          setMessage('Your kitchen will be available when setup is complete.');
        return;
      }
      const [pantry, regular] = await Promise.all([
        resources(api, 'pantry_items', resourceSchemas.pantry_items),
        resources(api, 'regular_purchases', resourceSchemas.regular_purchases),
      ]);
      if (alive.current) {
        setPantry(pantry);
        setRegular(regular);
        setMessage('');
      }
    } catch (e) {
      if (alive.current)
        setMessage(
          e instanceof Error ? e.message : 'Unable to load your kitchen.',
        );
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [api]);
  function reset(next = mode) {
    setEditing(null);
    setMode(next);
    setName('');
    setQuantity('');
    setUnit('');
    setNotes('');
    setSoon(false);
    setStaple(false);
    setCadence('1');
    setEnabled(true);
    draftId.current = groceryId();
  }
  function edit(item: Pantry | Regular, next: 'pantry' | 'regular') {
    reset(next);
    setEditing(item);
    setName(item.name);
    setQuantity(item.quantity === null ? '' : String(item.quantity));
    setUnit(item.unit || '');
    if ('use_soon' in item) {
      setNotes(item.notes || '');
      setSoon(item.use_soon);
      setStaple(item.staple);
    } else {
      setCadence(String(item.cadence_weeks));
      setEnabled(item.enabled);
    }
  }
  async function save() {
    if (working.current || !available) return;
    const revision = editing?.revision || 0,
      id = editing?.id || draftId.current;
    const amount = quantity.trim() ? Number(quantity) : null;
    const raw =
      mode === 'pantry'
        ? {
            revision,
            name: capitalizeItem(name),
            quantity: amount,
            unit: unit.trim() || null,
            useSoon: soon,
            staple,
            notes: notes.trim() || null,
          }
        : {
            revision,
            name: capitalizeItem(name),
            quantity: amount,
            unit: unit.trim() || null,
            cadenceWeeks: Number(cadence),
            enabled,
          };
    const input = (
      mode === 'pantry' ? pantryEditSchema : regularPurchaseEditSchema
    ).safeParse(raw);
    if (!input.success) {
      setMessage(
        'Enter a name and valid optional quantity. Pantry amounts can be zero; regular amounts must be positive. Cadence is 1 to 52 weeks.',
      );
      return;
    }
    const path = `/${mode === 'pantry' ? 'pantry-items' : 'regular-purchases'}/${id}`;
    const fingerprint = JSON.stringify({ path, input: input.data });
    if (attempt.current.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: groceryId() };
    working.current = true;
    setBusy(true);
    setMessage('Saving...');
    try {
      const result = await api(path, 'PUT', input.data, attempt.current.key);
      if (alive.current) {
        if (mode === 'pantry') {
          const item = resourceSchemas.pantry_items.parse(result);
          setPantry((items) => [
            ...items.filter((other) => other.id !== item.id),
            item,
          ]);
        } else {
          const item = resourceSchemas.regular_purchases.parse(result);
          setRegular((items) => [
            ...items.filter((other) => other.id !== item.id),
            item,
          ]);
        }
        reset();
        setMessage(
          'Kitchen saved. Weekly groceries and inventory are separate.',
        );
      }
      await onChanged();
    } catch (e) {
      if (alive.current)
        setMessage(
          e instanceof Error
            ? e.message
            : 'Unable to save. Your entries have been kept.',
        );
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function remove(
    item: Pantry | Regular,
    kind: 'pantry-items' | 'regular-purchases',
  ) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await api(
        `/${kind}/${item.id}`,
        'DELETE',
        { revision: item.revision },
        `delete:${item.id}:${item.revision}`,
      );
      if (alive.current) {
        if (kind === 'pantry-items')
          setPantry((items) => items.filter((other) => other.id !== item.id));
        else
          setRegular((items) => items.filter((other) => other.id !== item.id));
        if (editing?.id === item.id) reset();
        setMessage('Removed. Existing weekly grocery purchases are kept.');
      }
      await onChanged();
    } catch (e) {
      if (alive.current)
        setMessage(
          e instanceof Error
            ? e.message
            : 'Unable to remove. Refresh and retry.',
        );
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const field = (
    label: string,
    value: string,
    change: (value: string) => void,
    numeric = false,
  ) => (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      value={value}
      onChangeText={change}
      editable={!busy}
      keyboardType={numeric ? 'decimal-pad' : 'default'}
      maxLength={label.includes('notes') ? 2000 : 200}
      style={button}
    />
  );
  const toggle = (
    label: string,
    value: boolean,
    change: (value: boolean) => void,
  ) => (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      aria-checked={value}
      disabled={busy}
      style={button}
      onPress={() => change(!value)}
    >
      <Text>
        {value ? '✓ ' : '□ '}
        {label}
      </Text>
    </Pressable>
  );
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 16, paddingBottom: 24 }}
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: 24, color: theme.ink, fontWeight: '700' }}
      >
        Your kitchen
      </Text>
      <Text style={{ color: theme.muted, lineHeight: 22 }}>
        Keep a simple list of what you already have.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        style={button}
        onPress={() => void refresh()}
      >
        <Text>Refresh kitchen</Text>
      </Pressable>
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: theme.ink, lineHeight: 21 }}
        >
          {message}
        </Text>
      )}
      {available && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              style={button}
              onPress={() => reset('pantry')}
            >
              <Text>Add pantry item</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              style={button}
              onPress={() => reset('regular')}
            >
              <Text>Add regular purchase</Text>
            </Pressable>
          </View>
          <View
            style={{
              gap: 10,
              padding: 16,
              backgroundColor: theme.paper,
              borderRadius: 16,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{ fontWeight: '600', fontSize: 18 }}
            >
              {editing ? 'Edit' : 'New'}{' '}
              {mode === 'pantry' ? 'pantry item' : 'regular purchase'}
            </Text>
            {field('Kitchen item name', name, setName)}
            {mode === 'regular' && (
              <>
                {field('Kitchen item quantity', quantity, setQuantity, true)}
                {field(
                  'Regular purchase cadence in weeks',
                  cadence,
                  setCadence,
                  true,
                )}
                {toggle('Regular purchase enabled', enabled, setEnabled)}
              </>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              style={{ ...button, backgroundColor: theme.olive }}
              onPress={() => void save()}
            >
              <Text style={{ color: '#FFFFFF' }}>Save kitchen item</Text>
            </Pressable>
            {editing && (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                style={button}
                onPress={() => reset()}
              >
                <Text>Cancel kitchen edit</Text>
              </Pressable>
            )}
          </View>
          <Text
            accessibilityRole="header"
            style={{ fontSize: 21, fontWeight: '600' }}
          >
            Pantry
          </Text>
          {!pantry.length && (
            <Text>
              No pantry items yet. Missing items have unknown availability.
            </Text>
          )}
          {[...pantry]
            .sort(
              (a, b) =>
                Number(b.use_soon) - Number(a.use_soon) ||
                a.name.localeCompare(b.name),
            )
            .map((item) => (
              <View
                key={item.id}
                style={{
                  gap: 8,
                  padding: 16,
                  backgroundColor: theme.sage,
                  borderRadius: 14,
                }}
              >
                <Text style={{ fontWeight: '600' }}>{item.name}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit pantry item: ${item.name}`}
                    disabled={busy}
                    style={button}
                    onPress={() => edit(item, 'pantry')}
                  >
                    <Text>✎ Edit</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove pantry item: ${item.name}`}
                    disabled={busy}
                    style={button}
                    onPress={() => void remove(item, 'pantry-items')}
                  >
                    <Text>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          <Text
            accessibilityRole="header"
            style={{ fontSize: 21, fontWeight: '600' }}
          >
            Regular purchases
          </Text>
          <Text>
            Templates appear in Groceries for weekly inclusion. Removing a
            template keeps purchases already added to a week.
          </Text>
          {[...regular]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((item) => (
              <View
                key={item.id}
                style={{
                  gap: 8,
                  padding: 16,
                  backgroundColor: theme.sage,
                  borderRadius: 14,
                }}
              >
                <Text style={{ fontWeight: '600' }}>
                  {item.name}
                  {item.enabled ? '' : ' · Disabled'}
                </Text>
                <Text>
                  {item.quantity === null
                    ? 'Quantity not specified'
                    : `${item.quantity} ${item.unit || ''}`}{' '}
                  · Every {item.cadence_weeks}{' '}
                  {item.cadence_weeks === 1 ? 'week' : 'weeks'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit regular purchase: ${item.name}`}
                    disabled={busy}
                    style={button}
                    onPress={() => edit(item, 'regular')}
                  >
                    <Text>✎ Edit</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove regular purchase: ${item.name}`}
                    disabled={busy}
                    style={button}
                    onPress={() => void remove(item, 'regular-purchases')}
                  >
                    <Text>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ))}
        </>
      )}
    </ScrollView>
  );
}
