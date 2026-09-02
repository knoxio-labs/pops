/**
 * Service-account key resolution and the boot gate on it (POPS-2760).
 *
 * The failure this pins: the key read was best-effort, so an unreadable secret
 * file left the process running with no key. Every tool proxies a pillar, so
 * the server answered nothing — while `/health` reported ok and Docker kept it
 * green. What is pinned is that no source producing a key is fatal, that a
 * declared-but-unreadable file still falls back to an env var, and that the
 * message names the variable production actually sets.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  API_KEY_FILE_ENV,
  MissingServiceAccountKeyError,
  requireServiceAccountKey,
  resolveServiceAccountKey,
} from './service-account-key.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pops-mcp-key-'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function secretFile(contents: string): string {
  const path = join(dir, 'pops_api_key');
  writeFileSync(path, contents);
  return path;
}

describe('resolveServiceAccountKey', () => {
  it('reads the mounted secret file, trimming the trailing newline docker leaves', () => {
    const path = secretFile('pops_sa_live.abc123\n');

    expect(resolveServiceAccountKey({ [API_KEY_FILE_ENV]: path })).toBe('pops_sa_live.abc123');
  });

  it('prefers the file over either env var', () => {
    const path = secretFile('from-file');

    expect(
      resolveServiceAccountKey({
        [API_KEY_FILE_ENV]: path,
        POPS_INTERNAL_API_KEY: 'from-internal',
        POPS_API_KEY: 'from-legacy',
      })
    ).toBe('from-file');
  });

  it('falls back to an env var when the declared file cannot be read', () => {
    expect(
      resolveServiceAccountKey({
        [API_KEY_FILE_ENV]: join(dir, 'does-not-exist'),
        POPS_INTERNAL_API_KEY: 'from-internal',
      })
    ).toBe('from-internal');
  });

  it('prefers POPS_INTERNAL_API_KEY over the legacy POPS_API_KEY', () => {
    expect(resolveServiceAccountKey({ POPS_INTERNAL_API_KEY: 'new', POPS_API_KEY: 'legacy' })).toBe(
      'new'
    );
  });

  it('still accepts the legacy variable alone', () => {
    expect(resolveServiceAccountKey({ POPS_API_KEY: 'legacy' })).toBe('legacy');
  });

  it('treats an empty secret file as no key rather than as an empty key', () => {
    expect(resolveServiceAccountKey({ [API_KEY_FILE_ENV]: secretFile('   \n') })).toBeUndefined();
  });

  it('treats blank env values as absent', () => {
    expect(
      resolveServiceAccountKey({ POPS_INTERNAL_API_KEY: '  ', POPS_API_KEY: '' })
    ).toBeUndefined();
  });

  it('reports the unreadable path without ever reporting file contents', () => {
    const missing = join(dir, 'nope');
    const secret = 'pops_sa_live.SUPERSECRETVALUE';
    resolveServiceAccountKey({ [API_KEY_FILE_ENV]: missing, POPS_API_KEY: secret });

    const warned = vi.mocked(console.warn).mock.calls.flat().join(' ');
    expect(warned).toContain(missing);
    expect(warned).not.toContain(secret);
  });

  it('never logs the key on the path that succeeds', () => {
    resolveServiceAccountKey({ [API_KEY_FILE_ENV]: secretFile('pops_sa_live.SUPERSECRETVALUE') });

    const warned = vi.mocked(console.warn).mock.calls.flat().join(' ');
    expect(warned).not.toContain('SUPERSECRETVALUE');
  });
});

describe('requireServiceAccountKey — the boot gate', () => {
  it('throws when no source produces a key', () => {
    expect(() => requireServiceAccountKey({})).toThrow(MissingServiceAccountKeyError);
  });

  it('throws when the declared secret file is unreadable and nothing else is set', () => {
    expect(() => requireServiceAccountKey({ [API_KEY_FILE_ENV]: join(dir, 'unreadable') })).toThrow(
      MissingServiceAccountKeyError
    );
  });

  it('names POPS_API_KEY_FILE, which is what production compose sets', () => {
    expect(() => requireServiceAccountKey({})).toThrow(/POPS_API_KEY_FILE/);
  });

  it('publishes the resolved key as POPS_API_KEY for the SDK bootstrap to read', () => {
    const env: NodeJS.ProcessEnv = { [API_KEY_FILE_ENV]: secretFile('from-file') };

    expect(requireServiceAccountKey(env)).toBe('from-file');
    expect(env['POPS_API_KEY']).toBe('from-file');
  });

  it('is idempotent — a second call resolves the same key', () => {
    const env: NodeJS.ProcessEnv = { [API_KEY_FILE_ENV]: secretFile('from-file') };

    requireServiceAccountKey(env);

    expect(requireServiceAccountKey(env)).toBe('from-file');
  });
});
