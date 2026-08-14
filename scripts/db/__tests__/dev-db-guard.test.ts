import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assertDevDatabaseTarget, DevDatabaseGuardError } from '../dev-db-guard.js';

describe('assertDevDatabaseTarget', () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pops-guard-root-'));
    outside = mkdtempSync(join(tmpdir(), 'pops-guard-outside-'));
    mkdirSync(join(root, 'pillars', 'food', 'data'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('accepts a database inside the working tree with no NODE_ENV', () => {
    const dbPath = join(root, 'pillars', 'food', 'data', 'food.db');
    expect(assertDevDatabaseTarget({ dbPath, repoRoot: root, env: {} })).toContain('food.db');
  });

  it('accepts a database that does not exist yet', () => {
    const dbPath = join(root, 'pillars', 'lists', 'data', 'lists.db');
    expect(() => assertDevDatabaseTarget({ dbPath, repoRoot: root, env: {} })).not.toThrow();
  });

  it.each(['development', 'test', 'TEST', undefined])('allows NODE_ENV=%s', (nodeEnv) => {
    const dbPath = join(root, 'pillars', 'food', 'data', 'food.db');
    expect(() =>
      assertDevDatabaseTarget({ dbPath, repoRoot: root, env: { NODE_ENV: nodeEnv } })
    ).not.toThrow();
  });

  it.each(['production', 'PRODUCTION', ' production '])(
    'refuses when NODE_ENV=%p',
    (nodeEnv: string) => {
      const dbPath = join(root, 'pillars', 'food', 'data', 'food.db');
      expect(() =>
        assertDevDatabaseTarget({ dbPath, repoRoot: root, env: { NODE_ENV: nodeEnv } })
      ).toThrow(DevDatabaseGuardError);
    }
  );

  it('refuses the deployed container volume path', () => {
    expect(() =>
      assertDevDatabaseTarget({ dbPath: '/data/sqlite/finance.db', repoRoot: root, env: {} })
    ).toThrow(/outside the repository working tree/u);
  });

  it('refuses a path outside the tree even with a dev NODE_ENV', () => {
    const dbPath = join(outside, 'finance.db');
    writeFileSync(dbPath, '');
    expect(() =>
      assertDevDatabaseTarget({ dbPath, repoRoot: root, env: { NODE_ENV: 'development' } })
    ).toThrow(DevDatabaseGuardError);
  });

  it('refuses a symlink planted inside the tree that points outside it', () => {
    const target = join(outside, 'finance.db');
    writeFileSync(target, '');
    const link = join(root, 'pillars', 'food', 'data', 'food.db');
    symlinkSync(target, link);
    expect(() => assertDevDatabaseTarget({ dbPath: link, repoRoot: root, env: {} })).toThrow(
      /outside the repository working tree/u
    );
  });

  it('refuses a symlinked directory inside the tree that points outside it', () => {
    mkdirSync(join(outside, 'sqlite'));
    const link = join(root, 'pillars', 'media', 'data');
    mkdirSync(join(root, 'pillars', 'media'), { recursive: true });
    symlinkSync(join(outside, 'sqlite'), link);
    expect(() =>
      assertDevDatabaseTarget({ dbPath: join(link, 'media.db'), repoRoot: root, env: {} })
    ).toThrow(DevDatabaseGuardError);
  });

  it('refuses a sibling directory whose path merely shares the root prefix', () => {
    const sibling = `${root}-evil`;
    mkdirSync(sibling, { recursive: true });
    try {
      expect(() =>
        assertDevDatabaseTarget({ dbPath: join(sibling, 'food.db'), repoRoot: root, env: {} })
      ).toThrow(DevDatabaseGuardError);
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
  });

  it('refuses the working tree itself', () => {
    expect(() => assertDevDatabaseTarget({ dbPath: root, repoRoot: root, env: {} })).toThrow(
      DevDatabaseGuardError
    );
  });
});
