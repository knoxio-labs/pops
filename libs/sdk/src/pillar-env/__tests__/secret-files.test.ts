/**
 * The case that matters is the unreadable-but-present one.
 *
 * A test that only covers a missing file would have passed throughout the
 * POPS-3315 incident: the file was there, `stat` saw it, and the process
 * could not open it because the mount was owned by another uid at mode 0440.
 * So the central case here uses a real file with real permissions rather than
 * a mock — `chmod 0000` on a temp file, which produces the same `EACCES` the
 * mount did.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertSecretFilesReadable,
  findUnreadableSecretFiles,
  UnreadableSecretFileError,
  type SecretFileProbe,
} from '../secret-files.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function secretFile(mode: number): string {
  const root = mkdtempSync(join(tmpdir(), 'secret-files-'));
  roots.push(root);
  const path = join(root, 'pops_finance_api_key');
  writeFileSync(path, 'a-key\n');
  chmodSync(path, mode);
  return path;
}

/** Refuses one named path and allows everything else. */
function probeRefusing(refused: string): SecretFileProbe {
  return {
    assertReadable: (path) => {
      if (path === refused) throw new Error('EACCES: permission denied');
    },
    uid: () => 1000,
  };
}

/**
 * Root bypasses file permissions, so `chmod 0000` proves nothing there and
 * the one case this suite exists for would pass vacuously. Asserted rather
 * than skipped: a skip is how a suite stops covering the thing it was written
 * for without anybody noticing (ADR-045).
 */
describe('the environment this suite needs', () => {
  it('is not running as root', () => {
    expect(
      process.getuid?.(),
      'root ignores file modes, so the EACCES case below cannot be posed. Run this suite as an ' +
        'ordinary user.'
    ).not.toBe(0);
  });
});

describe('findUnreadableSecretFiles', () => {
  it('flags a file that exists and cannot be opened — the POPS-3315 shape', () => {
    const path = secretFile(0o000);

    const found = findUnreadableSecretFiles({ POPS_INTERNAL_API_KEY_FILE: path });

    expect(found).toHaveLength(1);
    expect(found[0]?.envVar).toBe('POPS_INTERNAL_API_KEY_FILE');
    expect(found[0]?.path).toBe(path);
    expect(found[0]?.reason).toMatch(/EACCES|permission/iu);
  });

  it('passes a readable file', () => {
    expect(findUnreadableSecretFiles({ POPS_INTERNAL_API_KEY_FILE: secretFile(0o400) })).toEqual(
      []
    );
  });

  it('flags a path that names nothing', () => {
    const found = findUnreadableSecretFiles({ UP_WEBHOOK_SECRET_FILE: '/nowhere/at/all' });

    expect(found.map((f) => f.envVar)).toEqual(['UP_WEBHOOK_SECRET_FILE']);
  });

  it('says nothing about a variable that is not set, which is a supported configuration', () => {
    expect(findUnreadableSecretFiles({ POPS_INTERNAL_API_KEY: 'inline-key' })).toEqual([]);
  });

  it('treats an empty or whitespace-only path as unset rather than as broken', () => {
    expect(
      findUnreadableSecretFiles({ POPS_INTERNAL_API_KEY_FILE: '', OTHER_FILE: '   ' })
    ).toEqual([]);
  });

  it('trims a path before opening it, so stray whitespace is reported against the real path', () => {
    const path = secretFile(0o400);

    expect(findUnreadableSecretFiles({ POPS_INTERNAL_API_KEY_FILE: ` ${path} ` })).toEqual([]);
  });

  it('ignores variables that do not end in _FILE', () => {
    expect(
      findUnreadableSecretFiles({ FILE_OF_SECRETS: '/nowhere', SECRET_FILENAME: '/nowhere' })
    ).toEqual([]);
  });

  it('reports every offender rather than stopping at the first', () => {
    const found = findUnreadableSecretFiles({
      A_FILE: '/nowhere/a',
      B_FILE: '/nowhere/b',
    });

    expect(found.map((f) => f.envVar)).toEqual(['A_FILE', 'B_FILE']);
  });
});

describe('assertSecretFilesReadable', () => {
  it('throws naming the variable, the path and the uid that tried', () => {
    const probe = probeRefusing('/run/secrets/pops_finance_api_key');

    let thrown: unknown;
    try {
      assertSecretFilesReadable(
        { POPS_INTERNAL_API_KEY_FILE: '/run/secrets/pops_finance_api_key' },
        probe
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnreadableSecretFileError);
    const message = (thrown as Error).message;
    expect(message).toContain('POPS_INTERNAL_API_KEY_FILE');
    expect(message).toContain('/run/secrets/pops_finance_api_key');
    expect(message).toContain('1000');
  });

  it('does not throw when nothing is configured', () => {
    expect(() => assertSecretFilesReadable({}, probeRefusing('never-asked'))).not.toThrow();
  });
});
