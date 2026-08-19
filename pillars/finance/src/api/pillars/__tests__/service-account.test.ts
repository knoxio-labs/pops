/**
 * Where the service-account key comes from, and what the account is allowed
 * to reach.
 *
 * The file source is the production one — a Docker secret mounted under
 * `/run/secrets/` — and it must win over an environment variable, because a
 * stale inline key beating a rotated mounted one authenticates as the wrong
 * account and says nothing about it.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FINANCE_SERVICE_ACCOUNT_SCOPES,
  resolveServiceAccountKey,
  SERVICE_ACCOUNT_KEY_ENV,
  SERVICE_ACCOUNT_KEY_FILE_ENV,
} from '../service-account.js';

const FILE_KEY = 'pops_sa_FILEFILE.file_secret_not_a_real_key_00000';
const ENV_KEY = 'pops_sa_ENVENVEN.env_secret_not_a_real_key_000000';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'finance-service-account-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function keyFile(contents: string): string {
  const path = join(dir, 'pops_finance_api_key');
  writeFileSync(path, contents, 'utf-8');
  return path;
}

describe('resolveServiceAccountKey', () => {
  it('prefers the mounted secret over the environment', () => {
    const key = resolveServiceAccountKey({
      [SERVICE_ACCOUNT_KEY_FILE_ENV]: keyFile(FILE_KEY),
      [SERVICE_ACCOUNT_KEY_ENV]: ENV_KEY,
    });

    expect(key).toBe(FILE_KEY);
  });

  it('strips the trailing newline a shell-authored secret carries', () => {
    // A `printf`-authored secret and an `echo`-authored one must
    // authenticate identically.
    expect(
      resolveServiceAccountKey({ [SERVICE_ACCOUNT_KEY_FILE_ENV]: keyFile(`${FILE_KEY}\n`) })
    ).toBe(FILE_KEY);
  });

  it('falls back to the environment when the file is unreadable, and says which path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const missing = join(dir, 'not-mounted');

    const key = resolveServiceAccountKey({
      [SERVICE_ACCOUNT_KEY_FILE_ENV]: missing,
      [SERVICE_ACCOUNT_KEY_ENV]: ENV_KEY,
    });

    expect(key).toBe(ENV_KEY);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(missing));
    // The path is safe to report; the contents never are.
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining(ENV_KEY));
    warn.mockRestore();
  });

  it.each([
    ['an empty mounted file', { [SERVICE_ACCOUNT_KEY_FILE_ENV]: '' }],
    ['a blank environment value', { [SERVICE_ACCOUNT_KEY_ENV]: '   ' }],
    ['nothing at all', {}],
  ])('returns undefined for %s', (_label, env) => {
    expect(resolveServiceAccountKey(env)).toBeUndefined();
  });

  it('opens a padded path rather than falling back for a file that is really there', () => {
    // A `.env` edit or a templated compose file leaves whitespace around a
    // value more often than anyone admits, and falling back here would
    // authenticate as whatever the inline variable happened to hold.
    const key = resolveServiceAccountKey({
      [SERVICE_ACCOUNT_KEY_FILE_ENV]: `  ${keyFile(FILE_KEY)}\n`,
      [SERVICE_ACCOUNT_KEY_ENV]: ENV_KEY,
    });

    expect(key).toBe(FILE_KEY);
  });

  it('treats a whitespace-only secret file as no key rather than as a key', () => {
    expect(
      resolveServiceAccountKey({ [SERVICE_ACCOUNT_KEY_FILE_ENV]: keyFile('  \n') })
    ).toBeUndefined();
  });
});

describe('the account grant', () => {
  /**
   * One scope per outbound leg, and the legs are the two calls in
   * `contacts/client.ts` and `cron/pillar-lookup.ts`. Scopes match by dot
   * prefix, so each of these authorises exactly the domain named and
   * nothing under a sibling one.
   */
  it('names exactly the domains the outbound legs call', () => {
    expect([...FINANCE_SERVICE_ACCOUNT_SCOPES]).toEqual(['contacts.entities', 'registry.users']);
  });

  it('grants no whole-pillar or wildcard scope', () => {
    for (const scope of FINANCE_SERVICE_ACCOUNT_SCOPES) {
      expect(scope).toContain('.');
      expect(scope).not.toContain('*');
    }
  });
});
