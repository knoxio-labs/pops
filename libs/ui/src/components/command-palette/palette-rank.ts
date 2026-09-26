import type { PaletteCommand } from './types';

function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .trim();
}

/** Ranks a query against a label and optional keywords on a scale from zero to three. */
export function rankMatch(query: string, label: string, keywords: readonly string[] = []): number {
  const normalisedQuery = normalise(query);
  if (normalisedQuery === '') return 1;

  const normalisedLabel = normalise(label);
  if (
    normalisedLabel.startsWith(normalisedQuery) ||
    normalisedLabel.split(/\s+/u).some((word) => word.startsWith(normalisedQuery))
  ) {
    return 3;
  }
  if (normalisedLabel.includes(normalisedQuery)) return 2;
  return keywords.some((keyword) => normalise(keyword).includes(normalisedQuery)) ? 1 : 0;
}

/** Drops non-matches and sorts entries by rank while preserving source order for ties. */
export function rankEntries<C extends PaletteCommand>(query: string, entries: readonly C[]): C[] {
  return entries
    .map((entry, index) => ({ entry, index, rank: rankMatch(query, entry.label, entry.keywords) }))
    .filter((scored) => scored.rank > 0)
    .toSorted((a, b) => b.rank - a.rank || a.index - b.index)
    .map((scored) => scored.entry);
}
