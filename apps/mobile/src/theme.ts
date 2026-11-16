export const theme = {
  canvas: '#F8F7F2',
  paper: '#FFFFFF',
  ink: '#252D26',
  muted: '#626D61',
  olive: '#526443',
  sage: '#E9EEDF',
  line: '#E2E5D9',
  accent: '#DFEDAC',
  peach: '#F5E8DA',
};

// Shared by every meal category surface; recipe IDs never determine color.
export const mealColors = {
  breakfast: { background: '#EFEBDD', foreground: '#625B46' },
  lunch: { background: theme.sage, foreground: theme.olive },
  dinner: { background: '#D9E0CD', foreground: '#435337' },
  side: { background: theme.peach, foreground: '#775A45' },
};
export function mealColor(category: string | null | undefined) {
  return (
    mealColors[category as keyof typeof mealColors] ?? {
      background: theme.sage,
      foreground: theme.olive,
    }
  );
}
