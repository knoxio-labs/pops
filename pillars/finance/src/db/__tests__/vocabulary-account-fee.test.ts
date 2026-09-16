/**
 * The value 0113 adds, as the real migration chain leaves it (POPS-3680).
 *
 * `INSERT OR IGNORE` succeeds even against a database that already holds the
 * tag under a different facet, kind or source, and would then leave the row
 * exactly as it was — a passing migration run over a value nothing changed.
 * So this reads the row back from a database built by the journal rather than
 * trusting the SQL alone.
 */
import { describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from './migrated-db.js';

interface VocabularyRow {
  tag: string;
  facet: string | null;
  kind: string;
  source: string;
  is_active: number;
  usage_count: number;
  description: string | null;
  created_at: string;
}

function vocabularyRow(tag: string): VocabularyRow | undefined {
  const { raw } = freshMigratedFinanceDb();
  return raw.prepare('SELECT * FROM tag_vocabulary WHERE tag = ?').get(tag) as
    | VocabularyRow
    | undefined;
}

describe('0113 fee:account-keeping', () => {
  it('adds fee:account-keeping as a closed, active, seed-sourced value with a description', () => {
    const row = vocabularyRow('fee:account-keeping');

    expect(row).toEqual({
      tag: 'fee:account-keeping',
      facet: 'fee',
      kind: 'closed',
      source: 'seed',
      is_active: 1,
      usage_count: 0,
      description: expect.any(String),
      created_at: expect.any(String),
    });
  });

  it('tells account-keeping apart from a membership fee', () => {
    expect(vocabularyRow('fee:account-keeping')?.description).toMatch(/membership/);
  });

  it('keeps the description within the prompt field cap', () => {
    const description = vocabularyRow('fee:account-keeping')?.description ?? '';
    expect(description.length).toBeLessThanOrEqual(200);
  });

  it('is idempotent: re-running the migration SQL directly changes nothing', () => {
    const { raw } = freshMigratedFinanceDb();
    const before = raw
      .prepare('SELECT * FROM tag_vocabulary WHERE tag = ?')
      .get('fee:account-keeping');

    raw.exec(`
      INSERT OR IGNORE INTO tag_vocabulary (tag, facet, kind, source, is_active, usage_count, description) VALUES
        ('fee:account-keeping', 'fee', 'closed', 'seed', 1, 0, 'placeholder');
    `);

    expect(
      raw.prepare('SELECT * FROM tag_vocabulary WHERE tag = ?').get('fee:account-keeping')
    ).toEqual(before);
  });
});
