/**
 * Shapes `engram_index` rows into the metadata every engram hit carries,
 * whichever path found it: scopes and tags from the junction tables plus the
 * index columns the UIs and the context assembler read.
 */
import { and, eq, inArray } from 'drizzle-orm';

import { embeddings, engramScopes, engramTags } from '../../../db/index.js';

import type { CerebrumDb, engramIndex } from '../../../db/index.js';

export type EngramRow = typeof engramIndex.$inferSelect;

export interface EngramJunctions {
  scopesByEngramId: Map<string, string[]>;
  tagsByEngramId: Map<string, string[]>;
}

function bucket(rows: { engramId: string; value: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const { engramId, value } of rows) {
    const values = map.get(engramId);
    if (values) values.push(value);
    else map.set(engramId, [value]);
  }
  return map;
}

/** Scopes and tags for the given engram ids, bucketed by engram. */
export function fetchEngramJunctions(db: CerebrumDb, engramIds: string[]): EngramJunctions {
  const scopeRows = db
    .select({ engramId: engramScopes.engramId, value: engramScopes.scope })
    .from(engramScopes)
    .where(inArray(engramScopes.engramId, engramIds))
    .all();
  const tagRows = db
    .select({ engramId: engramTags.engramId, value: engramTags.tag })
    .from(engramTags)
    .where(inArray(engramTags.engramId, engramIds))
    .all();
  return { scopesByEngramId: bucket(scopeRows), tagsByEngramId: bucket(tagRows) };
}

/** The first-chunk embedding preview of each engram that has been embedded. */
export function fetchEmbeddingPreviews(db: CerebrumDb, engramIds: string[]): Map<string, string> {
  const rows = db
    .select({ sourceId: embeddings.sourceId, contentPreview: embeddings.contentPreview })
    .from(embeddings)
    .where(
      and(
        eq(embeddings.sourceType, 'engram'),
        inArray(embeddings.sourceId, engramIds),
        eq(embeddings.chunkIndex, 0)
      )
    )
    .all();
  return new Map(rows.map((row) => [row.sourceId, row.contentPreview]));
}

/** The `metadata` object of an engram retrieval result. */
export function engramMetadata(
  row: EngramRow,
  junctions: EngramJunctions
): Record<string, unknown> {
  return {
    type: row.type,
    source: row.source,
    status: row.status,
    scopes: junctions.scopesByEngramId.get(row.id) ?? [],
    tags: junctions.tagsByEngramId.get(row.id) ?? [],
    createdAt: row.createdAt,
    modifiedAt: row.modifiedAt,
    wordCount: row.wordCount,
    customFields: row.customFields,
    contentHash: row.contentHash,
  };
}
