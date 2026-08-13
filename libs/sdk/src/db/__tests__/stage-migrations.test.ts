import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readMigrationJournal } from '../migration-journal.js';
import { stageMigrationsThrough } from '../stage-migrations.js';

const ENTRIES = [
  { idx: 0, version: '6', when: 1000, tag: '0000_init', breakpoints: true },
  { idx: 1, version: '6', when: 2000, tag: '0001_add_column', breakpoints: true },
  { idx: 2, version: '6', when: 3000, tag: '0002_backfill', breakpoints: true },
];

let dir: string;
let source: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sdk-stage-'));
  source = join(dir, 'migrations');
  mkdirSync(join(source, 'meta'), { recursive: true });
  writeFileSync(
    join(source, 'meta', '_journal.json'),
    JSON.stringify({ version: '7', dialect: 'sqlite', entries: ENTRIES })
  );
  for (const entry of ENTRIES) {
    writeFileSync(join(source, `${entry.tag}.sql`), `-- ${entry.tag}\n`);
  }
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('stageMigrationsThrough', () => {
  it('copies only the entries up to and including the named tag', () => {
    const staged = stageMigrationsThrough({
      migrationsFolder: source,
      through: '0001_add_column',
      targetFolder: join(dir, 'staged'),
    });

    expect(readdirSync(staged).sort()).toEqual(['0000_init.sql', '0001_add_column.sql', 'meta']);
    expect(readMigrationJournal(staged).map((entry) => entry.tag)).toEqual([
      '0000_init',
      '0001_add_column',
    ]);
  });

  it('keeps every field drizzle reads off an entry', () => {
    const staged = stageMigrationsThrough({
      migrationsFolder: source,
      through: '0000_init',
      targetFolder: join(dir, 'staged'),
    });
    const journal: unknown = JSON.parse(
      readFileSync(join(staged, 'meta', '_journal.json'), 'utf8')
    );
    expect(journal).toEqual({ version: '7', dialect: 'sqlite', entries: [ENTRIES[0]] });
  });

  it('throws when the tag names no entry, rather than staging a silent prefix', () => {
    expect(() =>
      stageMigrationsThrough({
        migrationsFolder: source,
        through: '0001_renamed_since',
        targetFolder: join(dir, 'staged'),
      })
    ).toThrow(/no migration tagged/);
  });
});
