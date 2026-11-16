import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { z } from 'zod';
import {
  checkoutDocumentSchema,
  checkoutEditSchema,
  checkoutViewSchema,
} from '@meal/contracts';
import { api as accountApi } from '../lib/api';
import { groceryId, type GroceryApi } from '../lib/weekly-groceries';
import { theme } from '../theme';
type Checkout = z.infer<typeof checkoutViewSchema>;
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const field = {
  minHeight: 48,
  padding: 12,
  borderWidth: 1,
  borderColor: theme.line,
  borderRadius: 12,
  color: theme.ink,
};
function parseMoney(text: string) {
  if (!text.trim()) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(text.trim()))
    throw new Error(
      'Enter dollars with at most two decimal places, or leave blank.',
    );
  return Math.round(Number(text.trim()) * 100);
}
export function CheckoutSummary({
  owner,
  week,
  refreshVersion,
}: {
  owner: string;
  week: string;
  refreshVersion: number;
}) {
  const api = useMemo<GroceryApi>(
    () => (path, method, body, key) =>
      accountApi(path, method, body, key, owner),
    [owner],
  );
  const [view, setView] = useState<Checkout | null>(null),
    [message, setMessage] = useState('Loading checkout estimates...');
  const [actual, setActual] = useState('');
  const [editRevision, setEditRevision] = useState(0),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    alive = useRef(true),
    dirty = useRef(false),
    saving = useRef(false);
  const attempt = useRef({ fingerprint: '', key: groceryId() });
  async function load(discardDraft = false) {
    const current = ++generation.current;
    try {
      const result = checkoutViewSchema.parse(await api(`/checkout/${week}`));
      if (!alive.current || current !== generation.current) return false;
      setView(result);
      setMessage('');
      if (discardDraft || !dirty.current) {
        const value = (cents: number | null) =>
          cents === null ? '' : (cents / 100).toFixed(2);
        setActual(value(result.document.actualCents));
        setEditRevision(result.document.revision);
        dirty.current = false;
      } else if (result.document.revision !== editRevision)
        setMessage(
          'Saved spending changed on another device. Reload spending before reapplying your entries.',
        );
      return true;
    } catch (e) {
      if (alive.current && current === generation.current)
        setMessage(
          e instanceof Error
            ? e.message
            : 'Checkout totals unavailable. Refresh to retry.',
        );
      return false;
    }
  }
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, [api, week, refreshVersion]);
  async function save() {
    if (!view?.canSave || saving.current) return;
    let body: z.infer<typeof checkoutEditSchema>;
    try {
      body = checkoutEditSchema.parse({
        revision: editRevision,
        actualCents: parseMoney(actual),
        taxCents: view.document.taxCents,
        feeCents: view.document.feeCents,
      });
    } catch (e) {
      setMessage(
        e instanceof z.ZodError
          ? 'Enter totals between $0 and $10,000, or leave blank.'
          : e instanceof Error
            ? e.message
            : 'Enter valid totals.',
      );
      return;
    }
    const fingerprint = JSON.stringify(body);
    if (attempt.current.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: groceryId() };
    saving.current = true;
    setBusy(true);
    setMessage('Saving weekly spending...');
    try {
      const saved = checkoutDocumentSchema.parse(
        await api(`/checkout/${week}`, 'PUT', body, attempt.current.key),
      );
      if (alive.current) {
        dirty.current = false;
        setEditRevision(saved.revision);
        setView((current) =>
          current ? { ...current, document: saved } : current,
        );
        const refreshed = await load();
        setMessage(
          refreshed
            ? 'Weekly spending saved. The estimate and budget remain separate.'
            : 'Weekly spending saved. Reload spending to refresh the estimate.',
        );
      }
    } catch (e) {
      if (alive.current)
        setMessage(
          e instanceof Error
            ? e.message
            : 'Unable to save. Your entries have been kept.',
        );
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const [editing, setEditing] = useState(false);
  return (
    <View style={{ paddingVertical: 16, gap: 12 }}>
      <Text
        accessibilityRole="header"
        style={{ fontSize: 22, fontWeight: '700', color: theme.ink }}
      >
        Weekly spending
      </Text>
      <Pressable
        accessibilityRole="button"
        style={field}
        disabled={busy}
        onPress={() => void load(true)}
      >
        <Text>Reload spending</Text>
      </Pressable>
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.muted }}>
          {message}
        </Text>
      )}
      {view && (
        <>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ color: theme.ink }}>
              {view.document.actualCents === null
                ? 'No spending recorded yet'
                : `${money(view.document.actualCents)} spent this week`}
            </Text>
            {view.canSave && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit weekly spending"
                style={field}
                onPress={() => setEditing(!editing)}
              >
                <Text>✎</Text>
              </Pressable>
            )}
          </View>
          {editing && (
            <>
              <TextInput
                accessibilityLabel="Actual weekly checkout total in USD"
                placeholder="Total spent ($)"
                value={actual}
                onChangeText={(text) => {
                  dirty.current = true;
                  setActual(text);
                }}
                keyboardType="decimal-pad"
                editable={!busy}
                style={field}
              />
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                style={field}
                onPress={() => void save()}
              >
                <Text>Save weekly spending</Text>
              </Pressable>
            </>
          )}
        </>
      )}
    </View>
  );
}
