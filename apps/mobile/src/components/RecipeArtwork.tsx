import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { Recipe } from '@meal/contracts';
import { mealColor, theme } from '../theme';

export function RecipeArtwork({ recipe }: { recipe: Recipe }) {
  const [failed, setFailed] = useState(false);
  const colors = mealColor(recipe.category);
  const hasPhoto =
    !failed &&
    !recipe.incomplete &&
    recipe.image_url &&
    recipe.image_permission !== 'none';
  return (
    <View style={[s.cover, { backgroundColor: colors.background }]}>
      {hasPhoto ? (
        <Image
          source={{ uri: recipe.image_url! }}
          accessibilityLabel={recipe.title}
          style={s.photo}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={s.editorial} accessible={false}>
          <View style={s.orbit} />
          <Text style={[s.label, { color: colors.foreground }]}>
            {recipe.incomplete
              ? 'FROM YOUR COLLECTION'
              : 'THE TABLE FOR ONE KITCHEN'}
          </Text>
          <Text numberOfLines={2} style={s.coverTitle}>
            {recipe.category || recipe.cuisine || 'Something delicious'}
          </Text>
          <Text style={[s.footer, { color: colors.foreground }]}>
            {recipe.incomplete ? 'RECIPE NOTES' : 'COOK SOMETHING GOOD'} / T.1
          </Text>
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  cover: { height: 120, borderRadius: 16, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  editorial: {
    flex: 1,
    padding: 18,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  label: {
    color: theme.olive,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  coverTitle: {
    fontFamily: 'Nunito',
    fontSize: 26,
    fontWeight: '800',
    color: theme.ink,
    maxWidth: '85%',
    lineHeight: 29,
  },
  footer: { color: theme.olive, fontSize: 9, letterSpacing: 1.2 },
  orbit: {
    position: 'absolute',
    width: 170,
    height: 170,
    right: -48,
    top: 24,
    borderRadius: 90,
    borderWidth: 22,
    borderColor: '#FFFFFF65',
  },
});
