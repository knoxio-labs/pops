import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORCHESTRATOR_SERVICE_ACCOUNT_NAME,
  ORCHESTRATOR_SERVICE_ACCOUNT_SCOPES,
  resolveServiceAccountKey,
  SERVICE_ACCOUNT_KEY_ENV,
  SERVICE_ACCOUNT_KEY_FILE_ENV,
} from '../service-account.js';

const REPO_TMP = fileURLToPath(new URL('../../../../tmp/', import.meta.url));
const FILE_KEY = 'pops_sa_FILEFILE.file_secret_not_a_real_key_00000';
const ENV_KEY = 'pops_sa_ENVENVEN.env_secret_not_a_real_key_000000';

let directory: string;

beforeEach(() => {
  mkdirSync(REPO_TMP, { recursive: true });
  directory = mkdtempSync(join(REPO_TMP, 'orchestrator-service-account-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeKeyFile(contents: string): string {
  const path = join(directory, 'pops_orchestrator_api_key');
  writeFileSync(path, contents, 'utf-8');
  return path;
}

describe('resolveServiceAccountKey', () => {
  it('prefers the mounted secret over the environment', () => {
    expect(
      resolveServiceAccountKey({
        [SERVICE_ACCOUNT_KEY_FILE_ENV]: writeKeyFile(FILE_KEY),
        [SERVICE_ACCOUNT_KEY_ENV]: ENV_KEY,
      })
    ).toBe(FILE_KEY);
  });

  it('trims a newline from the mounted secret', () => {
    expect(
      resolveServiceAccountKey({ [SERVICE_ACCOUNT_KEY_FILE_ENV]: writeKeyFile(`${FILE_KEY}\n`) })
    ).toBe(FILE_KEY);
  });

  it('falls back to the environment when the mounted file cannot be read without logging the key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const missingPath = join(directory, 'not-mounted');

    expect(
      resolveServiceAccountKey({
        [SERVICE_ACCOUNT_KEY_FILE_ENV]: missingPath,
        [SERVICE_ACCOUNT_KEY_ENV]: ENV_KEY,
      })
    ).toBe(ENV_KEY);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(missingPath));
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining(ENV_KEY));
  });

  it('returns undefined for a blank mounted file', () => {
    expect(resolveServiceAccountKey({ [SERVICE_ACCOUNT_KEY_FILE_ENV]: writeKeyFile('  \n') })).toBe(
      undefined
    );
  });

  it.each([
    ['a blank environment value', { [SERVICE_ACCOUNT_KEY_ENV]: '  ' }],
    ['no configured source', {}],
  ])('returns undefined for %s', (_label, env) => {
    expect(resolveServiceAccountKey(env)).toBeUndefined();
  });
});

describe('the orchestrator account grant', () => {
  it('lists only the search and tag-facet operations needed for orchestration', () => {
    expect([...ORCHESTRATOR_SERVICE_ACCOUNT_SCOPES]).toEqual([
      'contacts.search.search',
      'purchases.search.search',
      'tags.tags',
      'finance.tagged',
      'purchases.tagged',
    ]);
  });

  it('uses the orchestrator registry account name', async () => {
    expect(ORCHESTRATOR_SERVICE_ACCOUNT_NAME).toBe('orchestrator');
  });

  it('does not grant whole pillars or wildcard scopes', () => {
    for (const scope of ORCHESTRATOR_SERVICE_ACCOUNT_SCOPES) {
      expect(scope).toContain('.');
      expect(scope).not.toContain('*');
    }
  });
});
