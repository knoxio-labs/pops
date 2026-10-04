/**
 * Brings the lexical search index (`engram_search_docs` and the FTS5 table
 * behind it) in line with the engram files.
 *
 * Every index writer maintains the search row as it goes; this pass covers what
 * they cannot: engrams indexed before the search table existed, and any row a
 * writer left stale. It reads only the files whose search row is missing or
 * carries a different body hash from `engram_index`, so a run with nothing to
 * do costs one indexed join.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { and, eq, isNotNull, isNull, ne, or } from 'drizzle-orm';

import {
  type CerebrumDb,
  type EngramSearchDoc,
  engramIndex,
  engramSearchDocs,
  pruneEngramSearchDocs,
  upsertEngramSearchDoc,
} from '../../../db/index.js';
import { deriveTitle, parseEngramFile } from '../engrams/file.js';

const WRITE_BATCH_SIZE = 200;

export interface SearchIndexReconcileResult {
  /** Engrams whose text was read from disk and written to the search index. */
  indexed: number;
  /** Search rows removed because their engram is gone or orphaned. */
  removed: number;
  /** Engrams whose file could not be read or parsed; retried on the next run. */
  skipped: number;
}

function readSearchDoc(root: string, engramId: string, relPath: string): EngramSearchDoc | null {
  try {
    const { body } = parseEngramFile(readFileSync(join(root, relPath), 'utf8'));
    return {
      engramId,
      title: deriveTitle(body),
      body,
      bodyHash: createHash('sha256').update(body).digest('hex'),
    };
  } catch {
    return null;
  }
}

function findStaleEngrams(db: CerebrumDb): { id: string; filePath: string }[] {
  return db
    .select({ id: engramIndex.id, filePath: engramIndex.filePath })
    .from(engramIndex)
    .leftJoin(engramSearchDocs, eq(engramSearchDocs.engramId, engramIndex.id))
    .where(
      and(
        ne(engramIndex.status, 'orphaned'),
        or(
          isNull(engramSearchDocs.engramId),
          and(isNotNull(engramIndex.bodyHash), ne(engramSearchDocs.bodyHash, engramIndex.bodyHash))
        )
      )
    )
    .all();
}

/**
 * Index every engram whose search row is missing or stale, and drop search rows
 * for engrams that are gone. Idempotent: safe on every boot.
 */
export function reconcileEngramSearchIndex(
  db: CerebrumDb,
  engramRoot: string
): SearchIndexReconcileResult {
  const removed = pruneEngramSearchDocs(db);
  const stale = findStaleEngrams(db);
  let indexed = 0;

  for (let start = 0; start < stale.length; start += WRITE_BATCH_SIZE) {
    const docs = stale
      .slice(start, start + WRITE_BATCH_SIZE)
      .map((row) => readSearchDoc(engramRoot, row.id, row.filePath))
      .filter((doc) => doc !== null);
    db.transaction((tx) => {
      for (const doc of docs) upsertEngramSearchDoc(tx, doc);
    });
    indexed += docs.length;
  }

  return { indexed, removed, skipped: stale.length - indexed };
}
