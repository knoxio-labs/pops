import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { environmentFingerprint } from '../local-dev/fingerprint.mjs';
import { coversValidation, readReceipt, writeReceipt } from '../local-dev/validation-cache.mjs';
import { withValidationLock } from '../local-dev/validation-lock.mjs';

describe('exact-input validation receipts', () => {
  it('requires matching source fingerprint and a superset of requested checks', () => {
    const receipt = {
      version: 1 as const,
      fingerprint: 'source',
      units: ['one', 'two'],
      scripts: false,
    };
    expect(coversValidation(receipt, 'source', ['one'], false)).toBe(true);
    expect(coversValidation(receipt, 'changed', ['one'], false)).toBe(false);
    expect(coversValidation(receipt, 'source', ['three'], false)).toBe(false);
    expect(coversValidation(receipt, 'source', ['one'], true)).toBe(false);
  });
  it('never publishes failed or concurrently changed inputs', () => {
    mkdirSync(resolve('tmp'), { recursive: true });
    const root = mkdtempSync(resolve('tmp/validation-cache-'));
    const file = join(root, 'success.json');
    try {
      expect(
        writeReceipt(file, { before: 'a', after: 'a', status: 1, units: ['one'], scripts: true })
      ).toBe(false);
      expect(readReceipt(file)).toBeNull();
      expect(
        writeReceipt(file, { before: 'a', after: 'b', status: 0, units: ['one'], scripts: true })
      ).toBe(false);
      expect(readReceipt(file)).toBeNull();
      expect(
        writeReceipt(file, { before: 'b', after: 'b', status: 0, units: ['one'], scripts: true })
      ).toBe(true);
      expect(readReceipt(file)).toEqual({
        version: 1,
        fingerprint: 'b',
        units: ['one'],
        scripts: true,
      });
      expect(
        writeReceipt(file, { before: 'b', after: 'b', status: 1, units: ['one'], scripts: true })
      ).toBe(false);
      expect(readReceipt(file)).toBeNull();
      writeFileSync(file, '{"version":1');
      expect(readReceipt(file)).toBeNull();
      writeFileSync(
        file,
        JSON.stringify({ version: 1, fingerprint: 'b', units: [12], scripts: true })
      );
      expect(readReceipt(file)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('hashes real environment changes but not task names or working-directory bookkeeping', () => {
    expect(environmentFingerprint({ NODE_OPTIONS: '--strict', MISE_TASK_NAME: 'check' })).toBe(
      environmentFingerprint({ NODE_OPTIONS: '--strict', MISE_TASK_NAME: 'typecheck' })
    );
    expect(environmentFingerprint({ NODE_OPTIONS: 'one' })).not.toBe(
      environmentFingerprint({ NODE_OPTIONS: 'two' })
    );
  });
  it('serializes writers and releases its lock even when validation fails', async () => {
    mkdirSync(resolve('tmp'), { recursive: true });
    const root = mkdtempSync(resolve('tmp/validation-lock-'));
    const lock = join(root, 'lock');
    try {
      await expect(
        withValidationLock(lock, async () => {
          expect(readFileSync(join(lock, 'pid'), 'utf8')).toBe(String(process.pid));
          await expect(withValidationLock(lock, async () => 0)).rejects.toThrow('already running');
          throw new Error('check failed');
        })
      ).rejects.toThrow('check failed');
      await expect(withValidationLock(lock, async () => 7)).resolves.toBe(7);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
