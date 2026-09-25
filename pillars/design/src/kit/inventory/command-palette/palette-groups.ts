/**
 * How the palette ranks and groups what it can show. Ranking follows iOS
 * universal search: a label that starts with the query beats one that
 * contains it, which beats a match only in other fields (codes, paths).
 */
import type { PaletteArgumentKind, PaletteCommand, PaletteGroupId } from '../shared/contracts';

/** The palette's search scopes, which Tab cycles. */
export type PaletteScope = 'inventory' | 'purchases';

/** One argument step: a command waiting for its target. */
export interface PaletteStep {
  commandId: string;
  label: string;
  argument: PaletteArgumentKind;
}

/** Everything the palette can offer, supplied by the page it opens over. */
export interface PaletteSource {
  commands: readonly PaletteCommand[];
  inventoryRecords: readonly PaletteCommand[];
  purchaseRecords: readonly PaletteCommand[];
  recents: readonly PaletteCommand[];
  arguments: Readonly<Partial<Record<PaletteArgumentKind, readonly PaletteCommand[]>>>;
}

/** One rendered group. */
export interface PaletteSection {
  id: PaletteGroupId | 'argument';
  title: string;
  entries: PaletteCommand[];
}

const TITLES: Readonly<Record<PaletteGroupId, string>> = {
  recents: 'Recent',
  'this-item': 'This item',
  commands: 'Commands',
  'jump-to': 'Jump to',
  records: 'Items and places',
};

const LIMITS: Readonly<Record<PaletteGroupId, number>> = {
  recents: 5,
  'this-item': 4,
  commands: 5,
  'jump-to': 4,
  records: 8,
};

function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .trim();
}

/** 3 label prefix (or a word in it), 2 label contains, 1 another field, 0 no match. */
export function rankMatch(query: string, label: string, keywords: readonly string[] = []): number {
  const q = normalise(query);
  if (q === '') return 1;
  const text = normalise(label);
  if (text.startsWith(q) || text.split(/\s+/u).some((word) => word.startsWith(q))) return 3;
  if (text.includes(q)) return 2;
  return keywords.some((keyword) => normalise(keyword).includes(q)) ? 1 : 0;
}

/** Entries matching `query`, best first; ties keep the source order. */
export function rankEntries(query: string, entries: readonly PaletteCommand[]): PaletteCommand[] {
  return entries
    .map((entry, index) => ({ entry, index, rank: rankMatch(query, entry.label, entry.keywords) }))
    .filter((scored) => scored.rank > 0)
    .toSorted((a, b) => b.rank - a.rank || a.index - b.index)
    .map((scored) => scored.entry);
}

function section(id: PaletteGroupId, entries: PaletteCommand[]): PaletteSection {
  return { id, title: TITLES[id], entries: entries.slice(0, LIMITS[id]) };
}

function ofGroup(source: PaletteSource, group: PaletteGroupId): PaletteCommand[] {
  return source.commands.filter((command) => command.group === group);
}

/** The groups to render for a query, scope and step, empty groups dropped. */
export function buildSections(
  query: string,
  scope: PaletteScope,
  step: PaletteStep | null,
  source: PaletteSource
): PaletteSection[] {
  if (step !== null) {
    const options = rankEntries(query, source.arguments[step.argument] ?? []);
    return options.length === 0 ? [] : [{ id: 'argument', title: step.label, entries: options }];
  }
  if (scope === 'purchases') {
    return [section('records', rankEntries(query, source.purchaseRecords))].filter(
      (s) => s.entries.length > 0
    );
  }
  const sections =
    query.trim() === ''
      ? [
          section('recents', [...source.recents]),
          section('this-item', ofGroup(source, 'this-item')),
          section('commands', ofGroup(source, 'commands')),
        ]
      : [
          section('this-item', rankEntries(query, ofGroup(source, 'this-item'))),
          section('records', rankEntries(query, source.inventoryRecords)),
          section('commands', rankEntries(query, ofGroup(source, 'commands'))),
          section('jump-to', rankEntries(query, ofGroup(source, 'jump-to'))),
        ];
  return sections.filter((s) => s.entries.length > 0);
}
