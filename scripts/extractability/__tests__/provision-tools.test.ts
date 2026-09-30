import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const provisionToolsScript = join(repoRoot, 'scripts', 'extractability', 'provision-tools.mjs');
const REAL_SUBPROCESS_TIMEOUT_MS = 60_000;

describe('provision-tools.mjs', { timeout: REAL_SUBPROCESS_TIMEOUT_MS }, () => {
  let root: string;

  beforeAll(() => {
    const tempRoot = join(repoRoot, 'tmp');
    mkdirSync(tempRoot, { recursive: true });
    root = mkdtempSync(join(tempRoot, 'extractability-tools-'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('exposes the required workspace tool through a symlink', () => {
    const sourceDirectory = join(root, 'source');
    const destinationDirectory = join(root, 'bin');
    mkdirSync(sourceDirectory, { recursive: true });
    const source = join(sourceDirectory, 'oxfmt');
    writeFileSync(source, '#!/usr/bin/env node\n');
    chmodSync(source, 0o755);

    const result = spawnSync(
      process.execPath,
      [provisionToolsScript, sourceDirectory, destinationDirectory],
      {
        encoding: 'utf8',
        timeout: REAL_SUBPROCESS_TIMEOUT_MS,
      }
    );

    expect(result.status).toBe(0);
    expect(lstatSync(join(destinationDirectory, 'oxfmt')).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(destinationDirectory, 'oxfmt'))).toBe(source);
  });

  it('names an unavailable tool instead of relying on the later exec failure', () => {
    const sourceDirectory = join(root, 'missing');
    const destinationDirectory = join(root, 'missing-bin');
    mkdirSync(sourceDirectory, { recursive: true });

    const result = spawnSync(
      process.execPath,
      [provisionToolsScript, sourceDirectory, destinationDirectory],
      {
        encoding: 'utf8',
        timeout: REAL_SUBPROCESS_TIMEOUT_MS,
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('required tool "oxfmt" is unavailable');
    expect(result.stderr).toContain('install workspace dependencies before running EX-2');
  });
});
