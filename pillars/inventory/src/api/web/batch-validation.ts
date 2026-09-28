import { and, eq, isNull } from 'drizzle-orm';

import { loadPublishedCatalogue } from '../../catalogue/index.js';
import {
  type WebBatchBody,
  type WebBatchColumn,
  type WebBatchResponse,
} from '../../contract/rest-web-batch.js';
import { items, locations } from '../../db/index.js';

import type { PersistedCatalogue, PersistedItemType } from '../../catalogue/index.js';
import type { CommandDb, Placement } from '../../domain/commands/index.js';

/** One row after the web batch request schema has supplied empty-cell defaults. */
export type WebBatchRow = WebBatchBody['rows'][number];

/** One cell issue produced before a row reaches the command layer. */
export type WebBatchIssue = Extract<
  WebBatchResponse['outcomes'][number],
  { status: 'invalid' }
>['issues'][number];

interface WhereTarget {
  readonly placement: Placement;
}

/** Database facts shared by every row in one web batch request. */
export interface WebBatchContext {
  readonly catalogue: PersistedCatalogue | null;
  readonly codeHolders: ReadonlyMap<string, string>;
  readonly whereTargets: ReadonlyMap<string, readonly WhereTarget[]>;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function addWhereTarget(
  targets: Map<string, WhereTarget[]>,
  name: string,
  placement: Placement
): void {
  const key = normalized(name);
  const existing = targets.get(key);
  if (existing === undefined) targets.set(key, [{ placement }]);
  else existing.push({ placement });
}

function readWhereTargets(db: CommandDb): ReadonlyMap<string, readonly WhereTarget[]> {
  const targets = new Map<string, WhereTarget[]>();
  for (const location of db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(isNull(locations.deletedAt))
    .all()) {
    addWhereTarget(targets, location.name, { kind: 'location', locationId: location.id });
  }
  for (const container of db
    .select({ id: items.id, name: items.name })
    .from(items)
    .where(and(isNull(items.deletedAt), eq(items.lifecycle, 'active'), eq(items.isContainer, 1)))
    .all()) {
    addWhereTarget(targets, container.name, { kind: 'container', itemId: container.id });
  }
  return targets;
}

function readCodeHolders(db: CommandDb): ReadonlyMap<string, string> {
  const holders = new Map<string, string>();
  for (const item of db
    .select({ code: items.code, name: items.name })
    .from(items)
    .where(isNull(items.deletedAt))
    .all()) {
    if (item.code !== null) holders.set(normalized(item.code), item.name);
  }
  return holders;
}

/** Read the catalogue, live codes, and resolvable web destinations once per request. */
export function createWebBatchContext(db: CommandDb): WebBatchContext {
  return {
    catalogue: loadPublishedCatalogue(db),
    codeHolders: readCodeHolders(db),
    whereTargets: readWhereTargets(db),
  };
}

/** Resolve a non-archived published type by its case-insensitive display label. */
export function resolveBatchType(
  catalogue: PersistedCatalogue | null,
  value: string
): PersistedItemType | null | undefined {
  const key = normalized(value);
  if (key === '') return null;
  return catalogue?.types.find(
    (type) => type.archivedAt === null && normalized(type.label) === key
  );
}

function quantityIssue(
  row: WebBatchRow,
  type: PersistedItemType | null | undefined
): { code: 'quantity_invalid' | 'quantity_container'; message: string } | null {
  const value = row.quantity.trim();
  if (value === '') return null;
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    return { code: 'quantity_invalid', message: 'Quantity is a whole number, 1 or more.' };
  }
  if (type?.effectiveCapabilities.includes('containment') === true && Number(value) > 1) {
    return {
      code: 'quantity_container',
      message: `A ${type.label} is a container, so its quantity is 1.`,
    };
  }
  return null;
}

function codeIssue(
  row: WebBatchRow,
  rowIndex: number,
  rows: readonly WebBatchRow[],
  codeHolders: ReadonlyMap<string, string>
): string | null {
  const code = normalized(row.code);
  if (code === '') return null;
  const holder = codeHolders.get(code);
  if (holder !== undefined) return `Code ${row.code.trim().toUpperCase()} is already on ${holder}.`;
  const firstDuplicate = rows.findIndex(
    (other, index) => index !== rowIndex && normalized(other.code) === code
  );
  return firstDuplicate === -1
    ? null
    : `Code ${row.code.trim().toUpperCase()} is also on row ${String(firstDuplicate + 1)}.`;
}

function whereIssue(
  row: WebBatchRow,
  whereTargets: ReadonlyMap<string, readonly WhereTarget[]>
): string | null {
  const value = normalized(row.where);
  if (value === '') return null;
  return whereTargets.get(value)?.length === 1
    ? null
    : `No place or container is called ${row.where.trim()}.`;
}

/** Whether all six cells in a web batch row are empty after trimming. */
export function isBlankWebBatchRow(row: WebBatchRow): boolean {
  return Object.values(row).every((cell) => cell.trim() === '');
}

/** Validate one non-blank row against the request's stable database context. */
export function webBatchRowIssues(
  rows: readonly WebBatchRow[],
  rowIndex: number,
  context: WebBatchContext
): WebBatchIssue[] {
  const row = rows[rowIndex];
  if (row === undefined || isBlankWebBatchRow(row)) return [];
  const type = resolveBatchType(context.catalogue, row.type);
  const issues: WebBatchIssue[] = [];
  const add = (column: WebBatchColumn, code: string, message: string | null): void => {
    if (message !== null) issues.push({ column, code, message });
  };

  add('name', 'name_required', row.name.trim() === '' ? 'Name is required.' : null);
  add(
    'type',
    'type_unknown',
    type === undefined
      ? `No type is called ${row.type.trim()}. Leave it blank to file the item untyped.`
      : null
  );
  const quantityProblem = quantityIssue(row, type);
  if (quantityProblem !== null) issues.push({ column: 'quantity', ...quantityProblem });
  const codeMessage = codeIssue(row, rowIndex, rows, context.codeHolders);
  if (codeMessage !== null) {
    issues.push({
      column: 'code',
      code: context.codeHolders.has(normalized(row.code)) ? 'code_taken' : 'code_duplicate',
      message: codeMessage,
    });
  }
  add('where', 'where_unresolved', whereIssue(row, context.whereTargets));
  return issues;
}

/** Resolve a row's Where cell, falling back to the request destination. */
export function placementForWebBatchRow(
  row: WebBatchRow,
  context: WebBatchContext,
  destination: Placement
): Placement {
  const where = normalized(row.where);
  if (where === '') return destination;
  const target = context.whereTargets.get(where);
  const firstTarget = target?.length === 1 ? target[0] : undefined;
  return firstTarget?.placement ?? destination;
}
