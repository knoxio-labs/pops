/**
 * ADR-045: a guard ships with a test proving it REPORTS, not merely that it
 * passes. The collision this guard exists for (POPS-2866) cannot be planted
 * in the real tree — it only exists mid-merge, and a branch carrying it would
 * be exactly what the guard rejects — so the reporting half is driven over
 * synthetic journals here.
 *
 * Unlike `check-migration-fk-pragma`, this suite DOES assert the real tree is
 * clean, because it is: all eleven journals have unique `when` and `idx`
 * values today, and there is no in-flight exception to carve out.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { discoverJournals, findJournalViolations } from '../check-migration-journals.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const guard = join(repoRoot, 'scripts', 'ci', 'check-migration-journals.mjs');

type Entry = { idx: number; when: number; tag: string };

const journal = (entries: readonly unknown[]): string =>
  JSON.stringify({ version: '7', dialect: 'sqlite', entries });

const sqlFor = (...entries: readonly Entry[]): string[] => entries.map((e) => `${e.tag}.sql`);

const A: Entry = { idx: 0, when: 1000, tag: '0001_a' };
const B: Entry = { idx: 1, when: 1001, tag: '0002_b' };

const rulesOf = (hits: readonly { rule: string }[]): string[] => hits.map((h) => h.rule);

describe('findJournalViolations', () => {
  it('stays silent on a clean journal', () => {
    expect(findJournalViolations('j', journal([A, B]), sqlFor(A, B))).toEqual([]);
  });

  it('reports two entries minted with the same `when`', () => {
    const collided = { ...B, when: A.when };
    const hits = findJournalViolations('j', journal([A, collided]), sqlFor(A, collided));
    expect(rulesOf(hits)).toContain('duplicate-when');
  });

  it('names both colliding tags, so the resolver knows which entry to re-stamp', () => {
    const collided = { ...B, when: A.when };
    const [hit] = findJournalViolations('j', journal([A, collided]), sqlFor(A, collided));
    expect(hit?.message).toContain('0001_a');
    expect(hit?.message).toContain('0002_b');
  });

  it('collapses three entries sharing one `when` into a single report, not three', () => {
    const c = { idx: 2, when: A.when, tag: '0003_c' };
    const b = { ...B, when: A.when };
    const hits = findJournalViolations('j', journal([A, b, c]), sqlFor(A, b, c));
    expect(hits).toHaveLength(1);
    expect(hits[0]?.message).toContain('3 entries');
  });

  it('reports two entries appended at the same `idx`', () => {
    const collided = { ...B, idx: A.idx };
    const hits = findJournalViolations('j', journal([A, collided]), sqlFor(A, collided));
    expect(rulesOf(hits)).toContain('duplicate-idx');
  });

  it('does not report a gap in `idx` — registry runs 0..10 then 12..16 by design', () => {
    const gapped = { ...B, idx: 2 };
    expect(findJournalViolations('j', journal([A, gapped]), sqlFor(A, gapped))).toEqual([]);
  });

  it('does not report a descending `when` — finance opens with its newer baseline', () => {
    const older = { ...B, when: A.when - 500 };
    expect(findJournalViolations('j', journal([A, older]), sqlFor(A, older))).toEqual([]);
  });

  it('reports an entry whose .sql file is absent', () => {
    const hits = findJournalViolations('j', journal([A, B]), sqlFor(A));
    expect(rulesOf(hits)).toEqual(['missing-sql']);
    expect(hits[0]?.message).toContain('0002_b.sql');
  });

  it('reports a .sql file no entry claims', () => {
    const hits = findJournalViolations('j', journal([A]), [...sqlFor(A), '0002_stray.sql']);
    expect(rulesOf(hits)).toEqual(['orphan-sql']);
    expect(hits[0]?.message).toContain('0002_stray.sql');
  });

  it('reports both halves of a rename that moved the file but not the journal', () => {
    const hits = findJournalViolations('j', journal([A, B]), [...sqlFor(A), '0002_renamed.sql']);
    expect(rulesOf(hits).toSorted()).toEqual(['missing-sql', 'orphan-sql']);
  });

  it('reports an unparseable journal rather than treating it as empty', () => {
    expect(rulesOf(findJournalViolations('j', '{ not json', []))).toEqual(['unparseable']);
  });

  it('reports a journal with no `entries` array', () => {
    expect(rulesOf(findJournalViolations('j', '{"version":"7"}', []))).toEqual(['malformed']);
  });

  it.each([
    ['when', { idx: 0, when: '1000', tag: '0001_a' }],
    ['idx', { idx: '0', when: 1000, tag: '0001_a' }],
    ['tag', { idx: 0, when: 1000, tag: 7 }],
  ])('reports an entry whose `%s` is the wrong type', (_field, entry) => {
    const hits = findJournalViolations('j', journal([entry]), ['0001_a.sql']);
    expect(rulesOf(hits)).toContain('malformed-entry');
  });

  it('still checks the well-formed entries around a malformed one', () => {
    const collided = { ...B, when: A.when };
    const hits = findJournalViolations(
      'j',
      journal([A, collided, { idx: 2, tag: '0003_c' }]),
      sqlFor(A, collided)
    );
    expect(rulesOf(hits)).toContain('malformed-entry');
    expect(rulesOf(hits)).toContain('duplicate-when');
  });
});

describe('discoverJournals', () => {
  it('finds every pillar journal on disk, with the SQL files beside it', () => {
    const journals = discoverJournals();
    expect(journals.length).toBeGreaterThanOrEqual(8);
    expect(journals.map((j) => j.journalPath)).toContain(
      'pillars/finance/migrations/meta/_journal.json'
    );
    const finance = journals.find((j) => j.journalPath.startsWith('pillars/finance/'));
    expect(finance?.sqlFiles.length).toBeGreaterThan(0);
    expect(finance?.sqlFiles.every((name) => name.endsWith('.sql'))).toBe(true);
  });

  it('reports no violation against any real journal', () => {
    const violations = discoverJournals().flatMap((j) =>
      findJournalViolations(
        j.journalPath,
        readFileSync(join(repoRoot, j.journalPath), 'utf8'),
        j.sqlFiles
      )
    );
    expect(violations).toEqual([]);
  });
});

describe('the guard as CI runs it', () => {
  it('passes its own self-test', () => {
    const out = execFileSync('node', [guard, '--self-test'], { encoding: 'utf8' });
    expect(out).toContain('self-test OK');
  });

  it('exits 0 against the real tree', () => {
    const out = execFileSync('node', [guard], { encoding: 'utf8' });
    expect(out).toContain('OK —');
  });
});
