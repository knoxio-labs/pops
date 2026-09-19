/**
 * Handler for the `search.*` sub-router — inventory's slice of unified
 * search, and (Inventory ADR-002, POPS-3329) the web/MCP search surface D1
 * describes: a server-side ranker over `items_fts` (trigram FTS5) that
 * agrees with the phone's own ranking (`InventoryReplica/ReplicaSearch.swift`)
 * on which of three tiers a hit falls into — a name that starts with the
 * query, a name that merely contains it, or a match on some other indexed
 * field — while breaking ties inside a tier by `bm25()` (SQLite's own
 * relevance score; more negative is a better match) rather than the phone's
 * alphabetical order, since the server has no equivalent reason to prefer
 * one name over another once the tier is settled.
 *
 * A query of fewer than three characters has no trigram to look up (SQLite's
 * trigram tokenizer indexes runs of three characters) and falls back to a
 * `LIKE` scan across the same columns, un-ranked beyond the tier and name
 * order — the same threshold and fallback the phone uses.
 *
 * Only active, non-tombstoned items are matched: `items_fts` is never
 * pruned when an item is deleted or retired (nothing does that yet), and
 * the contract's filter vocabulary has no "include inactive" toggle for
 * this pillar's slice of unified search — see the inventory web read
 * endpoints (`rest-web.ts`) for the item catalogue's own inactive-inclusive
 * listing.
 *
 * `query.filters` is read by `searchFilterScope` into a scope applied
 * before ranking, before the budget is spent — the same order purchases and
 * finance narrow in — so an excluded row can never occupy a slot in the
 * capped `limit` that a caller asked not to see. An unreadable filter
 * refuses the whole request (`ValidationError` → 400) rather than dropping
 * it: a silently dropped filter looks identical to a filter that matched
 * everything, which is the defect this exists to fix.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  items,
  type InventoryDb,
  type InventorySearchScope,
  type ItemRow,
  searchFilterScope,
} from '../../db/index.js';
import { ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { SQL } from 'drizzle-orm';

import type { inventorySearchContract } from '../../contract/rest-search.js';

type Req = ServerInferRequest<typeof inventorySearchContract>;

const DEFAULT_LIMIT = 20;
/** How many FTS/LIKE candidates ranking may consider before the limit caps the response. */
const CANDIDATE_BUDGET = 200;
/** A trigram needs three characters; shorter queries fall back to `LIKE`. */
const MIN_TRIGRAM_LENGTH = 3;

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

/** One of the three ranking tiers ADR-002 describes, best first. */
const enum Tier {
  NamePrefix = 0,
  NameContains = 1,
  OtherField = 2,
}

const ftsHitSchema = z.array(z.object({ id: z.string(), rank: z.number().nullable() }));
type FtsHit = z.infer<typeof ftsHitSchema>[number];

function rowToData(row: ItemRow): InventoryItemHitData {
  return {
    itemName: row.name,
    assetId: row.code,
    location: row.locationText,
    type: row.legacyType,
    condition: row.condition,
  };
}

/**
 * The `items` columns a filter scope narrows on. Applied on top of the FTS
 * or `LIKE` candidate set so an excluded row is never scanned into the
 * capped result, rather than filtered out of one already at its limit.
 */
function scopeConditions(scope: InventorySearchScope): SQL[] {
  const conditions: SQL[] = [];
  if (scope.room !== undefined) conditions.push(eq(items.room, scope.room));
  if (scope.type !== undefined) conditions.push(eq(items.legacyType, scope.type));
  if (scope.condition !== undefined) {
    conditions.push(sql`lower(${items.condition}) = lower(${scope.condition})`);
  }
  if (scope.inUse !== undefined) conditions.push(eq(items.inUse, scope.inUse ? 1 : 0));
  if (scope.deductible !== undefined) {
    conditions.push(eq(items.deductible, scope.deductible ? 1 : 0));
  }
  if (scope.locationId !== undefined) {
    conditions.push(eq(items.locationId, scope.locationId));
  }
  if (scope.assetId !== undefined) conditions.push(eq(items.code, scope.assetId));
  return conditions;
}

/** A phrase query for FTS5's trigram tokenizer: the whole string as one substring lookup. */
function trigramPhrase(text: string): string {
  return `"${text.replace(/"/g, '""')}"`;
}

/** `text` with LIKE's own wildcards escaped, so a caller's literal `%`/`_` cannot widen the scan. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const FTS_COLUMNS = ['name', 'code', 'note', 'type_label', 'field_text', 'external_ids'] as const;

/** Candidate ids via the trigram index, each with its `bm25` relevance (more negative is better). */
function ftsCandidates(db: InventoryDb, text: string): FtsHit[] {
  const rows = db.all(sql`
    SELECT id, bm25(items_fts) as rank FROM items_fts
    WHERE items_fts MATCH ${trigramPhrase(text)}
    ORDER BY rank
    LIMIT ${CANDIDATE_BUDGET}
  `);
  return ftsHitSchema.parse(rows);
}

/** Candidate ids via `LIKE`, for a query too short for the trigram index. Unranked (`rank: null`). */
function likeCandidates(db: InventoryDb, text: string): FtsHit[] {
  const pattern = `%${escapeLike(text)}%`;
  const perColumn = FTS_COLUMNS.map(
    (col) => sql`${sql.identifier(col)} LIKE ${pattern} ESCAPE '\\'`
  );
  const clause = sql.join(perColumn, sql` OR `);
  const rows = db.all(sql`
    SELECT id, NULL as rank FROM items_fts
    WHERE (${clause})
    LIMIT ${CANDIDATE_BUDGET}
  `);
  return ftsHitSchema.parse(rows);
}

function candidatesFor(db: InventoryDb, text: string): FtsHit[] {
  return text.length >= MIN_TRIGRAM_LENGTH ? ftsCandidates(db, text) : likeCandidates(db, text);
}

/** The tier a row's name places it in; `null` means it matched only some other field. */
function nameTier(name: string, lowerText: string): Tier.NamePrefix | Tier.NameContains | null {
  const lowerName = name.toLowerCase();
  if (lowerName.startsWith(lowerText)) return Tier.NamePrefix;
  if (lowerName.includes(lowerText)) return Tier.NameContains;
  return null;
}

/** `Tier.NamePrefix` scores highest; each tier maps to a fixed point on the shared 0–1 search scale. */
function scoreFor(tier: Tier): number {
  switch (tier) {
    case Tier.NamePrefix:
      return 1.0;
    case Tier.NameContains:
      return 0.7;
    case Tier.OtherField:
      return 0.4;
  }
}

interface RankedHit {
  readonly row: ItemRow;
  readonly tier: Tier;
  readonly matchType: 'exact' | 'prefix' | 'contains';
  readonly rank: number | null;
}

function matchTypeFor(tier: Tier, name: string, lowerText: string): RankedHit['matchType'] {
  if (tier !== Tier.NamePrefix) return 'contains';
  return name.toLowerCase() === lowerText ? 'exact' : 'prefix';
}

function rank(row: ItemRow, lowerText: string, ftsRank: number | null): RankedHit {
  const tier = nameTier(row.name, lowerText) ?? Tier.OtherField;
  return { row, tier, matchType: matchTypeFor(tier, row.name, lowerText), rank: ftsRank };
}

/** Tier ascending, then `bm25` ascending (more negative first); a row with no rank sorts by name. */
function byTierThenRelevance(a: RankedHit, b: RankedHit): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
  if (a.rank !== b.rank) return a.rank === null ? 1 : -1;
  return a.row.name.localeCompare(b.row.name);
}

function toHit(ranked: RankedHit): SearchHit {
  const { row, tier, matchType } = ranked;
  return {
    uri: `/inventory/items/${row.id}`,
    score: scoreFor(tier),
    matchField: tier === Tier.OtherField ? 'fts' : 'itemName',
    matchType,
    data: rowToData(row),
  };
}

function searchItems(db: InventoryDb, text: string, scope: InventorySearchScope): SearchHit[] {
  const lowerText = text.toLowerCase();
  const candidates = candidatesFor(db, lowerText);
  if (candidates.length === 0) return [];

  const rankById = new Map(candidates.map((c) => [c.id, c.rank]));
  const rows = db
    .select()
    .from(items)
    .where(
      and(
        inArray(
          items.id,
          candidates.map((c) => c.id)
        ),
        isNull(items.deletedAt),
        eq(items.lifecycle, 'active'),
        ...scopeConditions(scope)
      )
    )
    .all();

  return rows
    .map((row) => rank(row, lowerText, rankById.get(row.id) ?? null))
    .toSorted(byTierThenRelevance)
    .slice(0, DEFAULT_LIMIT)
    .map(toHit);
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
