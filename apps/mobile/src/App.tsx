import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import {
  defaultPreferences,
  preferencesSchema,
  savedListSchema,
  type Recipe,
  type Preferences,
  type DiscoveryContext,
} from '@meal/contracts';
import { configured, supabase } from './lib/supabase';
import { api, preview } from './lib/api';
import { SettingsHome } from './components/SettingsHome';
import { AccountRecovery } from './components/AccountRecovery';
import { AccountDeletion } from './components/AccountDeletion';
import { RecipeRating } from './components/RecipeRating';
import { RecipeReadingView } from './components/RecipeReadingView';
import { RecipeDetails } from './components/RecipeDetails';
import { WeeklyBudget } from './components/WeeklyBudget';
import { RecipeBrowser } from './components/RecipeBrowser';
import { theme } from './theme';
import { ThisWeek } from './components/ThisWeek';
import { loadLibrary } from './lib/load-library';
import { LibraryCache } from './lib/library-cache';
import { localStore } from './lib/local-store';
import { withDeadline } from './lib/deadline';

const tabs = [
  'This Week',
  'Discover',
  'Saved',
  'Groceries',
  'Settings',
] as const;
const visibleTabs = tabs;
const recipeChatEnabled = true;
type Tab = (typeof tabs)[number];
const primaryTabs: Tab[] = [...tabs];
const palette = {
  ivory: theme.canvas,
  charcoal: '#25292B',
  steel: theme.olive,
  gray: theme.sage,
};
const displayFont = 'Nunito';
function NavIcon({ kind, filled = false }: { kind: string; filled?: boolean }) {
  if (kind === 'Discover')
    return (
      <View style={styles.iconBox}>
        <View style={styles.searchRing} />
        <View style={styles.searchHandle} />
      </View>
    );
  if (kind === 'Groceries')
    return (
      <View style={styles.iconBox}>
        <View
          style={{
            width: 20,
            height: 19,
            borderWidth: 2,
            borderColor: theme.ink,
            borderRadius: 4,
            borderTopWidth: 5,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 0,
            width: 10,
            height: 9,
            borderRadius: 5,
            borderWidth: 2,
            borderColor: theme.ink,
          }}
        />
      </View>
    );
  if (kind === 'Settings')
    return (
      <Text accessible={false} style={{ fontSize: 23, color: theme.ink }}>
        ⚙
      </Text>
    );
  return (
    <View style={styles.iconBox}>
      <View
        style={[
          kind === 'Saved' ? styles.bookmark : styles.calendar,
          filled && { backgroundColor: palette.steel },
        ]}
      >
        {kind === 'This Week' && (
          <Text
            style={{
              color: palette.charcoal,
              fontSize: 14,
              textAlign: 'center',
            }}
          >
            +
          </Text>
        )}
      </View>
    </View>
  );
}
function RecipePhoto({ recipe }: { recipe: Recipe }) {
  const [failed, setFailed] = useState(false);
  if (
    recipe.incomplete ||
    !recipe.image_url ||
    recipe.image_permission === 'none'
  )
    return null;
  return (
    <View style={styles.photoWrap}>
      {failed ? (
        <View style={styles.photoFallback}>
          <Text style={styles.cardTitle}>{recipe.cuisine} kitchen</Text>
        </View>
      ) : (
        <Image
          accessibilityLabel={`Permitted image for ${recipe.title}`}
          source={{
            uri: recipe.image_url,
          }}
          style={styles.photo}
          onError={() => setFailed(true)}
        />
      )}
      <Text style={styles.photoCaption}>{recipe.image_permission} image</Text>
    </View>
  );
}

function Button({
  title,
  onPress,
  disabled = false,
  variant = 'solid',
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'solid' | 'text';
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        variant === 'text' && styles.textButton,
        focused && styles.focused,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text
        style={[styles.buttonText, variant === 'text' && styles.textButtonText]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    // Metro resolves bundled font assets through require.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Nunito: require('../assets/fonts/Nunito.ttf'),
  });
  if (!fontsLoaded && !fontError)
    return (
      <View style={[styles.safe, { justifyContent: 'center' }]}>
        <ActivityIndicator
          accessibilityLabel="Preparing your kitchen"
          color={palette.charcoal}
        />
      </View>
    );
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}
function RecipeFrame({
  wide,
  visible,
  onClose,
  children,
}: {
  wide: boolean;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (wide)
    return visible ? (
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '44%',
          backgroundColor: palette.ivory,
          borderLeftWidth: 1,
          borderColor: palette.gray,
        }}
      >
        {children}
      </View>
    ) : null;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {children}
    </Modal>
  );
}
function Shell() {
  const [editingProfile, setEditingProfile] = useState(false);
  const [settingsKitchen, setSettingsKitchen] = useState(false);
  const wide = useWindowDimensions().width >= 768;
  const [tab, setTab] = useState<Tab>('This Week');
  const [planningWeek, setPlanningWeek] = useState<string | null>(null);
  const [discoverChat, setDiscoverChat] = useState(false);
  function browseForWeek(
    week: string,
    mode: 'Discover' | 'Saved',
    chat = false,
  ) {
    setPlanningWeek(week);
    setDiscoverChat(recipeChatEnabled && chat);
    setTab(mode);
  }
  const [session, setSession] = useState<Session | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [context, setContext] = useState<DiscoveryContext>({
    pantry: [],
    ratings: {},
    cooked: {},
  });
  const [collections, setCollections] = useState<
    { id: string; name: string }[]
  >([]);
  const [savedRecords, setSavedRecords] = useState<
    ReturnType<typeof savedListSchema.parse>['items']
  >([]);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [managingRecipe, setManagingRecipe] = useState(false);
  function openRecipe(recipe: Recipe) {
    setManagingRecipe(false);
    setSelected(recipe);
  }
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [prefs, setPrefs] = useState(defaultPreferences);
  const [revision, setRevision] = useState<number | null>(null);
  const [greetingTime, setGreetingTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setGreetingTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const greetingHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: prefs.timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(greetingTime),
  );
  const greeting =
    greetingHour < 12
      ? 'Good morning'
      : greetingHour < 17
        ? 'Good afternoon'
        : 'Good evening';
  const generation = useRef(0);
  const identity = useRef<string | null>(null);
  useEffect(() => {
    function updateSession(next: Session | null) {
      const userId = next?.user.id ?? null;
      if (identity.current !== userId) {
        identity.current = userId;
        generation.current++;
        setSaved([]);
        setError('');
        setSavedRecords([]);
        setPlanningWeek(null);
        setDiscoverChat(false);
        setCollections([]);
        setContext({ pantry: [], ratings: {}, cooked: {} });
        setRecipes([]);
        setSelected(null);
        setPrefs(defaultPreferences);
        setRevision(null);
        setPassword('');
        setNotice('');
      }
      setSession(next);
    }
    withDeadline(
      supabase.auth.getSession(),
      10000,
      'Your sign-in session could not be loaded. Please retry.',
    )
      .then(({ data }) => updateSession(data.session))
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Sign-in unavailable.'),
      );
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      updateSession(next),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  const reload = useCallback(async () => {
    if ((session?.user.id || null) !== identity.current) return;
    if (!configured && !preview) return;
    const current = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const cache = session
        ? new LibraryCache(localStore, session.user.id, (path) =>
            api(path, 'GET', undefined, undefined, session.user.id),
          )
        : null;
      if (cache) {
        const cached = await loadLibrary(cache.offline, true);
        if (current !== generation.current) return;
        if (cached.recipes.length) {
          setRecipes(cached.recipes);
          if (cached.saves) {
            setSavedRecords(cached.saves);
            setSaved(cached.saves.map((s) => s.recipe_id));
          }
          if (cached.profile) {
            setPrefs(cached.profile.preferences);
            setRevision(cached.profile.revision);
          }
          if (cached.context) setContext(cached.context);
          if (cached.collections) setCollections(cached.collections);
          setNotice('Showing recipes saved on this device while refreshing.');
        }
      }
      const result = await loadLibrary(cache?.read || api, !!session, preview);
      if (current !== generation.current) return;
      if (result.profile) {
        setPrefs(result.profile.preferences);
        setRevision(result.profile.revision);
      }
      setRecipes(result.recipes);
      setSelected((value) =>
        value ? result.recipes.find((r) => r.id === value.id) || null : null,
      );
      if (result.saves) {
        setSavedRecords(result.saves);
        setSaved(result.saves.map((s) => s.recipe_id));
      }
      if (result.context) setContext(result.context);
      if (result.collections) setCollections(result.collections);
      setError(result.errors.join('\n'));
      if (cache?.fallback.size)
        setNotice('Offline recipe copies shown. Changes require a connection.');
      else if (cache?.storageFailed)
        setNotice('Recipes loaded, but could not be saved for offline use.');
      else setNotice('');
    } catch (e) {
      if (current === generation.current)
        setError(
          e instanceof Error ? e.message : 'Unable to load. Please retry.',
        );
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [session?.user.id]);
  useEffect(() => {
    void reload();
  }, [reload]);
  async function authenticate(signUp: boolean) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const credentials = { email: email.trim(), password };
      const { error, data } = signUp
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
      setPassword('');
      setNotice(
        signUp && !data.session
          ? 'Check your email to confirm your account, then return here to sign in.'
          : 'You are signed in. Your recipes and profile are saved to your account.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }
  async function toggleSave(recipe: Recipe) {
    if (!session && !preview) {
      setSelected(null);
      setNotice('Sign in to save recipes to your account.');
      setTab('Settings');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    const current = generation.current;
    const exists = saved.includes(recipe.id);
    try {
      await api(`/saved/${recipe.id}`, exists ? 'DELETE' : 'PUT');
      if (current === generation.current)
        setSaved((items) =>
          exists
            ? items.filter((id) => id !== recipe.id)
            : [...items, recipe.id],
        );
      if (current === generation.current) {
        setNotice(
          exists
            ? 'Recipe removed from Saved.'
            : 'Recipe saved to your account.',
        );
        try {
          const records = savedListSchema.parse(await api('/saved')).items;
          if (current === generation.current) setSavedRecords(records);
        } catch {
          if (current === generation.current)
            setNotice(
              'Your save changed successfully. Refresh to reload its organization details.',
            );
        }
      }
    } catch (e) {
      if (current === generation.current)
        setError(
          e instanceof Error ? e.message : 'Unable to save. Please retry.',
        );
    } finally {
      setBusy(false);
    }
  }
  async function addToWeek(recipe: Recipe) {
    if (!planningWeek || busy) return;
    if (!session) {
      setNotice('Sign in to add recipes to your week.');
      setTab('Settings');
      return;
    }
    const current = generation.current;
    const owner = session.user.id;
    const week = planningWeek;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      let records = savedListSchema.parse(
        await api('/saved', 'GET', undefined, undefined, owner),
      ).items;
      let record = records.find((item) => item.recipe_id === recipe.id);
      if (!record) {
        await api(`/saved/${recipe.id}`, 'PUT', undefined, undefined, owner);
        records = savedListSchema.parse(
          await api('/saved', 'GET', undefined, undefined, owner),
        ).items;
        record = records.find((item) => item.recipe_id === recipe.id);
      }
      if (!record)
        throw new Error(
          'Recipe saved, but its week could not be updated. Refresh and retry.',
        );
      if (record.planned_week !== week) {
        await api(
          `/saved/${recipe.id}/organization`,
          'PUT',
          {
            revision: record.revision,
            collectionId: record.collection_id,
            plannedWeek: week,
          },
          undefined,
          owner,
        );
      }
      const latest = savedListSchema.parse(
        await api('/saved', 'GET', undefined, undefined, owner),
      ).items;
      if (current !== generation.current) return;
      setSavedRecords(latest);
      setSaved(latest.map((item) => item.recipe_id));
      setNotice(`${recipe.title} added to your week.`);
    } catch (error) {
      if (current === generation.current)
        setError(
          error instanceof Error
            ? error.message
            : 'Unable to add this recipe to the week.',
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function savePreferences(preferences: Preferences) {
    setBusy(true);
    setError('');
    setNotice('');
    const current = generation.current;
    try {
      if (revision === null)
        throw new Error('Reload your profile before saving preferences.');
      const latest = await api('/preferences');
      if (current !== generation.current) return false;
      const latestPreferences = preferencesSchema.parse(latest.preferences);
      const merged = { ...latestPreferences };
      for (const field of Object.keys(preferences) as (keyof Preferences)[]) {
        const edited = JSON.stringify(preferences[field]);
        const original = JSON.stringify(prefs[field]);
        const remote = JSON.stringify(latestPreferences[field]);
        if (edited === original) continue;
        if (remote !== original && remote !== edited)
          throw new Error(
            `The ${field} preference changed elsewhere. Your edits are still here; reload to review the saved profile before trying again.`,
          );
        Object.assign(merged, { [field]: preferences[field] });
      }
      const result = await api('/preferences', 'PUT', {
        revision: latest.revision,
        preferences: merged,
      });
      if (current !== generation.current) return false;
      setPrefs(preferencesSchema.parse(result.preferences));
      setRevision(result.revision);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {preview && (
        <Text style={styles.notice}>Preview - Explore a sample kitchen</Text>
      )}
      <View style={[styles.shell, wide && { flexDirection: 'row' }]}>
        <View style={wide ? styles.sidebar : styles.header}>
          {session && (
            <Text style={styles.signedInNote}>
              {greeting}
              {prefs.displayName.trim() ? `, ${prefs.displayName.trim()}` : ''}
            </Text>
          )}
          <Text style={styles.brand}>Table for One</Text>
          <Text style={styles.muted}>Good food. Your kind of routine.</Text>
          {wide &&
            visibleTabs.map((item) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === item }}
                key={item}
                onPress={() => setTab(item)}
                style={[styles.navItem, tab === item && styles.navSelected]}
              >
                <Text style={tab === item ? styles.active : styles.muted}>
                  {item}
                </Text>
              </Pressable>
            ))}
        </View>
        <View
          style={[styles.main, wide && !!selected && { marginRight: '44%' }]}
        >
          <Text style={styles.eyebrow}>
            {tab === 'Discover'
              ? 'FIND YOUR NEXT FAVORITE'
              : tab === 'Settings'
                ? 'MAKE IT YOURS'
                : 'YOUR EVERYDAY KITCHEN'}
          </Text>
          <Text accessibilityRole="header" style={styles.title}>
            {tab === 'Discover'
              ? 'A little inspiration.'
              : tab === 'This Week'
                ? 'Your week, made easy.'
                : tab === 'Saved'
                  ? 'Your personal cookbook.'
                  : tab === 'Groceries'
                    ? 'Grocery List'
                    : tab}
          </Text>
          {!configured && !preview && (
            <Text style={styles.notice}>
              Your kitchen is not connected yet. Recipes will appear once your
              service is ready.
            </Text>
          )}
          {!!notice && (
            <Text accessibilityRole="alert" style={styles.notice}>
              {notice}
            </Text>
          )}
          {!!error && (
            <View accessibilityRole="alert" style={styles.notice}>
              <Text>{error}</Text>
              <Button title="Reload data" onPress={() => void reload()} />
            </View>
          )}
          <View
            style={{
              flex: 1,
              minHeight: 0,
              display: tab === 'This Week' ? 'flex' : 'none',
            }}
          >
            <ThisWeek
              key={session?.user.id || 'guest'}
              preferences={prefs}
              recipes={recipes}
              records={savedRecords}
              signedIn={!!session}
              onOpen={openRecipe}
              onDiscover={(week) => browseForWeek(week, 'Discover', true)}
              onBrowse={(week) => browseForWeek(week, 'Discover')}
              onSaved={(week) => browseForWeek(week, 'Saved')}
              onRefresh={reload}
              owner={session?.user.id || null}
              onWeekChange={setPlanningWeek}
            />
          </View>
          {tab === 'Discover' || tab === 'Saved' ? (
            <RecipeBrowser
              key={`${tab}:${session?.user.id || 'guest'}`}
              mode={tab}
              recipes={recipes}
              preferences={prefs}
              context={context}
              saved={saved}
              records={savedRecords}
              collections={collections}
              signedIn={!!session}
              demo={preview}
              loading={loading}
              busy={busy}
              wide={wide && !selected}
              onOpen={openRecipe}
              onManage={(recipe) => {
                setManagingRecipe(true);
                setSelected(recipe);
              }}
              planningWeek={planningWeek}
              onAddToWeek={addToWeek}
              onReturnToWeek={() => setTab('This Week')}
              chatOpen={recipeChatEnabled && tab === 'Discover' && discoverChat}
              showChat={recipeChatEnabled}
              onChatChange={setDiscoverChat}
              onSave={toggleSave}
              onReload={reload}
              onProfile={() => setTab('Settings')}
            />
          ) : tab === 'This Week' ? null : tab === 'Settings' ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
            >
              {(!session || preview) && (
                <Text
                  style={[
                    styles.muted,
                    !session && !preview && styles.accountPrompt,
                  ]}
                >
                  {preview
                    ? 'Browser demo - changes are saved only in this browser.'
                    : session
                      ? session.user.email
                      : 'Create your account to keep recipes on iPhone and iPad.'}
                </Text>
              )}
              {!session && !preview ? (
                <>
                  <Text style={styles.cardTitle}>Welcome to your kitchen</Text>
                  <Text style={[styles.muted, styles.authDescription]}>
                    Sign in or create an account to save your profile,
                    preferences and recipes.
                  </Text>
                  <TextInput
                    accessibilityLabel="Email"
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    style={styles.input}
                  />
                  <TextInput
                    accessibilityLabel="Password"
                    autoCapitalize="none"
                    autoComplete="current-password"
                    secureTextEntry
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    style={styles.input}
                  />
                  <Button
                    title="Sign in"
                    disabled={busy || !configured || !email || !password}
                    onPress={() => void authenticate(false)}
                  />
                  <Button
                    title="Create Account"
                    variant="text"
                    disabled={
                      busy || !configured || !email || password.length < 8
                    }
                    onPress={() => void authenticate(true)}
                  />
                </>
              ) : (
                <SettingsHome
                  profileOpen={editingProfile}
                  pantryOpen={settingsKitchen}
                  onProfileToggle={() => setEditingProfile(!editingProfile)}
                  onPantryToggle={() => setSettingsKitchen(!settingsKitchen)}
                  preferences={prefs}
                  email={session?.user.email}
                  owner={session?.user.id || null}
                  busy={busy}
                  loading={loading}
                  demo={preview}
                  onSave={savePreferences}
                  onRefresh={reload}
                  onSignOut={() => {
                    void supabase.auth.signOut().then(({ error }) => {
                      if (error) setError(error.message);
                    });
                  }}
                >
                  {session && !preview && (
                    <AccountDeletion
                      key={session.user.id}
                      owner={session.user.id}
                      disabled={busy}
                      onDeleted={async () => {
                        const owner = session.user.id;
                        await localStore.clearAccount(owner);
                        if (identity.current !== owner) return;
                        const { error } = await supabase.auth.signOut({
                          scope: 'local',
                        });
                        if (error)
                          throw new Error(
                            'Account deleted. Local sign-out failed; retry clearing this device.',
                          );
                        setTab('Settings');
                        setNotice(
                          'Your account and its active server data were deleted. Cached account data on this device was cleared.',
                        );
                      }}
                    />
                  )}
                </SettingsHome>
              )}
              <AccountRecovery
                email={email}
                showTrigger={!session && !preview}
              />
            </ScrollView>
          ) : tab === 'Groceries' && (session || preview) ? (
            <ScrollView keyboardShouldPersistTaps="handled">
              <WeeklyBudget
                key={session?.user.id || 'preview'}
                preferences={prefs}
                initialWeek={planningWeek}
                owner={
                  session?.user.id || '00000000-0000-4000-8000-000000000001'
                }
              />
            </ScrollView>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{`${tab} is taking shape.`}</Text>
              <Text style={styles.muted}>
                This feature is planned. Start by discovering and saving a few
                recipes.
              </Text>
              <Button
                title="Explore recipes"
                onPress={() => setTab('Discover')}
              />
            </View>
          )}
        </View>
      </View>
      {!wide && (
        <>
          <View style={styles.tabBar}>
            {primaryTabs.map((item) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel={item === 'This Week' ? 'Week' : item}
                accessibilityState={{
                  selected: tab === item,
                }}
                key={item}
                style={[styles.bottomItem, tab === item && styles.navSelected]}
                onPress={() => setTab(item)}
              >
                <NavIcon kind={item} />
                <Text style={tab === item ? styles.active : styles.navLabel}>
                  {item === 'This Week' ? 'Week' : item}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <RecipeFrame
        wide={wide}
        visible={!!selected}
        onClose={() => setSelected(null)}
      >
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.detail}>
            <Button title="Close recipe" onPress={() => setSelected(null)} />
            {selected && !managingRecipe && (
              <>
                <RecipeReadingView recipe={selected} />
                <RecipeRating
                  key={selected.id}
                  id={selected.id}
                  owner={session?.user.id || null}
                />
              </>
            )}
            {selected && managingRecipe && (
              <>
                <Text style={styles.eyebrow}>
                  {selected.category || selected.cuisine} |{' '}
                  {selected.minutes === null
                    ? 'Time not recorded'
                    : `${selected.minutes} minutes`}
                </Text>
                <RecipePhoto recipe={selected} />
                <Text style={styles.title}>{selected.title}</Text>
                {selected.incomplete && (
                  <Text style={styles.notice}>
                    Recipe draft from your collection. Full ingredients,
                    measurements and directions have not been recovered yet.
                  </Text>
                )}
                <Text style={styles.muted}>{selected.description}</Text>
                <Text style={styles.meta}>
                  {selected.servings === null
                    ? 'Servings not recorded'
                    : `${selected.servings} portions`}{' '}
                  | {selected.provenance.source}
                </Text>
                <Text style={styles.notice}>
                  {selected.provenance.method === 'generated'
                    ? 'AI-generated sample recipe. Not kitchen-tested.'
                    : selected.provenance.permission}
                </Text>
                <Button
                  title={
                    !session && !preview
                      ? 'Sign in to save'
                      : saved.includes(selected.id)
                        ? 'Remove from saved'
                        : 'Save recipe'
                  }
                  disabled={busy}
                  onPress={() => void toggleSave(selected)}
                />
                <RecipeDetails
                  key={selected.id}
                  recipe={selected}
                  canEdit={!!session}
                  userId={session?.user.id || null}
                  onChanged={reload}
                  rating={context.ratings[selected.id]}
                  cookedAt={context.cooked[selected.id]}
                  weekStartDay={prefs.weekStartDay}
                  timeZone={prefs.timeZone}
                />
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </RecipeFrame>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.canvas },
  shell: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: theme.line,
  },
  brand: {
    fontFamily: displayFont,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -1,
    color: '#25292B',
  },
  muted: { fontSize: 14, color: theme.muted, lineHeight: 21 },
  sidebar: { width: 220, padding: 24, backgroundColor: theme.canvas, gap: 12 },
  main: { flex: 1, padding: 20, gap: 12, minWidth: 0 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#25292B',
  },
  title: {
    fontFamily: displayFont,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -1.2,
    fontWeight: '900',
    color: '#25292B',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#647C8A',
    padding: 14,
    borderRadius: 12,
    minHeight: 48,
    marginVertical: 8,
    fontSize: 16,
    color: '#25292B',
  },
  card: {
    flex: 1,
    marginBottom: 16,
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E9E9',
    gap: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#25292B',
    lineHeight: 26,
  },
  meta: { fontSize: 14, color: '#25292B', marginVertical: 8 },
  button: {
    backgroundColor: theme.olive,
    borderRadius: 12,
    padding: 14,
    minHeight: 48,
    marginVertical: 6,
    alignItems: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  textButton: {
    alignSelf: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 24,
  },
  signedInNote: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#8A4935',
    backgroundColor: '#F3E4D8',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  accountPrompt: { fontSize: 12, fontStyle: 'italic', marginBottom: 12 },
  authDescription: { fontSize: 14, lineHeight: 20 },
  profileExplanation: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    marginBottom: 16,
  },
  textButtonText: {
    color: '#25292B',
    fontSize: 14,
    fontWeight: '400',
    textDecorationLine: 'underline',
  },
  notice: {
    padding: 14,
    backgroundColor: theme.sage,
    color: '#25292B',
    borderRadius: 10,
  },
  navItem: { padding: 14, minHeight: 48 },
  active: { color: '#25292B', fontWeight: '700', fontSize: 13 },
  tabBar: {
    flexDirection: 'row',
    padding: 8,
    gap: 4,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.paper,
    boxShadow: '0px 4px 20px rgba(37, 41, 43, 0.12)',
  },
  empty: { padding: 24, color: '#25292B', lineHeight: 24 },
  detail: { padding: 24, gap: 16 },
  iconBox: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRing: {
    width: 17,
    height: 17,
    borderWidth: 2,
    borderColor: '#25292B',
    borderRadius: 10,
    position: 'absolute',
    top: 2,
    left: 2,
  },
  searchHandle: {
    width: 10,
    height: 2,
    backgroundColor: theme.olive,
    transform: [{ rotate: '45deg' }],
    position: 'absolute',
    bottom: 5,
    right: 0,
  },
  bookmark: {
    width: 16,
    height: 22,
    borderWidth: 2,
    borderColor: '#25292B',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 7,
  },
  calendar: {
    width: 22,
    height: 21,
    borderWidth: 2,
    borderColor: '#25292B',
    borderRadius: 4,
  },
  focused: { borderWidth: 3, borderColor: '#647C8A' },
  recipeList: { paddingBottom: 24 },
  photoWrap: { backgroundColor: theme.sage },
  photo: { width: '100%', height: 220 },
  photoFallback: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCaption: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    padding: 4,
    borderRadius: 4,
    backgroundColor: theme.canvas,
    color: '#25292B',
    fontSize: 12,
  },
  cardBody: {
    padding: 16,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    minHeight: 44,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 28,
    backgroundColor: theme.sage,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pillSelected: { borderColor: '#647C8A', backgroundColor: theme.sage },
  pillText: { fontSize: 14, color: '#25292B', fontWeight: '600' },
  chip: {
    fontSize: 13,
    color: '#25292B',
    backgroundColor: theme.sage,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: { fontSize: 21, fontWeight: '700', color: '#25292B' },
  saveButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navSelected: {
    backgroundColor: theme.sage,
    borderRadius: 16,
    borderBottomWidth: 0,
    borderBottomColor: theme.olive,
  },
  bottomItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    padding: 4,
  },
  navLabel: { fontSize: 10, color: '#25292B' },
  moreMenu: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#E5E9E9',
  },
  day: {
    minWidth: 50,
    minHeight: 88,
    padding: 10,
    borderRadius: 28,
    backgroundColor: theme.sage,
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dayDot: {
    backgroundColor: theme.olive,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  summary: {
    padding: 20,
    backgroundColor: theme.sage,
    borderRadius: 18,
    gap: 8,
  },
  line: { fontSize: 17, lineHeight: 27, color: '#25292B' },
});
