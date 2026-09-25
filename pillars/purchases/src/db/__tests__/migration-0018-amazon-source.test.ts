/**
 * Migration 0018 against a database the ingest CLI already registered the
 * Amazon source in (POPS-4647, POPS-4650).
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  AMAZON_DESCRIPTOR_PATTERN,
  AMAZON_SETTLEMENT_WINDOW_DAYS,
} from '../../ingest/amazon/index.js';
import { openSeededAtMigration, type SeededAtMigration } from './migration-harness.js';

import type Database from 'better-sqlite3';

const BEFORE = '0017_purchase_status_from_links';

let seeded: SeededAtMigration | undefined;

afterEach(() => {
  seeded?.cleanup();
  seeded = undefined;
});

function reopenWith(seed: (raw: Database.Database) => void): SeededAtMigration {
  seeded = openSeededAtMigration({ through: BEFORE, prefix: 'purchases-0018-', seed });
  return seeded;
}

function sourceRow(opened: SeededAtMigration['opened'], id: string) {
  return opened.raw
    .prepare(
      'SELECT descriptor_pattern AS pattern, settlement_window_days AS days FROM purchase_sources WHERE id = ?'
    )
    .get(id);
}

describe('migration 0018', () => {
  it('rewrites the row the CLI used to register to what it registers now', () => {
    const { opened } = reopenWith((raw) => {
      raw
        .prepare(
          `INSERT INTO purchase_sources (id, label, descriptor_pattern, settlement_window_days)
           VALUES ('amazon', 'Amazon', 'AMAZON%', 21)`
        )
        .run();
    });

    expect(sourceRow(opened, 'amazon')).toEqual({
      pattern: AMAZON_DESCRIPTOR_PATTERN,
      days: AMAZON_SETTLEMENT_WINDOW_DAYS,
    });
  });

  it('leaves a hand-tuned Amazon row and every other source alone', () => {
    const { opened } = reopenWith((raw) => {
      const insert = raw.prepare(
        `INSERT INTO purchase_sources (id, label, descriptor_pattern, settlement_window_days)
         VALUES (?, ?, ?, ?)`
      );
      insert.run('amazon', 'Amazon', 'AMAZON MARKETPLACE%', 14);
      insert.run('woolworths', 'Woolworths', 'AMAZON%', 21);
    });

    expect(sourceRow(opened, 'amazon')).toEqual({ pattern: 'AMAZON MARKETPLACE%', days: 14 });
    expect(sourceRow(opened, 'woolworths')).toEqual({ pattern: 'AMAZON%', days: 21 });
  });
});
