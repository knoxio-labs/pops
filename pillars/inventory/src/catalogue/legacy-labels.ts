/** Normalize and deduplicate legacy labels exactly as the web item's legacy-label filter does. */
export function normalizeLegacyLabels(labels: readonly string[]): string[] {
  return [...new Set(labels.map((label) => label.trim().toLowerCase()).filter(Boolean))];
}
