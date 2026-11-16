import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Preferences } from '@meal/contracts';
import { api } from '../lib/transport';
import { theme } from '../theme';

type Message = { role: 'user' | 'assistant'; content: string };
export function RecipeAssistant(p: {
  preferences: Preferences;
  recipes: { title: string }[];
  signedIn: boolean;
  demo: boolean;
  suggestionsOnly?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  async function send(text: string) {
    if (pending.current || !text.trim()) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const next: Message[] = [
      ...messages,
      { role: 'user', content: text.trim() },
    ];
    try {
      const result = await api('/assistant/chat', 'POST', {
        messages: next.slice(-12),
        preferences: p.preferences,
        recipes: p.recipes.slice(0, 20).map((r) => ({ title: r.title })),
      });
      setMessages([...next, { role: 'assistant', content: result.message }]);
      setDraft('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'AI could not respond. Please retry.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const enabled = p.signedIn && !p.demo;
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text style={{ fontWeight: '700', fontSize: 20 }}>
        {p.suggestionsOnly ? 'AI meal suggestions' : 'Recipe chat'}
      </Text>
      <Text>
        Ideas based on your food preferences and Discover recipes. Check
        ingredients and allergens before cooking.
      </Text>
      {!enabled && <Text>Sign in to use live AI.</Text>}
      <ScrollView
        style={{ maxHeight: 360 }}
        contentContainerStyle={{ gap: 12 }}
      >
        {messages.map((m, i) => (
          <View
            key={i}
            style={{
              padding: 12,
              backgroundColor: m.role === 'user' ? theme.sage : '#fff',
            }}
          >
            <Text style={{ fontWeight: '700' }}>
              {m.role === 'user' ? 'You' : 'Table for One'}
            </Text>
            <Text selectable>{m.content}</Text>
          </View>
        ))}
      </ScrollView>
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      {busy && <ActivityIndicator accessibilityLabel="AI is thinking" />}
      <Pressable
        accessibilityRole="button"
        disabled={!enabled || busy}
        onPress={() =>
          void send(
            'Suggest three meals for one using my preferences and these recipes. Explain briefly why each fits.',
          )
        }
        style={{
          padding: 12,
          backgroundColor: theme.sage,
          opacity: !enabled || busy ? 0.5 : 1,
        }}
      >
        <Text>
          {messages.length ? 'Suggest more meals' : 'Get AI suggestions'}
        </Text>
      </Pressable>
      {!p.suggestionsOnly && (
        <>
          <TextInput
            accessibilityLabel="Message the recipe assistant"
            placeholder="Ask about meals, ingredients or substitutions"
            multiline
            maxLength={3000}
            value={draft}
            onChangeText={setDraft}
            editable={enabled && !busy}
            style={{
              borderWidth: 1,
              borderColor: '#aaa',
              padding: 12,
              borderRadius: 8,
            }}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!enabled || busy || !draft.trim()}
            onPress={() => void send(draft)}
            style={{
              padding: 12,
              opacity: !enabled || busy || !draft.trim() ? 0.5 : 1,
            }}
          >
            <Text>Send message</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
