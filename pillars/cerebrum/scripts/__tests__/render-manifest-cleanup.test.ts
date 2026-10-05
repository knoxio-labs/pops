import { chmodSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderFormattedManifest } from '../render-manifest.js';

let testRoot: string;
let scratchRoot: string;
let fakeBinRoot: string;
let fakePnpmPath: string;
let originalPath: string | undefined;
let originalTmpdir: string | undefined;

beforeEach(() => {
  originalPath = process.env.PATH;
  originalTmpdir = process.env.TMPDIR;
  testRoot = mkdtempSync(join(tmpdir(), 'manifest-render-cleanup-test-'));
  scratchRoot = join(testRoot, 'scratch');
  fakeBinRoot = join(testRoot, 'bin');
  fakePnpmPath = join(fakeBinRoot, 'pnpm');
  mkdirSync(scratchRoot);
  mkdirSync(fakeBinRoot);
  process.env.TMPDIR = scratchRoot;
  process.env.PATH = originalPath ? `${fakeBinRoot}${delimiter}${originalPath}` : fakeBinRoot;
});

afterEach(() => {
  if (originalPath === undefined) {
    delete process.env.PATH;
  } else {
    process.env.PATH = originalPath;
  }
  if (originalTmpdir === undefined) {
    delete process.env.TMPDIR;
  } else {
    process.env.TMPDIR = originalTmpdir;
  }
  rmSync(testRoot, { recursive: true, force: true });
});

describe('renderFormattedManifest temporary files', () => {
  it.each([
    { outcome: 'succeeds', exitCode: 0 },
    { outcome: 'fails', exitCode: 1 },
  ])('removes its scratch directory when formatting $outcome', ({ exitCode }) => {
    writeFileSync(fakePnpmPath, `#!/bin/sh\nexit ${exitCode}\n`);
    chmodSync(fakePnpmPath, 0o755);

    if (exitCode === 0) {
      expect(renderFormattedManifest('test-version')).toContain(
        'Source version pinned at generation time: test-version'
      );
    } else {
      expect(() => renderFormattedManifest('test-version')).toThrow();
    }

    expect(readdirSync(scratchRoot)).toEqual([]);
  });
});
