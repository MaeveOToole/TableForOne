import { capitalizeItem } from '../lib/item-name';
import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { preferencesSchema, type Preferences } from '@meal/contracts';

const cuisines = [
  'American',
  'Mexican',
  'Italian',
  'Mediterranean',
  'Greek',
  'French',
  'Spanish',
  'Middle Eastern',
  'Indian',
  'Thai',
  'Vietnamese',
  'Chinese',
  'Japanese',
  'Korean',
  'Caribbean',
  'Cajun / Creole',
  'Ethiopian',
];
const diets = [
  'Vegetarian',
  'Vegan',
  'Pescatarian',
  'Gluten-free',
  'Dairy-free',
  'Lactose-free',
  'Peanut-free',
  'Tree nut-free',
  'Egg-free',
  'Soy-free',
  'Sesame-free',
  'Shellfish-free',
  'Fish-free',
  'Halal',
  'Kosher',
];
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

export function Suggestions({
  label,
  values,
  options,
  onChange,
  disabled,
  multiple = false,
  custom = false,
  numeric = false,
  emptyLabel = 'Choose an option',
}: {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
  disabled: boolean;
  multiple?: boolean;
  custom?: boolean;
  numeric?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [addition, setAddition] = useState('');
  const all = [...new Set([...options, ...values])];
  function choose(value: string) {
    onChange(
      multiple
        ? values.includes(value)
          ? values.filter((item) => item !== value)
          : [...values, value]
        : [value],
    );
    if (!multiple) setOpen(false);
  }
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${values.join(', ') || emptyLabel}`}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        style={styles.input}
        onPress={() => {
          setAddition('');
          setOpen(true);
        }}
      >
        <Text style={styles.value}>{values.join(', ') || emptyLabel} ▾</Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <Text accessibilityRole="header" style={styles.heading}>
              {label}
            </Text>
            <Text style={styles.help}>
              {multiple ? 'Choose any that apply.' : 'Choose one option.'}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {multiple && (
                <Pressable
                  accessibilityRole="button"
                  style={styles.option}
                  onPress={() => onChange([])}
                >
                  <Text>{values.length ? 'Clear selections' : emptyLabel}</Text>
                </Pressable>
              )}
              {all.map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole={multiple ? 'checkbox' : 'radio'}
                  accessibilityState={
                    multiple
                      ? { checked: values.includes(value) }
                      : { selected: values.includes(value) }
                  }
                  accessibilityLabel={value}
                  onPress={() => choose(value)}
                  style={[
                    styles.option,
                    values.includes(value) && styles.selected,
                  ]}
                >
                  <Text>
                    {values.includes(value) ? '✓  ' : ''}
                    {value}
                  </Text>
                </Pressable>
              ))}
              {custom && (
                <View style={styles.field}>
                  <Text style={styles.label}>
                    {numeric ? 'Custom amount' : 'Add your own'}
                  </Text>
                  <TextInput
                    accessibilityLabel={`${label} custom value`}
                    value={addition}
                    onChangeText={setAddition}
                    style={styles.input}
                    keyboardType={numeric ? 'decimal-pad' : 'default'}
                    autoCapitalize={
                      label === 'Time zone' ? 'none' : 'sentences'
                    }
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={!addition.trim()}
                    style={[styles.button, !addition.trim() && styles.disabled]}
                    onPress={() => {
                      const value =
                        label === 'Time zone' || numeric
                          ? addition.trim()
                          : capitalizeItem(addition);
                      if (multiple) {
                        if (!values.includes(value))
                          onChange([...values, value]);
                      } else {
                        onChange([value]);
                        setOpen(false);
                      }
                      setAddition('');
                    }}
                  >
                    <Text style={styles.buttonText}>
                      {multiple ? 'Add option' : 'Use this value'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() => setOpen(false)}
            >
              <Text style={styles.buttonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeDraft(p: Preferences) {
  return {
    displayName: p.displayName,
    people: String(p.people),
    cookingSessions: String(p.cookingSessions),
    recentRecipeDays: String(p.recentRecipeDays),
    portions: String(p.portions),
    maxMinutes: String(p.maxMinutes),
    weeklyBudget: String(p.weeklyBudgetCents / 100),
    timeZone: p.timeZone,
    cuisines: p.cuisines,
    dietaryRestrictions: p.dietaryRestrictions,
    equipment: p.equipment,
    nutritionPreference: p.nutritionPreference,
    regularGroceries: p.regularGroceries,
    preferredStores: p.preferredStores,
    units: p.units,
    weekStartDay: p.weekStartDay,
    difficulty: p.difficulty,
    nextDayLeftovers: p.nextDayLeftovers ? 'Yes' : 'No',
    allowFreezing: p.allowFreezing ? 'Yes' : 'No',
    breakfasts: String(p.mealsPerWeek.breakfasts),
    lunches: String(p.mealsPerWeek.lunches),
    dinners: String(p.mealsPerWeek.dinners),
  };
}

export function ProfileFields({
  preferences,
  disabled,
  onSave,
}: {
  preferences: Preferences;
  disabled: boolean;
  onSave: (p: Preferences) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(() => makeDraft(preferences));
  const [validation, setValidation] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(makeDraft(preferences));
  useEffect(() => {
    setDraft(makeDraft(preferences));
    setValidation('');
  }, [preferences]);
  async function submit() {
    const result = preferencesSchema.safeParse({
      ...preferences,
      ...draft,
      onboardingCompleted: true,
      nextDayLeftovers: draft.nextDayLeftovers === 'Yes',
      allowFreezing: draft.allowFreezing === 'Yes',
      people: Number(draft.people),
      cookingSessions: Number(draft.cookingSessions),
      recentRecipeDays: Number(draft.recentRecipeDays),
      portions: Number(draft.portions),
      maxMinutes: Number(draft.maxMinutes),
      weeklyBudgetCents: Math.round(Number(draft.weeklyBudget) * 100),
      mealsPerWeek: {
        breakfasts: Number(draft.breakfasts),
        lunches: Number(draft.lunches),
        dinners: Number(draft.dinners),
      },
    });
    if (!result.success) {
      setValidation(
        result.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('\n'),
      );
      return;
    }
    setValidation('');
    setSaving(true);
    setSavedAt(null);
    try {
      if (await onSave(result.data)) setSavedAt(new Date());
      else setValidation('Your changes were not saved. Please try again.');
    } catch {
      setValidation('Your changes were not saved. Please try again.');
    } finally {
      setSaving(false);
    }
  }
  const singleFields = [
    ['people', 'People to cook for', range(1, 12)],
    ['cookingSessions', 'Cooking sessions per week', range(1, 7)],
    [
      'recentRecipeDays',
      'Avoid recent recipes when planning (days; 0 allows repeats)',
      ['0', '7', '14', '28', '56'],
    ],
    ['portions', 'Portions per cooking session', range(1, 12)],
    [
      'maxMinutes',
      'Maximum cooking time (minutes)',
      ['15', '20', '30', '45', '60', '90', '120'],
    ],
    [
      'weeklyBudget',
      'Default weekly grocery budget (USD)',
      ['50', '75', '100', '125', '150', '175', '200', '250'],
    ],
    [
      'timeZone',
      'Time zone',
      [
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'America/Phoenix',
        'America/Anchorage',
        'Pacific/Honolulu',
        'Europe/London',
        'Europe/Dublin',
        'UTC',
      ],
    ],
  ] as const;
  return (
    <View>
      <Text style={styles.label}>Name (optional)</Text>
      <TextInput
        accessibilityLabel="Name (optional)"
        value={draft.displayName}
        maxLength={80}
        editable={!disabled}
        style={styles.input}
        onChangeText={(displayName) =>
          setDraft((current) => ({ ...current, displayName }))
        }
      />
      <Text style={styles.heading}>Your cooking routine</Text>
      {singleFields.map(([key, label, options]) => (
        <Suggestions
          key={key}
          label={label}
          values={[draft[key]]}
          options={[...options]}
          disabled={disabled}

          numeric={key !== 'timeZone'}
          onChange={(values) =>
            setDraft((current) => ({ ...current, [key]: values[0] }))
          }
        />
      ))}
      <Text style={styles.heading}>Taste & dietary needs</Text>
      <Suggestions
        label="Favorite cuisines"
        values={draft.cuisines}
        options={cuisines}
        disabled={disabled}
        multiple
        emptyLabel="No cuisine preference"
        onChange={(values) =>
          setDraft((current) => ({ ...current, cuisines: values }))
        }
      />
      <Suggestions
        label="Dietary restrictions"
        values={draft.dietaryRestrictions}
        options={diets}
        disabled={disabled}
        multiple
        emptyLabel="None"
        onChange={(values) =>
          setDraft((current) => ({ ...current, dietaryRestrictions: values }))
        }
      />
      <Text style={styles.heading}>Meals to plan each week</Text>
      {(
        [
          [
            'equipment',
            'Kitchen equipment',
            ['Stovetop', 'Oven', 'Air fryer', 'Ninja blender', 'Microwave'],
          ],
          [
            'regularGroceries',
            'Regular groceries',
            [
              'Fruit',
              'Yogurt',
              'Bagels',
              'Eggs',
              'Cheese',
              'Sausage',
              'Avocados',
            ],
          ],
          [
            'preferredStores',
            'Preferred stores',
            ['Whole Foods', 'Wegmans', "Shaw's", "Trader Joe's"],
          ],
        ] as const
      ).map(([key, label, options]) => (
        <Suggestions
          key={key}
          label={label}
          values={draft[key]}
          options={[...options]}
          disabled={disabled}
          multiple
          onChange={(values) =>
            setDraft((current) => ({ ...current, [key]: values }))
          }
        />
      ))}
      <Suggestions
        label="Difficulty"
        values={draft.difficulty}
        options={['simple', 'moderate']}
        multiple
        disabled={disabled}
        onChange={(values) =>
          setDraft((current) => ({
            ...current,
            difficulty: values as Preferences['difficulty'],
          }))
        }
      />
      {(
        [
          [
            'nutritionPreference',
            'Meal preference',
            ['Whole-food and balanced', 'No preference'],
          ],
          ['units', 'Units', ['US customary', 'Metric']],
          ['weekStartDay', 'Week starts on', ['Monday', 'Sunday']],
          ['nextDayLeftovers', 'Prefer next-day leftovers', ['Yes', 'No']],
          ['allowFreezing', 'Plan meals for freezing', ['Yes', 'No']],
        ] as const
      ).map(([key, label, options]) => (
        <Suggestions
          key={key}
          label={label}
          values={[draft[key]]}
          options={[...options]}
          disabled={disabled}
          onChange={(values) =>
            setDraft((current) => ({ ...current, [key]: values[0] }))
          }
        />
      ))}
      <Text style={styles.help}>
        Set your weekly meal targets, including leftovers.
      </Text>
      {(['breakfasts', 'lunches', 'dinners'] as const).map((key) => (
        <Suggestions
          key={key}
          label={`${key[0].toUpperCase()}${key.slice(1)} per week`}
          values={[draft[key]]}
          options={range(0, 7)}
          disabled={disabled}
          onChange={(values) =>
            setDraft((current) => ({ ...current, [key]: values[0] }))
          }
        />
      ))}
      <Text style={styles.help}>
        Budget in USD. These defaults apply to discovery and future planning.
      </Text>
      {!!validation && (
        <Text accessibilityRole="alert" style={styles.error}>
          {validation}
        </Text>
      )}
      <View
        accessibilityLiveRegion="polite"
        style={[
          styles.saveStatus,
          savedAt && !dirty && !validation && !saving
            ? styles.savedStatus
            : styles.pendingStatus,
        ]}
      >
        <Text style={styles.statusTitle}>
          {saving
            ? 'Saving your preferences...'
            : validation
              ? 'Changes not saved'
              : dirty
                ? 'Unsaved changes'
                : savedAt
                  ? 'Profile preferences saved'
                  : 'Your profile preferences'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={disabled || saving || (!!savedAt && !dirty && !validation)}
        style={[
          styles.button,
          (disabled || saving || (!!savedAt && !dirty && !validation)) &&
            (disabled || saving ? styles.disabled : styles.savedButton),
        ]}
        onPress={() => void submit()}
      >
        <Text style={styles.buttonText}>
          {saving
            ? 'Saving...'
            : savedAt && !dirty && !validation
              ? '\u2713 Saved'
              : 'Save changes'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  saveStatus: { paddingVertical: 8, marginTop: 12 },
  savedButton: { backgroundColor: '#526443', opacity: 1 },
  savedStatus: { backgroundColor: '#E9EEDF', borderRadius: 12, padding: 14 },
  pendingStatus: { borderBottomColor: '#9A895E' },
  statusTitle: {
    fontWeight: '400',
    color: '#58665E',
    fontSize: 12,
  },
  statusDetail: { color: '#37463B', fontSize: 14, lineHeight: 20 },
  field: { marginVertical: 5 },
  label: { color: '#50585B', fontSize: 12, marginBottom: 5 },
  heading: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8A4935',
    marginTop: 24,
    marginBottom: 12,
  },
  help: { fontSize: 14, color: '#50585B', lineHeight: 21, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#DDDCD5',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 12,
    fontSize: 14,
    minHeight: 48,
    marginBottom: 2,
  },
  value: { fontSize: 14, color: '#25292B' },
  overlay: {
    flex: 1,
    backgroundColor: '#0008',
    justifyContent: 'center',
    padding: 20,
  },
  dialog: {
    backgroundColor: '#F6F5F1',
    borderRadius: 18,
    padding: 20,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
  },
  option: { padding: 14, minHeight: 48, borderRadius: 8, marginBottom: 4 },
  selected: { backgroundColor: '#E5E9E9' },
  button: {
    backgroundColor: '#435F50',
    borderRadius: 8,
    padding: 15,
    minHeight: 48,
    alignItems: 'center',
    marginVertical: 8,
  },
  buttonText: { color: '#FFF', fontWeight: '700' },
  disabled: { opacity: 0.5 },
  error: { color: '#842D2D', marginVertical: 10 },
});
