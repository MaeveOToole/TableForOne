import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { Preferences } from '@meal/contracts';
import { theme } from '../theme';
import { WeeklyGroceryList } from './WeeklyGroceryList';
import { RegularPurchases } from './RegularPurchases';
import { api as accountApi, preview } from '../lib/api';

export function WeeklyBudget({
  preferences,
  owner,
  initialWeek,
}: {
  preferences: Preferences;
  owner: string;
  initialWeek?: string | null;
}) {
  const api = useMemo(
    () => (path: string, method?: string, body?: unknown, key?: string) =>
      accountApi(path, method, body, key, owner),
    [owner],
  );
  const [week, setWeek] = useState(() => {
    if (initialWeek) return initialWeek;
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: preferences.timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(new Date());
    const n = (key: string) => Number(p.find((x) => x.type === key)?.value);
    const d = new Date(Date.UTC(n('year'), n('month') - 1, n('day')));
    d.setUTCDate(
      d.getUTCDate() -
        ((d.getUTCDay() + (preferences.weekStartDay === 'Monday' ? 6 : 0)) % 7),
    );
    return d.toISOString().slice(0, 10);
  });
  const [revision, setRevision] = useState<number | null>(null),
    [amount, setAmount] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const generation = useRef(0);
  const [listVersion, setListVersion] = useState(0);

  useEffect(() => {
    const current = ++generation.current;
    setRevision(null);
    setEditingBudget(false);
    setMessage('Loading weekly budget...');
    api(`/weekly-budgets/${week}`)
      .then((data) => {
        if (current === generation.current) {
          setRevision(data.revision);
          setAmount(String(data.ceilingCents / 100));
          setMessage('');
        }
      })
      .catch(() => {
        if (current === generation.current)
          setMessage(
            'Budget unavailable. Change week or return here to retry.',
          );
      });
    return () => {
      generation.current++;
    };
  }, [week]);
  function navigate(days: number) {
    const date = new Date(`${week}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    setWeek(date.toISOString().slice(0, 10));
  }
  async function save(reset = false) {
    const cents = reset
      ? preferences.weeklyBudgetCents
      : Math.round(Number(amount) * 100);
    if (
      revision === null ||
      !Number.isFinite(cents) ||
      cents < 0 ||
      cents > 1000000 ||
      (!reset && !amount.trim())
    ) {
      setMessage('Enter a valid weekly budget.');
      return;
    }
    setBusy(true);
    const current = generation.current;
    try {
      const result = await api(`/weekly-budgets/${week}`, 'PUT', {
        revision,
        ceilingCents: cents,
      });
      if (current !== generation.current) return;
      setRevision(result.revision);
      setAmount(String(result.ceilingCents / 100));
      setMessage('Weekly budget saved.');
      setEditingBudget(false);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  const style = {
    padding: 14,
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 14,
    backgroundColor: theme.canvas,
    marginVertical: 6,
  } as const;
  return (
    <View
      style={{
        padding: 2,
        gap: 12,
      }}
    >
      <Text>Week starting {week}</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          style={style}
          disabled={busy}
          onPress={() => navigate(-7)}
        >
          <Text>Previous week</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={style}
          disabled={busy}
          onPress={() => navigate(7)}
        >
          <Text>Next week</Text>
        </Pressable>
      </View>
      <WeeklyGroceryList
        key={`groceries:${week}:${listVersion}`}
        week={week}
        owner={owner}
      />
      {!preview && (
        <RegularPurchases
          key={`regular:${week}`}
          week={week}
          owner={owner}
          preferences={preferences}
          onChanged={() => setListVersion((version) => version + 1)}
        />
      )}
      <Text
        accessibilityRole="header"
        style={{ fontSize: 22, fontWeight: '700', color: theme.ink }}
      >
        Weekly grocery budget
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ color: theme.muted }}>
          ${amount || preferences.weeklyBudgetCents / 100} this week
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit weekly grocery budget"
          style={style}
          onPress={() => setEditingBudget(!editingBudget)}
        >
          <Text>✎</Text>
        </Pressable>
      </View>
      {editingBudget && (
        <>
          <TextInput
            accessibilityLabel="Weekly grocery ceiling in USD"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            editable={!busy && revision !== null}
            style={style}
          />
          <Text>
            Currency: USD. Usual weekly ceiling: $
            {(preferences.weeklyBudgetCents / 100).toFixed(2)}.
          </Text>
          <Pressable
            accessibilityRole="button"
            style={style}
            disabled={busy || revision === null}
            onPress={() => void save()}
          >
            <Text>Save this week</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={style}
            disabled={busy || revision === null}
            onPress={() => void save(true)}
          >
            <Text>Reset to usual ceiling</Text>
          </Pressable>
        </>
      )}
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor:
              message === 'Weekly budget saved.' ? theme.sage : theme.canvas,
            color: theme.olive,
            fontWeight: '700',
          }}
        >
          {message === 'Weekly budget saved.' ? '\u2713 Budget saved' : message}
        </Text>
      )}
      <View
        style={{
          padding: 18,
          borderRadius: 16,
          backgroundColor: theme.sage,
          gap: 8,
        }}
      >
        <Text style={{ fontWeight: '600', color: theme.ink }}>
          Make it your own.
        </Text>
        <Text style={{ color: theme.muted, lineHeight: 21 }}>
          Add any groceries you need above, or save a recipe-based list from
          This Week. Use Qty / name to change amounts, or Notes / aisle to
          choose a store section and add notes.
        </Text>
      </View>
    </View>
  );
}
