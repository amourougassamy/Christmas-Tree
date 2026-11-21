/** Words are non-empty tokens separated by spaces, tabs, or line breaks. */
export function countMessageWords(value: string): number {
  return value.trim().match(/\S+/gu)?.length ?? 0;
}
