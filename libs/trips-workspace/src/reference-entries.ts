/** Stable occurrence keys retain duplicate opaque references without treating an array position as identity. */
export function referenceEntries<T extends { uri: string; label?: string }>(
  links: readonly T[]
): { link: T; index: number; key: string }[] {
  const occurrences = new Map<string, number>();
  return links.map((link, index) => {
    const content = JSON.stringify(link);
    const occurrence = occurrences.get(content) ?? 0;
    occurrences.set(content, occurrence + 1);
    return { link, index, key: `${content}:${occurrence}` };
  });
}
