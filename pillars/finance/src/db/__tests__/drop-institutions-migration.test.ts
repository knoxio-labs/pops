/**
 * End-to-end migration test for 0100_drop_institutions (POPS-3064).
 *
 * Unlike the single-migration rebuild tests elsewhere in this directory
 * (which pin a hand-rolled pre-migration schema and replay just the one
 * migration file), this opens a completely fresh database through
 * `openFinanceDb` — the same entry point the pillar's own server uses — and
 * lets the WHOLE journal apply in order. That is the only way to prove the
 * end state a real fresh install lands in: `institutions` and `logo_blobs`
 * are created by 0082/0090 and then dropped by 0100 in the same replay, so
 * asserting their absence here is a statement about the journal as a whole,
 * not about 0100 in isolation.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../open-finance-db.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-drop-institutions-migration-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function tableNames(raw: OpenedFinanceDb['raw']): string[] {
  return (
    raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
      name: string;
    }>
  ).map((row) => row.name);
}

function columnNames(raw: OpenedFinanceDb['raw'], table: string): string[] {
  return (raw.pragma(`table_info(${table})`) as Array<{ name: string }>).map((c) => c.name);
}

describe('0100_drop_institutions', () => {
  it('leaves neither institutions nor logo_blobs in a freshly migrated database', () => {
    const tables = tableNames(financeDb.raw);
    expect(tables).not.toContain('institutions');
    expect(tables).not.toContain('logo_blobs');
  });

  it('drops accounts.institution_id along with the table it referenced', () => {
    const columns = columnNames(financeDb.raw, 'accounts');
    expect(columns).not.toContain('institution_id');
    expect(columns).toContain('entity_id');
  });

  it('keeps the accounts indexes that do not depend on institution_id', () => {
    const indexes = (financeDb.raw.pragma('index_list(accounts)') as Array<{ name: string }>).map(
      (i) => i.name
    );
    expect(indexes).toContain('idx_accounts_name_nocase');
    expect(indexes).toContain('idx_accounts_entity_currency');
    expect(indexes).not.toContain('idx_accounts_institution');
  });
});
