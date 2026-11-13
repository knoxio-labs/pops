import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { expect, it } from 'vitest';

import { stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { ReplaceDeviceGrantSchema } from '../../contract/device-grant-schemas.js';
import { openBfmDb } from '../open-bfm-db.js';
import { readDeviceGrant, replaceDeviceGrant } from '../services/device-grants.js';

const repositoryRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const migrations = fileURLToPath(new URL('../../../migrations/', import.meta.url));

it('adds only a zero revision to populated legacy devices and preserves the committed grant on reopen', () => {
  const temporary = join(repositoryRoot, 'tmp');
  mkdirSync(temporary, { recursive: true });
  const root = mkdtempSync(join(temporary, 'bfm-grant-migration-'));
  const path = join(root, 'fixture.sqlite');
  let raw: Database.Database | undefined;
  try {
    const historical = stageMigrationsThrough({
      migrationsFolder: migrations,
      through: '0003_device_subject',
      targetFolder: join(root, 'historical'),
    });
    raw = new Database(path);
    raw.pragma('foreign_keys = ON');
    migrate(drizzle(raw), { migrationsFolder: historical });
    raw
      .prepare(`INSERT INTO devices
      (id, name, model, public_key_der, capabilities, capability_mode, subject_email)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        'legacy-device',
        'Phone — 日本',
        'fixture-model',
        'fixture-public-key',
        '["session.read","finance.transactions.read"]',
        'explicit',
        null
      );
    raw
      .prepare(`INSERT INTO pairing_codes (code_hash, expires_at, subject_email)
      VALUES (?, ?, ?)`)
      .run('fixture-code-hash', '2099-01-01T00:00:00Z', 'guest@example.test');
    raw
      .prepare(`INSERT INTO refresh_tokens (token_hash, device_id, family_id, expires_at)
      VALUES (?, ?, ?, ?)`)
      .run('fixture-token-hash', 'legacy-device', 'fixture-family', '2099-01-01T00:00:00Z');
    const devices = raw.prepare<[], Record<string, unknown>>('SELECT * FROM devices').all();
    const codes = raw.prepare('SELECT * FROM pairing_codes').all();
    const tokens = raw.prepare('SELECT * FROM refresh_tokens').all();
    const ledger = raw.prepare('SELECT * FROM __drizzle_migrations ORDER BY id').all();
    raw.close();
    raw = undefined;

    const opened = openBfmDb(path);
    raw = opened.raw;
    expect(raw.prepare('SELECT * FROM devices').all()).toEqual(
      devices.map((row) => ({ ...row, capability_revision: 0 }))
    );
    expect(raw.prepare('SELECT * FROM pairing_codes').all()).toEqual(codes);
    expect(raw.prepare('SELECT * FROM refresh_tokens').all()).toEqual(tokens);
    const afterLedger = raw.prepare('SELECT * FROM __drizzle_migrations ORDER BY id').all();
    expect(afterLedger).toHaveLength(ledger.length + 1);
    expect(afterLedger.slice(0, -1)).toEqual(ledger);
    const state = readDeviceGrant(opened.db, 'legacy-device');
    if (state.outcome !== 'ok') throw new Error('Expected the migrated operator grant');
    const selected = [...state.grant.effective, 'trips.write', 'trips.capture.write'];
    expect(
      replaceDeviceGrant(
        opened.db,
        'legacy-device',
        ReplaceDeviceGrantSchema.parse({
          expectedRevision: state.grant.revision,
          expectedPolicyToken: state.grant.policyToken,
          capabilities: selected,
        })
      ).outcome
    ).toBe('ok');
    const committed = raw.prepare('SELECT * FROM devices').all();
    raw.close();
    raw = undefined;

    const reopened = openBfmDb(path);
    raw = reopened.raw;
    expect(raw.prepare('SELECT * FROM devices').all()).toEqual(committed);
    expect(raw.prepare('SELECT * FROM __drizzle_migrations ORDER BY id').all()).toEqual(
      afterLedger
    );
    expect(readDeviceGrant(reopened.db, 'legacy-device')).toMatchObject({
      outcome: 'ok',
      grant: { revision: 1, mode: 'explicit', effective: selected },
    });
    expect(raw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(raw.prepare('PRAGMA integrity_check').all()).toEqual([{ integrity_check: 'ok' }]);
  } finally {
    if (raw?.open) raw.close();
    rmSync(root, { recursive: true, force: true });
  }
});
