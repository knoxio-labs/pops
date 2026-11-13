import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  adoptBfmSnapshot,
  BFM_MIGRATION_KIT_TIMEOUT_MS,
  runBfmMigrationKit,
} from '../adopt-migration-snapshot.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const ownerRoot = fileURLToPath(new URL('../../', import.meta.url));
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function kit(args: string[]) {
  return runBfmMigrationKit(repoRoot, args);
}
async function fixture() {
  const root = await mkdtemp(join(repoRoot, 'tmp/bfm-adoption-test-'));
  roots.push(root);
  const pillar = join(root, 'pillar');
  const migrations = join(pillar, 'migrations');
  await cp(join(ownerRoot, 'migrations'), migrations, { recursive: true });
  for (const name of await readdir(join(migrations, 'meta'))) {
    if (name.endsWith('_snapshot.json')) await rm(join(migrations, 'meta', name));
  }
  await mkdir(join(pillar, 'src/db'), { recursive: true });
  const schema = join(pillar, 'src/db/schema.ts');
  await writeFile(
    schema,
    `export * from ${JSON.stringify(join(ownerRoot, 'src/db/schema.ts'))};\n`
  );
  const scratchRepo = join(root, 'repository');
  await mkdir(join(scratchRepo, 'tmp'), { recursive: true });
  return { root, pillar, migrations, schema, scratchRepo };
}
async function history(migrations: string) {
  const files = new Map<string, string>();
  for (const name of await readdir(migrations)) {
    if (name.endsWith('.sql')) files.set(name, await readFile(join(migrations, name), 'utf8'));
  }
  files.set('meta/_journal.json', await readFile(join(migrations, 'meta/_journal.json'), 'utf8'));
  return files;
}
// The longest case runs pull, zero-diff generate, then one subsequent generate; cleanup owns the remainder.
describe(
  'normal pinned BFM snapshot adoption',
  { timeout: 3 * BFM_MIGRATION_KIT_TIMEOUT_MS + 10_000 },
  () => {
    it('normal pull isolates each table CHECK map, including tables with no CHECKs', async () => {
      const root = await mkdtemp(join(repoRoot, 'tmp/bfm-adoption-test-'));
      roots.push(root);
      const databasePath = join(root, 'checks.sqlite');
      const output = join(root, 'pulled');
      const db = new Database(databasePath);
      try {
        db.exec(`
      CREATE TABLE alpha_unchecked (id integer NOT NULL);
      CREATE TABLE bravo_positive (id integer NOT NULL,
        CONSTRAINT "bravo_positive_id" CHECK("bravo_positive"."id" > 0));
      CREATE TABLE charlie_under_max (id integer NOT NULL,
        CONSTRAINT "charlie_max_id" CHECK("charlie_under_max"."id" < 100));
      CREATE TABLE zulu_unchecked (id integer NOT NULL);
    `);
        const before = db.serialize();
        const result = kit([
          'pull',
          '--dialect=sqlite',
          `--url=${databasePath}`,
          `--out=${output}`,
        ]);
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        const [name] = (await readdir(join(output, 'meta'))).filter((file) =>
          file.endsWith('_snapshot.json')
        );
        if (name === undefined) throw new Error('Expected the normal pull snapshot.');
        const snapshot = z
          .object({
            tables: z.record(
              z.string(),
              z.object({
                checkConstraints: z.record(
                  z.string(),
                  z.object({ name: z.string(), value: z.string() })
                ),
              })
            ),
          })
          .parse(JSON.parse(await readFile(join(output, 'meta', name), 'utf8')));
        expect(
          Object.fromEntries(
            Object.entries(snapshot.tables).map(([table, value]) => [table, value.checkConstraints])
          )
        ).toEqual({
          alpha_unchecked: {},
          bravo_positive: {
            bravo_positive_id: { name: 'bravo_positive_id', value: '"bravo_positive"."id" > 0' },
          },
          charlie_under_max: {
            charlie_max_id: { name: 'charlie_max_id', value: '"charlie_under_max"."id" < 100' },
          },
          zulu_unchecked: {},
        });
        expect(db.serialize()).toEqual(before);
      } finally {
        db.close();
      }
    });
    it('adopts only exact generated metadata, preserving real migrated device/token data and the applied ledger', async () => {
      const f = await fixture();
      const before = await history(f.migrations);
      let ledger: unknown;
      let device: unknown;
      let fixtureSha256: string | undefined;
      const result = await adoptBfmSnapshot({
        repoRoot: f.scratchRepo,
        pillarRoot: f.pillar,
        runKit: kit,
        fixtureReady: (db) => {
          db.prepare(
            'INSERT INTO devices (id,name,model,public_key_der,capabilities,capability_mode) VALUES (?,?,?,?,?,?)'
          ).run(
            'fixture-device',
            'Fixture phone',
            'Fixture model',
            'fixture-public',
            '["session.read"]',
            'explicit'
          );
          db.prepare(
            'INSERT INTO refresh_tokens (token_hash,device_id,family_id,created_at,expires_at) VALUES (?,?,?,?,?)'
          ).run('fixture-digest', 'fixture-device', 'fixture-family', '2026-01-01', '2027-01-01');
          ledger = db.prepare('SELECT * FROM __drizzle_migrations ORDER BY id').all();
          device = db.prepare('SELECT * FROM devices').all();
          fixtureSha256 = createHash('sha256').update(db.serialize()).digest('hex');
        },
      });
      const snapshot = await readFile(join(f.migrations, 'meta', result.snapshot));
      expect(createHash('sha256').update(snapshot).digest('hex')).toBe(result.snapshotSha256);
      expect(await history(f.migrations)).toEqual(before);
      expect(ledger).toBeDefined();
      expect(device).toBeDefined();
      expect(result.fixtureSha256).toBe(fixtureSha256);
      expect(await readdir(join(f.scratchRepo, 'tmp'))).toEqual([]);
      await expect(
        adoptBfmSnapshot({ repoRoot: f.scratchRepo, pillarRoot: f.pillar, runKit: kit })
      ).rejects.toThrow('already exist');
      expect(await history(f.migrations)).toEqual(before);
    });
    it('normal subsequent generation appends the next migration and reopens legacy rows without replaying old SQL', async () => {
      const f = await fixture();
      const before = await history(f.migrations);
      await adoptBfmSnapshot({ repoRoot: f.scratchRepo, pillarRoot: f.pillar, runKit: kit });
      const db = new Database(join(f.root, 'existing.sqlite'));
      try {
        migrate(drizzle(db), { migrationsFolder: f.migrations });
        db.prepare('INSERT INTO devices (id,name,model,public_key_der) VALUES (?,?,?,?)').run(
          'kept-device',
          'Original',
          'Fixture',
          'fixture-public'
        );
        const oldRows = db.prepare('SELECT * FROM devices').all();
        const ledger = db.prepare('SELECT * FROM __drizzle_migrations ORDER BY id').all();
        const core = createRequire(join(ownerRoot, 'package.json')).resolve(
          'drizzle-orm/sqlite-core'
        );
        await writeFile(
          f.schema,
          `export * from ${JSON.stringify(join(ownerRoot, 'src/db/schema.ts'))};\n` +
            `import { sqliteTable, integer } from ${JSON.stringify(core)};\n` +
            'export const fixtureRevision = sqliteTable("fixture_revision", { value: integer("value").notNull().default(0) });\n'
        );
        const generated = kit([
          'generate',
          '--dialect=sqlite',
          `--schema=${f.schema}`,
          `--out=${f.migrations}`,
        ]);
        expect(generated.exitCode).toBe(0);
        expect(generated.stderr).toBe('');
        const oldJournal = JSON.parse(before.get('meta/_journal.json') ?? '{}');
        const afterJournal = JSON.parse(
          await readFile(join(f.migrations, 'meta/_journal.json'), 'utf8')
        );
        expect(afterJournal.entries.slice(0, oldJournal.entries.length)).toEqual(
          oldJournal.entries
        );
        expect(afterJournal.entries).toHaveLength(oldJournal.entries.length + 1);
        for (const [name, bytes] of before) {
          if (name !== 'meta/_journal.json')
            expect(await readFile(join(f.migrations, name), 'utf8')).toBe(bytes);
        }
        migrate(drizzle(db), { migrationsFolder: f.migrations });
        expect(db.prepare('SELECT * FROM devices').all()).toEqual(oldRows);
        expect(
          db.prepare('SELECT * FROM __drizzle_migrations ORDER BY id').all().slice(0, ledger.length)
        ).toEqual(ledger);
        expect(db.prepare('SELECT * FROM fixture_revision').all()).toEqual([]);
        db.close();
        const reopened = new Database(join(f.root, 'existing.sqlite'));
        try {
          expect(reopened.prepare('SELECT * FROM devices').all()).toEqual(oldRows);
        } finally {
          reopened.close();
        }
      } finally {
        if (db.open) db.close();
      }
    });
    it.each([1, 2])(
      'a failed normal tool stage %i publishes no snapshot and preserves old history',
      async (stage) => {
        const f = await fixture();
        const before = await history(f.migrations);
        let calls = 0;
        await expect(
          adoptBfmSnapshot({
            repoRoot: f.scratchRepo,
            pillarRoot: f.pillar,
            runKit: (args) => {
              calls += 1;
              if (calls === stage) throw new Error('fixture tool failure');
              return kit(args);
            },
          })
        ).rejects.toThrow('fixture tool failure');
        expect(await history(f.migrations)).toEqual(before);
        expect(await readdir(join(f.migrations, 'meta'))).toEqual(['_journal.json']);
        expect(await readdir(join(f.scratchRepo, 'tmp'))).toEqual([]);
      }
    );
    it('a different owner schema fails zero-diff verification instead of adopting a misleading baseline', async () => {
      const f = await fixture();
      const before = await history(f.migrations);
      await writeFile(f.schema, 'export {};\n');
      await expect(
        adoptBfmSnapshot({ repoRoot: f.scratchRepo, pillarRoot: f.pillar, runKit: kit })
      ).rejects.toThrow();
      expect(await history(f.migrations)).toEqual(before);
      expect(await readdir(join(f.migrations, 'meta'))).toEqual(['_journal.json']);
      expect(await readdir(join(f.scratchRepo, 'tmp'))).toEqual([]);
    });

    it('rejects a tool that mutates the isolated migrated fixture, with no metadata publication', async () => {
      const f = await fixture();
      const before = await history(f.migrations);
      await expect(
        adoptBfmSnapshot({
          repoRoot: f.scratchRepo,
          pillarRoot: f.pillar,
          fixtureReady: (db) => {
            db.prepare('INSERT INTO devices (id,name,model,public_key_der) VALUES (?,?,?,?)').run(
              'fixture-device',
              'Original fixture',
              'Fixture',
              'fixture-public'
            );
          },
          runKit: (args) => {
            const result = kit(args);
            if (args[0] !== 'pull') return result;
            const path = args.find((value) => value.startsWith('--url='))?.slice(6);
            if (path === undefined || !path.startsWith(f.scratchRepo))
              throw new Error('Expected own private fixture');
            const db = new Database(path);
            try {
              db.prepare('UPDATE devices SET name=? WHERE id=?').run(
                'Changed fixture',
                'fixture-device'
              );
            } finally {
              db.close();
            }
            return result;
          },
        })
      ).rejects.toThrow('mutated the private fixture');
      expect(await history(f.migrations)).toEqual(before);
      expect(await readdir(join(f.migrations, 'meta'))).toEqual(['_journal.json']);
      expect(await readdir(join(f.scratchRepo, 'tmp'))).toEqual([]);
    });

    it.each([
      { stdout: 'Error: fixture zero-exit failure\n', stderr: '', exitCode: 0 },
      { stdout: '', stderr: '', exitCode: 0 },
      {
        stdout: 'No schema changes, nothing to migrate 😴\n',
        stderr: 'Error: fixture failure\n',
        exitCode: 0,
      },
      { stdout: 'No schema changes, nothing to migrate 😴\n', stderr: '', exitCode: 1 },
    ])(
      'zero-exit errors or missing successful completion cannot admit unchanged output: %j',
      async (completion) => {
        const f = await fixture();
        const before = await history(f.migrations);
        await expect(
          adoptBfmSnapshot({
            repoRoot: f.scratchRepo,
            pillarRoot: f.pillar,
            runKit: (args) => (args[0] === 'generate' ? completion : kit(args)),
          })
        ).rejects.toThrow();
        expect(await history(f.migrations)).toEqual(before);
        expect(await readdir(join(f.migrations, 'meta'))).toEqual(['_journal.json']);
        expect(await readdir(join(f.scratchRepo, 'tmp'))).toEqual([]);
      }
    );
  }
);
