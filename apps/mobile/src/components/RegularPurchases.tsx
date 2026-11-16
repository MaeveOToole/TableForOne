import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { z } from 'zod';
import {
  planDocumentSchema,
  resourceSchemas,
  type Preferences,
} from '@meal/contracts';
import { api as accountApi } from '../lib/api';
import {
  createGroceryWeek,
  groceryId,
  readGroceryWeek,
  type GroceryApi,
  type GroceryPlan,
} from '../lib/weekly-groceries';
import { resources } from '../lib/planning-workflow';
import { theme } from '../theme';
type Regular = z.infer<typeof resourceSchemas.regular_purchases>;
export function regularDue(
  item: Regular,
  week: string,
  preferences: Preferences,
) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: preferences.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(item.created_at));
  const get = (name: string) => parts.find((part) => part.type === name)!.value;
  const date = new Date(
    `${get('year')}-${get('month')}-${get('day')}T12:00:00Z`,
  );
  date.setUTCDate(
    date.getUTCDate() -
      ((date.getUTCDay() + (preferences.weekStartDay === 'Monday' ? 6 : 0)) %
        7),
  );
  const weeks = Math.round(
    (Date.parse(`${week}T12:00:00Z`) - date.getTime()) / 604800000,
  );
  return weeks >= 0 && weeks % item.cadence_weeks === 0;
}
export function RegularPurchases({
  owner,
  week,
  preferences,
  onChanged,
}: {
  owner: string;
  week: string;
  preferences: Preferences;
  onChanged: () => void;
}) {
  const api = useMemo<GroceryApi>(
    () => (path, method, body, key) =>
      accountApi(path, method, body, key, owner),
    [owner],
  );
  const [items, setItems] = useState<Regular[]>([]),
    [plan, setPlan] = useState<GroceryPlan | null>(null);
  const [available, setAvailable] = useState(false),
    [busy, setBusy] = useState(true),
    [message, setMessage] = useState('');
  const alive = useRef(true),
    working = useRef(false),
    creationId = useRef(groceryId());
  const operation = useRef({ fingerprint: '', key: groceryId() });
  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        const status = z
          .object({ available: z.boolean() })
          .parse(await api('/kitchen-status'));
        if (!status.available) return;
        const [items, plan] = await Promise.all([
          resources(
            api,
            'regular_purchases',
            resourceSchemas.regular_purchases,
          ),
          readGroceryWeek(api, week),
        ]);
        if (alive.current) {
          setAvailable(true);
          setItems(items.filter((item) => item.enabled));
          setPlan(plan);
        }
      } catch {
        if (alive.current)
          setMessage(
            'Regular purchases are unavailable. Your shopping list is still available above.',
          );
      } finally {
        if (alive.current) setBusy(false);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [api, week]);
  async function toggle(item: Regular, included: boolean) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setMessage('');
    try {
      let current = await readGroceryWeek(api, week);
      if (!current)
        current = await createGroceryWeek(
          api,
          week,
          creationId.current,
          `regular-week:${creationId.current}`,
        );
      const body = {
        revision: current.groceries.revision,
        purchaseId: item.id,
        included,
      };
      const fingerprint = JSON.stringify(body);
      if (operation.current.fingerprint !== fingerprint)
        operation.current = { fingerprint, key: groceryId() };
      const result = planDocumentSchema.parse(
        await api(
          `/grocery-lists/${current.groceries.id}/regular-purchases`,
          'PUT',
          body,
          operation.current.key,
        ),
      );
      if (alive.current) {
        setPlan(result);
        setMessage(
          included
            ? 'Regular purchase included for this week.'
            : 'Regular purchase excluded for this week.',
        );
        onChanged();
      }
    } catch (e) {
      if (alive.current)
        setMessage(
          e instanceof Error
            ? e.message
            : 'Unable to update. Refresh groceries and retry.',
        );
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  if (!available)
    return message ? (
      <Text style={{ color: theme.muted }}>{message}</Text>
    ) : null;
  return (
    <View style={{ gap: 10, paddingVertical: 12 }}>
      <Text
        accessibilityRole="header"
        style={{ fontSize: 21, fontWeight: '600', color: theme.ink }}
      >
        Regular purchases
      </Text>
      <Text style={{ color: theme.muted, lineHeight: 21 }}>
        Choose what to include this week. Edit reusable quantities and cadence
        in Kitchen.
      </Text>
      {!items.length && (
        <Text>No reusable purchases yet. Add them in Kitchen.</Text>
      )}
      {items.map((item) => {
        const included =
          plan?.groceries.items.some(
            (grocery) =>
              grocery.origin === 'regular' &&
              !grocery.deleted &&
              grocery.origins.some(
                (origin) => origin.regularPurchaseId === item.id,
              ),
          ) || false;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="checkbox"
            accessibilityLabel={`Include regular purchase: ${item.name}`}
            accessibilityState={{ checked: included }}
            aria-checked={included}
            disabled={busy}
            onPress={() => void toggle(item, !included)}
            style={{
              minHeight: 52,
              padding: 12,
              gap: 5,
              borderWidth: 1,
              borderColor: theme.line,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: theme.ink }}>
              {included ? '✓ ' : '□ '}
              {item.name}
              {item.quantity === null
                ? ''
                : ` · ${item.quantity} ${item.unit || ''}`}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>
              Every {item.cadence_weeks}{' '}
              {item.cadence_weeks === 1 ? 'week' : 'weeks'} ·{' '}
              {regularDue(item, week, preferences)
                ? 'Suggested this week'
                : 'Not due; you can still include it'}
            </Text>
          </Pressable>
        );
      })}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.muted }}>
          {message}
        </Text>
      )}
    </View>
  );
}
