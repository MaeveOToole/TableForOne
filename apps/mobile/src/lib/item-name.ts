export function capitalizeItem(value: string) {
  const text = value.trim();
  return text.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase());
}
