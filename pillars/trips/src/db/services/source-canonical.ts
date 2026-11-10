/** Stable typed request comparison without changing source strings, array order or opaque URLs. */
export function canonicalSourceValue(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry))
      return Object.fromEntries(
        Object.entries(entry).toSorted(([first], [second]) => first.localeCompare(second))
      );
    return entry;
  });
}
