/**
 * Vector fixtures for suites that drive real sqlite-vec k-NN.
 *
 * Every vector is unit length and built relative to {@link ANCHOR_VECTOR}, so a
 * suite states the cosine similarity it wants and gets a row sqlite-vec will
 * report at the matching L2 distance.
 */
import type { OpenedCerebrumDb } from '../../db/index.js';
import type { EmbeddingClient } from '../modules/retrieval/embedding-client.js';

const DIMENSIONS = 1536;

/** Unit vector along axis 0: what queries and seed engrams embed to. */
export const ANCHOR_VECTOR: Float32Array = unitVectorAtCosine(1, 1);

/**
 * A unit vector whose cosine similarity to {@link ANCHOR_VECTOR} is `cosine`.
 * `offAxis` (1 or above) picks where the remainder goes, so two vectors built
 * with different `offAxis` values are not copies of each other.
 */
export function unitVectorAtCosine(cosine: number, offAxis: number): Float32Array {
  if (offAxis < 1 || offAxis >= DIMENSIONS) throw new Error(`offAxis out of range: ${offAxis}`);
  const vector = new Float32Array(DIMENSIONS);
  vector[0] = cosine;
  vector[offAxis] = Math.sqrt(1 - cosine * cosine);
  return vector;
}

export interface IndexedEngramSeed {
  id: string;
  title: string;
  scopes?: string[];
  tags?: string[];
  status?: string;
  createdAt?: string;
}

/** Insert an `engram_index` row with its scopes, tags and chunk-0 `embeddings` row. */
export function seedIndexedEngram(db: OpenedCerebrumDb, seed: IndexedEngramSeed): void {
  const at = seed.createdAt ?? '2026-01-01T00:00:00.000Z';
  db.raw
    .prepare(
      `INSERT INTO engram_index
        (id, file_path, type, source, status, template, created_at, modified_at, title, content_hash, word_count, custom_fields)
       VALUES (?, ?, 'note', 'manual', ?, NULL, ?, ?, ?, ?, 10, NULL)`
    )
    .run(seed.id, `${seed.id}.md`, seed.status ?? 'active', at, at, seed.title, `hash-${seed.id}`);
  for (const scope of seed.scopes ?? []) {
    db.raw
      .prepare('INSERT INTO engram_scopes (engram_id, scope) VALUES (?, ?)')
      .run(seed.id, scope);
  }
  for (const tag of seed.tags ?? []) {
    db.raw.prepare('INSERT INTO engram_tags (engram_id, tag) VALUES (?, ?)').run(seed.id, tag);
  }
  db.raw
    .prepare(
      `INSERT INTO embeddings
        (source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at)
       VALUES ('engram', ?, 0, ?, ?, 'm', 1536, ?)`
    )
    .run(seed.id, `hash-${seed.id}`, `preview ${seed.title}`, at);
}

/**
 * Attach `vector` to an engram's chunk-0 `embeddings` row, creating that row
 * when the engram was written through the API and has none yet.
 */
export function seedEngramVector(
  db: OpenedCerebrumDb,
  engramId: string,
  vector: Float32Array
): void {
  db.raw
    .prepare(
      `INSERT OR IGNORE INTO embeddings
        (source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at)
       VALUES ('engram', ?, 0, ?, ?, 'm', 1536, '2026-01-01T00:00:00.000Z')`
    )
    .run(engramId, `hash-${engramId}`, `preview ${engramId}`);
  const rowId = db.raw
    .prepare(
      `SELECT id FROM embeddings WHERE source_type = 'engram' AND source_id = ? AND chunk_index = 0`
    )
    .pluck()
    .get(engramId);
  if (typeof rowId !== 'number') throw new Error(`no embeddings row for ${engramId}`);
  db.raw
    .prepare('INSERT INTO embeddings_vec (rowid, vector) VALUES (?, ?)')
    .run(BigInt(rowId), Buffer.from(vector.buffer));
}

/** An embedding client that embeds every query to {@link ANCHOR_VECTOR}. */
export function anchorEmbeddingClient(): EmbeddingClient {
  return { embedQuery: async () => Array.from(ANCHOR_VECTOR) };
}
