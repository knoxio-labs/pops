/**
 * Fixtures for suites that drive the lexical leg: an indexed engram together
 * with the title and body the FTS5 index searches, and no embedding row, which
 * is the state of a deployment with no embedding API key.
 */
import type { OpenedCerebrumDb } from '../../db/index.js';

export interface SearchableEngramSeed {
  id: string;
  title: string;
  body: string;
  type?: string;
  status?: string;
  scopes?: string[];
  tags?: string[];
  createdAt?: string;
  modifiedAt?: string;
}

/** Insert an `engram_index` row, its scopes and tags, and its search text. */
export function seedSearchableEngram(db: OpenedCerebrumDb, seed: SearchableEngramSeed): void {
  const createdAt = seed.createdAt ?? '2026-01-01T00:00:00.000Z';
  db.raw
    .prepare(
      `INSERT INTO engram_index
        (id, file_path, type, source, status, template, created_at, modified_at, title, content_hash, word_count, custom_fields)
       VALUES (?, ?, ?, 'manual', ?, NULL, ?, ?, ?, ?, 10, NULL)`
    )
    .run(
      seed.id,
      `${seed.id}.md`,
      seed.type ?? 'note',
      seed.status ?? 'active',
      createdAt,
      seed.modifiedAt ?? createdAt,
      seed.title,
      `hash-${seed.id}`
    );
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
      'INSERT INTO engram_search_docs (engram_id, title, body, body_hash) VALUES (?, ?, ?, ?)'
    )
    .run(seed.id, seed.title, seed.body, `body-hash-${seed.id}`);
}
