/**
 * Handler for the `search.*` sub-router — inventory's slice of unified search.
 *
 * Ranking runs tiered (assetId exact, then assetId prefix, then itemName) in
 * order against a shared `limit` budget: later tiers stop once the budget is
 * hit, name hits skip uris already seen, and the final list is sorted
 * descending by score and capped at the limit.
 *
 * `query.filters` is read by `searchFilterScope` into a scope applied to
 * every tier's own SQL, before the budget is spent — the same order
 * purchases and finance narrow in — so an excluded row can never occupy a
 * slot in the capped `limit` that a caller asked not to see. An unreadable
 * filter refuses the whole request (`ValidationError` → 400) rather than
 * dropping it: a silently dropped filter looks identical to a filter that
 * matched everything, which is the defect this exists to fix.
 */
import { and, eq, sql } from 'drizzle-orm';

import {
  homeInventory,
  type InventoryDb,
  type InventorySearchScope,
  searchFilterScope,
} from '../../db/index.js';
import { ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { SQL } from 'drizzle-orm';

import type { inventorySearchContract } from '../../contract/rest-search.js';

type Req = ServerInferRequest<typeof inventorySearchContract>;

const DEFAULT_LIMIT = 20;

type Row = typeof homeInventory.$inferSelect;

interface InventoryItemHitData extends Record<string, unknown> {
  itemName: string;
  assetId: string | null;
  location: string | null;
  type: string | null;
  condition: string | null;
}

interface SearchHit {
  uri: string;
  score: number;
  matchField: string;
  matchType: 'exact' | 'prefix' | 'contains';
  data: InventoryItemHitData;
}

function rowToData(row: Row): InventoryItemHitData {
  return {
    itemName: row.itemName,
    assetId: row.assetId,
    location: row.location,
    type: row.type,
    condition: row.condition,
  };
}

/**
 * The `homeInventory` columns a filter scope narrows on. Applied to every
 * tier's own SQL so an excluded row is never scanned in the first place,
 * rather than filtered out of an already-capped result.
 */
function scopeConditions(scope: InventorySearchScope): SQL[] {
  const conditions: SQL[] = [];
  if (scope.room !== undefined) conditions.push(eq(homeInventory.room, scope.room));
  if (scope.type !== undefined) conditions.push(eq(homeInventory.type, scope.type));
  if (scope.condition !== undefined) {
    conditions.push(sql`lower(${homeInventory.condition}) = lower(${scope.condition})`);
  }
  if (scope.inUse !== undefined) conditions.push(eq(homeInventory.inUse, scope.inUse ? 1 : 0));
  if (scope.deductible !== undefined) {
    conditions.push(eq(homeInventory.deductible, scope.deductible ? 1 : 0));
  }
  if (scope.locationId !== undefined) {
    conditions.push(eq(homeInventory.locationId, scope.locationId));
  }
  if (scope.assetId !== undefined) conditions.push(eq(homeInventory.assetId, scope.assetId));
  return conditions;
}

/**
 * Mutable scan state threaded through the ranking tiers. Bundled into one
 * object so each tier stays under the 4-param lint cap.
 */
interface SearchScan {
  readonly db: InventoryDb;
  readonly lowerText: string;
  readonly limit: number;
  readonly hits: SearchHit[];
  readonly conditions: SQL[];
}

function searchAssetExact(scan: SearchScan): void {
  const rows = scan.db
    .select()
    .from(homeInventory)
    .where(and(sql`lower(${homeInventory.assetId}) = ${scan.lowerText}`, ...scan.conditions))
    .all();
  for (const row of rows) {
    scan.hits.push({
      uri: `/inventory/items/${row.id}`,
      score: 1.0,
      matchField: 'assetId',
      matchType: 'exact',
      data: rowToData(row),
    });
  }
}

function searchAssetPrefix(scan: SearchScan): void {
  const rows = scan.db
    .select()
    .from(homeInventory)
    .where(
      and(
        sql`lower(${homeInventory.assetId}) like ${scan.lowerText + '%'} and lower(${homeInventory.assetId}) != ${scan.lowerText}`,
        ...scan.conditions
      )
    )
    .all();
  for (const row of rows) {
    if (scan.hits.length >= scan.limit) break;
    scan.hits.push({
      uri: `/inventory/items/${row.id}`,
      score: 0.9,
      matchField: 'assetId',
      matchType: 'prefix',
      data: rowToData(row),
    });
  }
}

function classifyNameMatch(
  lowerName: string,
  lowerText: string
): { score: number; matchType: 'exact' | 'prefix' | 'contains' } {
  if (lowerName === lowerText) return { score: 0.85, matchType: 'exact' };
  if (lowerName.startsWith(lowerText)) return { score: 0.7, matchType: 'prefix' };
  return { score: 0.5, matchType: 'contains' };
}

function searchByName(scan: SearchScan): void {
  const rows = scan.db
    .select()
    .from(homeInventory)
    .where(
      and(
        sql`lower(${homeInventory.itemName}) like ${'%' + scan.lowerText + '%'}`,
        ...scan.conditions
      )
    )
    .all();

  const seenIds = new Set(scan.hits.map((h) => h.uri));
  for (const row of rows) {
    if (scan.hits.length >= scan.limit) break;
    const uri = `/inventory/items/${row.id}`;
    if (seenIds.has(uri)) continue;
    const { score, matchType } = classifyNameMatch(row.itemName.toLowerCase(), scan.lowerText);
    scan.hits.push({ uri, score, matchField: 'itemName', matchType, data: rowToData(row) });
  }
}

function searchItems(db: InventoryDb, text: string, scope: InventorySearchScope): SearchHit[] {
  const scan: SearchScan = {
    db,
    lowerText: text.toLowerCase(),
    limit: DEFAULT_LIMIT,
    hits: [],
    conditions: scopeConditions(scope),
  };

  searchAssetExact(scan);
  if (scan.hits.length < scan.limit) searchAssetPrefix(scan);
  if (scan.hits.length < scan.limit) searchByName(scan);

  scan.hits.sort((a, b) => b.score - a.score);
  return scan.hits.slice(0, scan.limit);
}

export function makeSearchHandlers(db: InventoryDb) {
  return {
    search: ({ body }: Req['search']) =>
      runHttp(() => {
        const filterResult = searchFilterScope(body.query.filters ?? []);
        if (!filterResult.ok) {
          throw new ValidationError(filterResult.message, { filters: body.query.filters });
        }

        const text = body.query.text.trim();
        if (!text) return { status: 200 as const, body: { hits: [] } };
        return {
          status: 200 as const,
          body: { hits: searchItems(db, text, filterResult.scope) },
        };
      }),
  };
}
