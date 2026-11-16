import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Preferences } from '@meal/contracts';
import { theme } from '../theme';
import { ProfileFields } from './ProfileFields';
import { Kitchen } from './Kitchen';

function SettingsRow({
  title,
  subtitle,
  icon,
  onPress,
  label,
  expanded,
  disabled = false,
  last = false,
}: {
  title: string;
  subtitle: string;
  icon: string;
  onPress: () => void;
  label?: string;
  expanded?: boolean;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label || title}
      accessibilityState={{
        disabled,
        ...(expanded === undefined ? {} : { expanded }),
      }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.row,
        !last && s.divider,
        pressed && s.pressed,
        disabled && { opacity: 0.5 },
      ]}
    >
      <View style={s.icon}>
        <Text accessible={false} style={s.iconText}>
          {icon}
        </Text>
      </View>
      <View style={s.rowBody}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.subtitle}>{subtitle}</Text>
      </View>
      <Text accessible={false} style={s.chevron}>
        {expanded ? '−' : '›'}
      </Text>
    </Pressable>
  );
}

export function SettingsHome({
  profileOpen,
  pantryOpen,
  onProfileToggle,
  onPantryToggle,
  preferences,
  email,
  owner,
  busy,
  loading,
  demo,
  onSave,
  onRefresh,
  onSignOut,
  children,
}: {
  profileOpen: boolean;
  pantryOpen: boolean;
  onProfileToggle: () => void;
  onPantryToggle: () => void;
  preferences: Preferences;
  email?: string;
  owner: string | null;
  busy: boolean;
  loading: boolean;
  demo: boolean;
  onSave: (preferences: Preferences) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  onSignOut: () => void;
  children?: ReactNode;
}) {
  const [saved, setSaved] = useState(false);
  const name = preferences.displayName.trim() || 'Your kitchen';
  const initials =
    preferences.displayName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('') || 'T1';
  return (
    <View style={s.page}>
      <Text style={s.intro}>A few little things that make this yours.</Text>
      <View style={s.profile}>
        <View style={s.avatar}>
          <Text style={s.initials}>{initials}</Text>
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={s.name}>{name}</Text>
          <Text style={s.subtitle}>
            {demo ? 'Your preview kitchen' : email}
          </Text>
          <Text style={s.profileMeta}>
            {preferences.people}{' '}
            {preferences.people === 1 ? 'person' : 'people'} · $
            {(preferences.weeklyBudgetCents / 100).toFixed(0)} weekly budget
          </Text>
        </View>
      </View>
      <View style={s.section}>
        <Text style={s.sectionLabel}>YOUR KITCHEN</Text>
        <View style={s.group}>
          <SettingsRow
            title="Profile & preferences"
            subtitle={
              saved
                ? '\u2713 Profile & preferences saved'
                : 'Your details, tastes and cooking routine'
            }
            icon="✎"
            label={
              profileOpen
                ? 'Done editing profile'
                : '✎ Edit profile & preferences'
            }
            expanded={profileOpen}
            onPress={onProfileToggle}
            last={profileOpen || !owner}
          />
          {profileOpen && (
            <View style={s.editor}>
              {!preferences.onboardingCompleted && (
                <Text style={s.subtitle}>
                  Review your preferences to finish setting up your kitchen.
                </Text>
              )}
              <ProfileFields
                preferences={preferences}
                disabled={busy || loading}
                onSave={async (value) => {
                  const success = await onSave(value);
                  if (success) {
                    setSaved(true);
                    onProfileToggle();
                  }
                  return success;
                }}
              />
            </View>
          )}
          {owner && (
            <SettingsRow
              title="Pantry & regular purchases"
              subtitle="What you have and what you buy often"
              icon="▤"
              label={pantryOpen ? 'Close pantry' : 'Pantry & regular purchases'}
              expanded={pantryOpen}
              onPress={onPantryToggle}
              last
            />
          )}
          {pantryOpen && owner && (
            <View style={s.editor}>
              <Kitchen owner={owner} onChanged={onRefresh} />
            </View>
          )}
        </View>
      </View>
      <View style={s.section}>
        <Text style={s.sectionLabel}>ACCOUNT</Text>
        <View style={s.group}>
          <SettingsRow
            title="Sync your kitchen"
            subtitle="Refresh changes from your other devices"
            icon="↻"
            label="Refresh from other devices"
            onPress={() => void onRefresh()}
            disabled={loading}
          />
          <SettingsRow
            title="Sign out"
            subtitle="Your recipes will be here when you return"
            icon="↗"
            onPress={onSignOut}
            disabled={busy || demo}
            last
          />
        </View>
        {children}
      </View>
      <Text style={s.footer}>
        Table for One · Good food. Your kind of routine.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: 24,
    paddingBottom: 28,
  },
  intro: { fontSize: 14, lineHeight: 21, color: theme.muted },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    borderRadius: 22,
    backgroundColor: theme.sage,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.olive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: 'Nunito',
    fontSize: 19,
    fontWeight: '800',
    color: theme.paper,
  },
  name: {
    fontFamily: 'Nunito',
    fontSize: 21,
    fontWeight: '800',
    color: theme.ink,
  },
  profileMeta: { fontSize: 12, color: theme.olive, marginTop: 3 },
  section: { gap: 10 },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.7,
    fontWeight: '700',
    color: theme.muted,
    paddingLeft: 4,
  },
  group: {
    backgroundColor: theme.paper,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.line,
    overflow: 'hidden',
  },
  row: {
    minHeight: 82,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: theme.ink,
  },
  subtitle: { fontSize: 12, lineHeight: 18, color: theme.muted },
  divider: { borderBottomWidth: 1, borderBottomColor: theme.line },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: theme.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 20, color: theme.olive },
  chevron: { fontSize: 22, color: theme.muted },
  pressed: { backgroundColor: theme.sage },
  editor: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.line,
    gap: 12,
  },
  footer: {
    fontSize: 11,
    color: theme.muted,
    textAlign: 'center',
    lineHeight: 17,
  },
});
