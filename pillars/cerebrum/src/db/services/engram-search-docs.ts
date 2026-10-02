/**
 * Data access for `engram_search_docs`, the text the lexical leg searches.
 *
 * The engram handlers and the thalamus sync call these in the same transaction
 * as their `engram_index` write, so the FTS5 index follows the engram files
 * exactly as the index row does.
 */
import { eq, ne, sql } from 'drizzle-orm';

import { engramIndex, engramSearchDocs } from '../schema.js';

import type { CerebrumDb } from './internal.js';

type SearchDocWriter = Pick<CerebrumDb, 'insert' | 'delete'>;

export interface EngramSearchDoc {
  engramId: string;
  title: string;
  body: string;
  /** SHA-256 of `body`, the same value `engram_index.body_hash` carries. */
  bodyHash: string;
}

/**
 * Store an engram's searchable text. A row whose `bodyHash` is unchanged is
 * left alone, so re-syncing an unedited engram does not re-tokenise it.
 */
export function upsertEngramSearchDoc(db: SearchDocWriter, doc: EngramSearchDoc): void {
  db.insert(engramSearchDocs)
    .values(doc)
    .onConflictDoUpdate({
      target: engramSearchDocs.engramId,
      set: { title: doc.title, body: doc.body, bodyHash: doc.bodyHash },
      setWhere: ne(engramSearchDocs.bodyHash, doc.bodyHash),
    })
    .run();
}

/** Remove an engram's searchable text. A missing row is a no-op. */
export function deleteEngramSearchDoc(db: SearchDocWriter, engramId: string): void {
  db.delete(engramSearchDocs).where(eq(engramSearchDocs.engramId, engramId)).run();
}

/**
 * Remove search rows whose engram is gone from the index or orphaned (its file
 * was deleted). Returns the number of rows removed.
 */
export function pruneEngramSearchDocs(db: SearchDocWriter): number {
  return db
    .delete(engramSearchDocs)
    .where(
      sql`${engramSearchDocs.engramId} not in (
        select ${engramIndex.id} from ${engramIndex} where ${engramIndex.status} != 'orphaned'
      )`
    )
    .run().changes;
}
