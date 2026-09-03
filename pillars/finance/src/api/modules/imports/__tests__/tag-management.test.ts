/**
 * `loadKnownTags` — the vocabulary the categorizer prompt is built from
 * (POPS-2606).
 *
 * Runs against a database built from the migration journal, so the vocabulary
 * under test is the one 0067 seeds and 0069 classifies rather than a fixture
 * that agrees with the code by construction.
 *
 * The load-bearing assertion is the first: a tag that exists only on a stored
 * transaction must not reach the prompt. `loadKnownTags` used to union
 * `transactions.tags` into its result, which made the model's own output its
 * next prompt's vocabulary — one coined value survived a single commit and
 * became permanent vocabulary. Restore that union and the first test fails.
 */
import { describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { seededAccountId } from '../../../../db/__tests__/seeded-account.js';
import { loadKnownTags } from '../tag-management.js';

import type { MigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';

function seedTransaction(harness: MigratedFinanceDb, id: string, tags: readonly string[]): void {
  harness.raw
    .prepare(
      `INSERT INTO transactions
         (id, description, account, account_id, amount_cents, date, type, tags, checksum, last_edited_time)
       VALUES (?, ?, 'Everyday', ?, -1000, '2026-01-01', 'purchase', ?, ?, '2026-01-01T00:00:00Z')`
    )
    .run(
      id,
      `MERCHANT ${id}`,
      seededAccountId(harness.db, 'Amex'),
      JSON.stringify(tags),
      `checksum-${id}`
    );
}

function setUsage(harness: MigratedFinanceDb, tag: string, count: number): void {
  harness.raw.prepare('UPDATE tag_vocabulary SET usage_count = ? WHERE tag = ?').run(count, tag);
}

describe('loadKnownTags — the vocabulary is the only source', () => {
  it('does not surface a tag that exists only on a transaction', () => {
    const harness = freshMigratedFinanceDb();
    try {
      seedTransaction(harness, 'coined', ['venue:casino', 'contains:groceries']);

      const known = loadKnownTags(harness.db);

      expect(known).not.toContain('venue:casino');
      expect(known).toContain('contains:groceries');
    } finally {
      harness.raw.close();
    }
  });

  it('surfaces a vocabulary tag that no transaction carries', () => {
    const harness = freshMigratedFinanceDb();
    try {
      expect(loadKnownTags(harness.db)).toContain('venue:pub');
    } finally {
      harness.raw.close();
    }
  });

  it('returns closed values only — never an open or marker namespace', () => {
    const harness = freshMigratedFinanceDb();
    try {
      const known = loadKnownTags(harness.db);

      expect(known).toContain('occasion:out');
      expect(known).not.toContain('trip:hunter-valley-2026');
      expect(known).not.toContain('asset:homelab');
      expect(known).not.toContain('enrich:amazon');
      expect(known).not.toContain('person:rosane');
      expect(known).not.toContain('flag:needs-review');
      expect(known).not.toContain('tax:deductible');
    } finally {
      harness.raw.close();
    }
  });

  it('hides a deactivated vocabulary tag', () => {
    const harness = freshMigratedFinanceDb();
    try {
      harness.raw
        .prepare("UPDATE tag_vocabulary SET is_active = 0 WHERE tag = 'venue:sauna'")
        .run();

      expect(loadKnownTags(harness.db)).not.toContain('venue:sauna');
    } finally {
      harness.raw.close();
    }
  });
});

describe('loadKnownTags — ordering', () => {
  it('puts a much-used value ahead of a barely-used one', () => {
    const harness = freshMigratedFinanceDb();
    try {
      setUsage(harness, 'contains:coffee', 200);
      setUsage(harness, 'contains:groceries', 1);

      const known = loadKnownTags(harness.db);

      expect(known.indexOf('contains:coffee')).toBeLessThan(known.indexOf('contains:groceries'));
    } finally {
      harness.raw.close();
    }
  });

  it('ranks strictly by count, not by facet or alphabet', () => {
    const harness = freshMigratedFinanceDb();
    try {
      setUsage(harness, 'venue:vending-machine', 500);

      expect(loadKnownTags(harness.db)[0]).toBe('venue:vending-machine');
    } finally {
      harness.raw.close();
    }
  });

  it('is deterministic on a cold vocabulary where every count is zero', () => {
    const harness = freshMigratedFinanceDb();
    try {
      const first = loadKnownTags(harness.db);
      const second = loadKnownTags(harness.db);

      expect(second).toEqual(first);
      expect(first).toEqual([...first].sort());
    } finally {
      harness.raw.close();
    }
  });
});
