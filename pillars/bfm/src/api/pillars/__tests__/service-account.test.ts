/**
 * Where the credential comes from, and what it is allowed to reach.
 *
 * Real files in a real temp directory rather than a mocked `fs`: the whole
 * point of the file source is that production hands it a mounted path, and a
 * mock proves nothing about reading one.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BFM_SERVICE_ACCOUNT_NAME,
  BFM_SERVICE_ACCOUNT_SCOPES,
  resolveServiceAccountKey,
} from '../service-account.js';

const KEY = 'pops_sa_TESTTEST.testsecret_not_a_real_key_000000';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bfm-sa-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeSecret(contents: string): string {
  const path = join(dir, 'pops_bfm_api_key');
  writeFileSync(path, contents, 'utf8');
  return path;
}

describe('resolveServiceAccountKey', () => {
  it('reads the environment variable when no file is configured', () => {
    expect(resolveServiceAccountKey({ POPS_INTERNAL_API_KEY: KEY })).toBe(KEY);
  });

  it('reads a mounted secret file', () => {
    const path = writeSecret(KEY);

    expect(resolveServiceAccountKey({ POPS_INTERNAL_API_KEY_FILE: path })).toBe(KEY);
  });

  it('prefers the file over the environment, because production only mounts the file', () => {
    const path = writeSecret(KEY);

    expect(
      resolveServiceAccountKey({
        POPS_INTERNAL_API_KEY_FILE: path,
        POPS_INTERNAL_API_KEY: 'pops_sa_ENVENVEN.env_key_that_must_not_win_000000',
      })
    ).toBe(KEY);
  });

  it('strips surrounding whitespace so an echo-authored secret still authenticates', () => {
    const path = writeSecret(`  ${KEY}\n`);

    expect(resolveServiceAccountKey({ POPS_INTERNAL_API_KEY_FILE: path })).toBe(KEY);
  });

  it('treats an empty file as no key rather than as an empty credential', () => {
    const path = writeSecret('\n');

    expect(resolveServiceAccountKey({ POPS_INTERNAL_API_KEY_FILE: path })).toBeUndefined();
  });

  it('falls back to the environment when the configured file cannot be read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const resolved = resolveServiceAccountKey({
      POPS_INTERNAL_API_KEY_FILE: join(dir, 'absent'),
      POPS_INTERNAL_API_KEY: KEY,
    });

    expect(resolved).toBe(KEY);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('never puts the key itself in the warning it logs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    resolveServiceAccountKey({
      POPS_INTERNAL_API_KEY_FILE: join(dir, 'absent'),
      POPS_INTERNAL_API_KEY: KEY,
    });

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain(KEY);
  });

  it('reads a blank environment value as absent', () => {
    expect(resolveServiceAccountKey({ POPS_INTERNAL_API_KEY: '  ' })).toBeUndefined();
  });

  it('is undefined when nothing is configured', () => {
    expect(resolveServiceAccountKey({})).toBeUndefined();
  });
});

/**
 * The grant is the auditable half of this ticket. A wildcard, or a scope for a
 * pillar bfm does not call, is the regression — not a missing one, which shows
 * up immediately as a 401 the first time the call is made.
 */
describe('the granted scopes', () => {
  it('names the account the operator mints', () => {
    expect(BFM_SERVICE_ACCOUNT_NAME).toBe('bfm');
  });

  it('grants only what bfm calls today', () => {
    expect(BFM_SERVICE_ACCOUNT_SCOPES).toEqual(['finance.transactions']);
  });

  it('contains no wildcard', () => {
    for (const scope of BFM_SERVICE_ACCOUNT_SCOPES) {
      expect(scope).not.toContain('*');
      expect(scope).not.toBe('');
    }
  });
});
