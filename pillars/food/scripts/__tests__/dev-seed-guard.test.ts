import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assertSeedTargetIsDev, SeedTargetRefusedError } from '../dev-seed-guard.js';

describe('assertSeedTargetIsDev', () => {
  let packageRoot: string;
  let volume: string;

  beforeEach(() => {
    packageRoot = mkdtempSync(join(tmpdir(), 'pops-food-pkg-'));
    volume = mkdtempSync(join(tmpdir(), 'pops-food-volume-'));
    mkdirSync(join(packageRoot, 'data'));
  });

  afterEach(() => {
    rmSync(packageRoot, { recursive: true, force: true });
    rmSync(volume, { recursive: true, force: true });
  });

  it('accepts the package-local dev database', () => {
    const dbPath = join(packageRoot, 'data', 'food.db');
    writeFileSync(dbPath, '');
    expect(assertSeedTargetIsDev({ dbPath, packageRoot, env: {} })).toBe(realpathSync(dbPath));
  });

  it('accepts a database that has not been created yet', () => {
    expect(() =>
      assertSeedTargetIsDev({ dbPath: join(packageRoot, 'data', 'food.db'), packageRoot, env: {} })
    ).not.toThrow();
  });

  it.each(['production', 'PRODUCTION', ' production '])(
    'refuses when NODE_ENV=%p',
    (nodeEnv: string) => {
      expect(() =>
        assertSeedTargetIsDev({
          dbPath: join(packageRoot, 'data', 'food.db'),
          packageRoot,
          env: { NODE_ENV: nodeEnv },
        })
      ).toThrow(SeedTargetRefusedError);
    }
  );

  it('refuses the deployed container volume path even without NODE_ENV', () => {
    expect(() =>
      assertSeedTargetIsDev({ dbPath: '/data/sqlite/food.db', packageRoot, env: {} })
    ).toThrow(/outside the food package/u);
  });

  it('refuses a sibling pillar database', () => {
    const dbPath = join(volume, 'finance.db');
    writeFileSync(dbPath, '');
    expect(() => assertSeedTargetIsDev({ dbPath, packageRoot, env: {} })).toThrow(
      SeedTargetRefusedError
    );
  });

  it('refuses a symlink inside the package that points at the volume', () => {
    const target = join(volume, 'food.db');
    writeFileSync(target, '');
    const link = join(packageRoot, 'data', 'food.db');
    symlinkSync(target, link);
    expect(() => assertSeedTargetIsDev({ dbPath: link, packageRoot, env: {} })).toThrow(
      SeedTargetRefusedError
    );
  });

  it('refuses a path that merely shares the package prefix', () => {
    const sibling = `${packageRoot}-evil`;
    mkdirSync(sibling, { recursive: true });
    try {
      expect(() =>
        assertSeedTargetIsDev({ dbPath: join(sibling, 'food.db'), packageRoot, env: {} })
      ).toThrow(SeedTargetRefusedError);
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
  });

  it.each(['development', 'test', undefined])('allows NODE_ENV=%s', (nodeEnv) => {
    expect(() =>
      assertSeedTargetIsDev({
        dbPath: join(packageRoot, 'data', 'food.db'),
        packageRoot,
        env: { NODE_ENV: nodeEnv },
      })
    ).not.toThrow();
  });
});
