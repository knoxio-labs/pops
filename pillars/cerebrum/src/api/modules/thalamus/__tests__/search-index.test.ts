/**
 * The lexical index follows the engram files: through the file sync on create,
 * edit, rename and delete, through a full index rebuild, and through the
 * reconcile pass that backfills engrams indexed before the search table
 * existed. Real files, real temp cerebrum.db.
 */
import { mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../../../db/index.js';
import { deleteEngram } from '../../engrams/handlers/delete-engram.js';
import { reindexEngrams } from '../../engrams/handlers/rebuild-index.js';
import { LexicalSearchService } from '../../retrieval/lexical-search.js';
import { reconcileEngramSearchIndex } from '../search-index.js';
import { FrontmatterSyncService } from '../sync.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;
let sync: FrontmatterSyncService;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-search-index-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-search-index-root-'));
  mkdirSync(join(engramRoot, 'note'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
  sync = new FrontmatterSyncService(engramRoot, cerebrumDb.db);
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

const KARBON = 'eng_20260101_0001_karbon';
const GARDEN = 'eng_20260102_0002_garden';
const ISO = '2026-06-17T00:00:00.000Z';

function writeEngramFile(relPath: string, id: string, body: string): void {
  const content = [
    '---',
    `id: ${id}`,
    'type: note',
    'scopes:\n  - work',
    `created: ${ISO}`,
    `modified: ${ISO}`,
    'source: manual',
    'status: active',
    '---',
    '',
    body,
    '',
  ].join('\n');
  writeFileSync(join(engramRoot, relPath), content, 'utf8');
}

function ids(query: string): string[] {
  return new LexicalSearchService(cerebrumDb.db).search(query).map((r) => r.sourceId);
}

function searchDocCount(): number {
  const count = cerebrumDb.raw.prepare('SELECT count(*) FROM engram_search_docs').pluck().get();
  if (typeof count !== 'number') throw new Error('count(*) did not return a number');
  return count;
}

/** Throws when the FTS5 index disagrees with its content table. */
function assertFtsIntegrity(): void {
  cerebrumDb.raw.exec(`INSERT INTO engram_fts(engram_fts, rank) VALUES ('integrity-check', 1)`);
}

describe('file sync keeps the lexical index in step', () => {
  it('indexes a new engram file', () => {
    writeEngramFile('note/karbon.md', KARBON, '# Cluster\n\nThe karbon cluster moves in March.');

    sync.processEvents([{ type: 'create', filePath: 'note/karbon.md' }]);

    expect(ids('karbon')).toEqual([KARBON]);
    expect(ids('cluster')).toEqual([KARBON]);
  });

  it('follows an edit: the old words stop matching and the new ones start', () => {
    writeEngramFile('note/karbon.md', KARBON, '# Cluster\n\nThe karbon cluster moves in March.');
    sync.processEvents([{ type: 'create', filePath: 'note/karbon.md' }]);

    writeEngramFile('note/karbon.md', KARBON, '# Orchard\n\nPlum trees get pruned in winter.');
    sync.processEvents([{ type: 'modify', filePath: 'note/karbon.md' }]);

    expect(ids('karbon')).toEqual([]);
    expect(ids('cluster')).toEqual([]);
    expect(ids('plum')).toEqual([KARBON]);
    expect(ids('orchard')).toEqual([KARBON]);
    expect(searchDocCount()).toBe(1);
    assertFtsIntegrity();
  });

  it.each([
    ['the delete event first', ['delete', 'create']],
    ['the create event first', ['create', 'delete']],
  ] as const)('follows a rename with %s', (_label, order) => {
    writeEngramFile('note/karbon.md', KARBON, '# Cluster\n\nThe karbon cluster moves in March.');
    sync.processEvents([{ type: 'create', filePath: 'note/karbon.md' }]);

    renameSync(join(engramRoot, 'note/karbon.md'), join(engramRoot, 'note/renamed.md'));
    sync.processEvents(
      order.map((type) => ({
        type,
        filePath: type === 'delete' ? 'note/karbon.md' : 'note/renamed.md',
      }))
    );

    expect(ids('karbon')).toEqual([KARBON]);
    expect(searchDocCount()).toBe(1);
    assertFtsIntegrity();
  });

  it('follows a delete: the engram stops matching and its text leaves the index', () => {
    writeEngramFile('note/karbon.md', KARBON, '# Cluster\n\nThe karbon cluster moves in March.');
    writeEngramFile('note/garden.md', GARDEN, '# Garden\n\nPlum trees get pruned in winter.');
    sync.processEvents([
      { type: 'create', filePath: 'note/karbon.md' },
      { type: 'create', filePath: 'note/garden.md' },
    ]);

    unlinkSync(join(engramRoot, 'note/karbon.md'));
    sync.processEvents([{ type: 'delete', filePath: 'note/karbon.md' }]);

    expect(ids('karbon')).toEqual([]);
    expect(
      new LexicalSearchService(cerebrumDb.db).search('karbon', { status: ['orphaned'] })
    ).toEqual([]);
    expect(ids('plum')).toEqual([GARDEN]);
    expect(searchDocCount()).toBe(1);
    assertFtsIntegrity();
  });
});

describe('full index rebuild', () => {
  it('indexes every file on disk and drops the text of files that are gone', () => {
    writeEngramFile('note/karbon.md', KARBON, '# Cluster\n\nThe karbon cluster moves in March.');
    writeEngramFile('note/garden.md', GARDEN, '# Garden\n\nPlum trees get pruned in winter.');
    reindexEngrams(cerebrumDb.db, engramRoot);
    expect(ids('karbon')).toEqual([KARBON]);

    unlinkSync(join(engramRoot, 'note/karbon.md'));
    writeEngramFile('note/garden.md', GARDEN, '# Garden\n\nFig trees get pruned in spring.');
    reindexEngrams(cerebrumDb.db, engramRoot);

    expect(ids('karbon')).toEqual([]);
    expect(ids('plum')).toEqual([]);
    expect(ids('fig')).toEqual([GARDEN]);
    expect(searchDocCount()).toBe(1);
    assertFtsIntegrity();
  });
});

describe('hard delete', () => {
  it('removes the search text along with the index row and the file', () => {
    writeEngramFile('note/karbon.md', KARBON, '# Cluster\n\nThe karbon cluster moves in March.');
    writeEngramFile('note/garden.md', GARDEN, '# Garden\n\nPlum trees get pruned in winter.');
    reindexEngrams(cerebrumDb.db, engramRoot);

    deleteEngram({ root: engramRoot, db: cerebrumDb.db, now: () => new Date(ISO) }, KARBON);

    expect(ids('karbon')).toEqual([]);
    expect(ids('plum')).toEqual([GARDEN]);
    expect(searchDocCount()).toBe(1);
    assertFtsIntegrity();
  });
});

describe('reconcileEngramSearchIndex', () => {
  function seedIndexedWithoutSearchText(): void {
    writeEngramFile('note/karbon.md', KARBON, '# Cluster\n\nThe karbon cluster moves in March.');
    writeEngramFile('note/garden.md', GARDEN, '# Garden\n\nPlum trees get pruned in winter.');
    reindexEngrams(cerebrumDb.db, engramRoot);
    cerebrumDb.raw.exec('DELETE FROM engram_search_docs');
  }

  it('backfills engrams that were indexed before the search table existed', () => {
    seedIndexedWithoutSearchText();
    expect(ids('karbon')).toEqual([]);

    const result = reconcileEngramSearchIndex(cerebrumDb.db, engramRoot);

    expect(result).toEqual({ indexed: 2, removed: 0, skipped: 0 });
    expect(ids('karbon')).toEqual([KARBON]);
    expect(ids('plum')).toEqual([GARDEN]);
  });

  it('is idempotent: a second run reads nothing and changes nothing', () => {
    seedIndexedWithoutSearchText();
    reconcileEngramSearchIndex(cerebrumDb.db, engramRoot);
    rmSync(engramRoot, { recursive: true, force: true });

    const second = reconcileEngramSearchIndex(cerebrumDb.db, engramRoot);

    expect(second).toEqual({ indexed: 0, removed: 0, skipped: 0 });
    expect(ids('karbon')).toEqual([KARBON]);
    expect(searchDocCount()).toBe(2);
    assertFtsIntegrity();
  });

  it('re-reads an engram whose search text no longer matches the indexed body hash', () => {
    seedIndexedWithoutSearchText();
    reconcileEngramSearchIndex(cerebrumDb.db, engramRoot);
    cerebrumDb.raw
      .prepare(
        `UPDATE engram_search_docs SET body = 'stale zeppelin text', body_hash = 'stale' WHERE engram_id = ?`
      )
      .run(KARBON);
    expect(ids('zeppelin')).toEqual([KARBON]);

    const result = reconcileEngramSearchIndex(cerebrumDb.db, engramRoot);

    expect(result).toEqual({ indexed: 1, removed: 0, skipped: 0 });
    expect(ids('zeppelin')).toEqual([]);
    expect(ids('karbon')).toEqual([KARBON]);
  });

  it('removes search text whose engram left the index or was orphaned', () => {
    seedIndexedWithoutSearchText();
    reconcileEngramSearchIndex(cerebrumDb.db, engramRoot);
    cerebrumDb.raw.prepare('DELETE FROM engram_index WHERE id = ?').run(KARBON);
    cerebrumDb.raw.prepare(`UPDATE engram_index SET status = 'orphaned' WHERE id = ?`).run(GARDEN);

    const result = reconcileEngramSearchIndex(cerebrumDb.db, engramRoot);

    expect(result).toEqual({ indexed: 0, removed: 2, skipped: 0 });
    expect(searchDocCount()).toBe(0);
    assertFtsIntegrity();
  });

  it('skips an engram whose file is missing or unparseable and indexes the rest', () => {
    seedIndexedWithoutSearchText();
    unlinkSync(join(engramRoot, 'note/karbon.md'));
    writeFileSync(join(engramRoot, 'note/garden.md'), 'no frontmatter here', 'utf8');
    writeEngramFile('note/third.md', 'eng_20260103_0003_third', '# Third\n\nA walnut tree.');
    sync.syncFile('note/third.md');
    cerebrumDb.raw.exec('DELETE FROM engram_search_docs');

    const result = reconcileEngramSearchIndex(cerebrumDb.db, engramRoot);

    expect(result).toEqual({ indexed: 1, removed: 0, skipped: 2 });
    expect(ids('walnut')).toEqual(['eng_20260103_0003_third']);
  });
});
