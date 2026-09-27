import { Search } from 'lucide-react';

import type {
  PaletteCommand as UiPaletteCommand,
  PaletteSection as UiPaletteSection,
  PaletteSource as UiPaletteSource,
  PaletteStatus,
  PaletteStep,
} from '@pops/ui';

/** The two scopes available from the inventory command palette. */
export type PaletteScope = 'inventory' | 'purchases';

/** The argument kinds the inventory palette can ask for after a command. */
export type PaletteArgumentKind = 'placement';

/** The action a selected inventory palette command performs. */
export type PaletteCommandAction =
  | { kind: 'navigate'; href: string }
  | { kind: 'open-item'; id: string }
  | { kind: 'open-location'; id: string }
  | { kind: 'move'; itemId: string }
  | { kind: 'pick-up'; itemId: string }
  | { kind: 'put-back'; itemId: string }
  | { kind: 'set-access'; itemId: string; access: 'open' | 'closed' }
  | { kind: 'copy-code'; code: string };

/** An inventory palette entry with its typed application action. */
export interface InventoryPaletteCommand extends UiPaletteCommand {
  action: PaletteCommandAction;
  shortcutId?: string;
  target?: { kind: 'location'; locationId: string } | { kind: 'container'; containerId: string };
}

/** The source data used to derive the generic UI palette source. */
export interface PaletteSource {
  commands: readonly InventoryPaletteCommand[];
  inventoryRecords: readonly InventoryPaletteCommand[];
  purchaseRecords: readonly InventoryPaletteCommand[];
  recents: readonly InventoryPaletteCommand[];
  arguments: Readonly<Partial<Record<PaletteArgumentKind, readonly InventoryPaletteCommand[]>>>;
  status: (query: string, scope: PaletteScope, step: PaletteStep | null) => PaletteStatus;
}

/** The ordered scopes shown in the palette header. */
export const PALETTE_SCOPES = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'purchases', label: 'Purchases' },
] as const;

const GROUP_TITLES: Readonly<Record<string, string>> = {
  recents: 'Recent',
  'this-item': 'This item',
  commands: 'Commands',
  'jump-to': 'Jump to',
  records: 'Items and places',
};

const GROUP_LIMITS: Readonly<Record<string, number>> = {
  recents: 5,
  'this-item': 4,
  commands: 5,
  'jump-to': 4,
  records: 8,
};

/** Ranks palette text using the shared command-palette matcher. */
export function rankMatch(query: string, label: string, keywords: readonly string[] = []): number {
  const normalisedQuery = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .trim();
  if (normalisedQuery === '') return 1;

  const normalisedLabel = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase();
  if (
    normalisedLabel.startsWith(normalisedQuery) ||
    normalisedLabel.split(/\s+/u).some((word) => word.startsWith(normalisedQuery))
  ) {
    return 3;
  }
  if (normalisedLabel.includes(normalisedQuery)) return 2;
  return keywords.some((keyword) => {
    const normalisedKeyword = keyword
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/gu, '')
      .toLowerCase();
    return normalisedKeyword.includes(normalisedQuery);
  })
    ? 1
    : 0;
}

/** Drops non-matches and ranks entries while preserving source order for ties. */
export function rankEntries<C extends UiPaletteCommand>(query: string, entries: readonly C[]): C[] {
  return entries
    .map((entry, index) => ({
      entry,
      index,
      rank: rankMatch(query, entry.label, entry.keywords),
    }))
    .filter((scored) => scored.rank > 0)
    .toSorted((left, right) => right.rank - left.rank || left.index - right.index)
    .map((scored) => scored.entry);
}

function section(
  id: string,
  entries: readonly InventoryPaletteCommand[]
): UiPaletteSection<InventoryPaletteCommand> {
  const limit = GROUP_LIMITS[id];
  return {
    id,
    title: GROUP_TITLES[id] ?? id,
    entries: limit === undefined ? [...entries] : entries.slice(0, limit),
  };
}

function commandsInGroup(source: PaletteSource, group: string): InventoryPaletteCommand[] {
  return source.commands.filter((command) => command.group === group);
}

function argumentEntries(
  source: PaletteSource,
  argument: string
): readonly InventoryPaletteCommand[] {
  if (argument !== 'placement') return [];
  return source.arguments.placement ?? [];
}

/** Derives the visible groups for a query, scope, and argument step. */
export function buildSections(
  query: string,
  scope: PaletteScope,
  step: PaletteStep | null,
  source: PaletteSource
): UiPaletteSection<InventoryPaletteCommand>[] {
  if (step !== null) {
    const options = rankEntries(query, argumentEntries(source, step.argument));
    return options.length === 0 ? [] : [{ id: 'argument', title: step.label, entries: options }];
  }

  if (scope === 'purchases') {
    const records = section('records', rankEntries(query, source.purchaseRecords));
    return records.entries.length === 0 ? [] : [records];
  }

  const sections =
    query.trim() === ''
      ? [
          section('recents', source.recents),
          section('this-item', commandsInGroup(source, 'this-item')),
          section('commands', commandsInGroup(source, 'commands')),
        ]
      : [
          section('this-item', rankEntries(query, commandsInGroup(source, 'this-item'))),
          section('records', rankEntries(query, source.inventoryRecords)),
          section('commands', rankEntries(query, commandsInGroup(source, 'commands'))),
          section('jump-to', rankEntries(query, commandsInGroup(source, 'jump-to'))),
        ];

  return sections.filter((candidate) => candidate.entries.length > 0);
}

/** The id of the row that hands a query to the Search page. */
export const SEE_ALL_RESULTS_ID = 'see-all-results';

/** Builds the Search route for a trimmed palette query and scope. */
export function searchResultsHref(query: string, scope: PaletteScope): string {
  const params = new URLSearchParams({ q: query.trim() });
  if (scope === 'purchases') params.set('scope', 'purchases');
  return `/inventory/search?${params.toString()}`;
}

/** Creates the final palette row that hands a non-step query to Search. */
export function seeAllResultsEntry(
  query: string,
  scope: PaletteScope,
  step: PaletteStep | null
): InventoryPaletteCommand | null {
  const trimmed = query.trim();
  if (trimmed === '' || step !== null) return null;
  return {
    id: SEE_ALL_RESULTS_ID,
    label: 'See all results in Search',
    group: 'search',
    icon: Search,
    detail: `“${trimmed}” in ${scope === 'inventory' ? 'Inventory' : 'Purchases'}`,
    action: { kind: 'navigate', href: searchResultsHref(trimmed, scope) },
  };
}

/** Returns the placeholder for the active palette scope and argument step. */
export function palettePlaceholder(scope: PaletteScope, step: PaletteStep | null): string {
  if (step?.argument === 'placement') return 'Where to? Search places and containers';
  return scope === 'purchases'
    ? 'Search purchases by merchant, item or order number'
    : 'Search items, places and codes, or type a command';
}

/** Adapts inventory-owned groups and status to the generic UI palette contract. */
export function toUiPaletteSource(source: PaletteSource): UiPaletteSource<InventoryPaletteCommand> {
  return {
    scopes: PALETTE_SCOPES,
    commands: source.commands,
    sections: (query, scope, step) =>
      buildSections(query, scope === 'purchases' ? 'purchases' : 'inventory', step, source),
    seeAll: (query, scope, step) =>
      seeAllResultsEntry(query, scope === 'purchases' ? 'purchases' : 'inventory', step),
    placeholder: (scope, step) =>
      palettePlaceholder(scope === 'purchases' ? 'purchases' : 'inventory', step),
    status: (query, scope, step) =>
      source.status(query, scope === 'purchases' ? 'purchases' : 'inventory', step),
  };
}
