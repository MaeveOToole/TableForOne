import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, preview } from '../lib/api';
import { theme } from '../theme';
export function RecipeRating({
  id,
  owner,
}: {
  id: string;
  owner: string | null;
}) {
  const [stars, setStars] = useState<number | null>(null),
    [revision, setRevision] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setRevision(null);
    if (owner || preview)
      api(
        `/recipes/${id}/rating`,
        'GET',
        undefined,
        undefined,
        owner || undefined,
      )
        .then((data) => {
          if (active) {
            setStars(data.stars);
            setRevision(data.revision);
            setMessage('');
          }
        })
        .catch(() => {
          if (active) setMessage('Rating could not load. Tap Retry.');
        });
    return () => {
      active = false;
    };
  }, [id, owner, refresh]);
  if (!owner && !preview) return null;
  async function save(value: number) {
    if (busy || revision === null) return;
    setBusy(true);
    setMessage('Saving rating...');
    try {
      const result = await api(
        `/recipes/${id}/rating`,
        'PUT',
        { stars: value, revision },
        undefined,
        owner || undefined,
      );
      setStars(result.stars);
      setRevision(result.revision);
      setMessage(`Rated ${result.stars} out of 5. Saved.`);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Rating could not save. Retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 10, paddingVertical: 18 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: theme.ink }}>
        Made it? Rate this recipe
      </Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${value} out of 5 stars`}
            accessibilityState={{
              selected: value === stars,
              disabled: busy || revision === null,
            }}
            aria-pressed={value === stars}
            disabled={busy || revision === null}
            onPress={() => void save(value)}
            style={{
              minHeight: 48,
              minWidth: 44,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 32, color: theme.olive }}>
              {stars !== null && value <= stars ? '\u2605' : '\u2606'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text accessibilityLiveRegion="polite" style={{ color: theme.olive }}>
        {message ||
          (stars ? `${stars} / 5 stars` : 'Choose 1 to 5 stars after cooking.')}
      </Text>
      {!!message && !message.includes('Saved.') && !busy && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setRefresh((n) => n + 1)}
          style={{ padding: 12 }}
        >
          <Text>Retry / refresh rating</Text>
        </Pressable>
      )}
    </View>
  );
}
