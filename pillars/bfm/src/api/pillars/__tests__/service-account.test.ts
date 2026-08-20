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

import { MOBILE_CAPABILITY_SCOPES } from '../../../contract/capabilities.js';
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
    expect(BFM_SERVICE_ACCOUNT_SCOPES).toEqual([
      'finance.transactions',
      'purchases.purchase',
      'purchases.receipt',
    ]);
  });

  it('grants no root scope, so a widening stays a visible diff', () => {
    // `purchases` alone would authorise `purchases.purchase.delete` as readily
    // as the upload, and nothing about bfm's traffic would have changed to
    // reveal it. Dot-prefix matching is what makes the narrow entry a control.
    for (const scope of BFM_SERVICE_ACCOUNT_SCOPES) {
      expect(scope).toContain('.');
    }
  });

  it('contains no wildcard', () => {
    for (const scope of BFM_SERVICE_ACCOUNT_SCOPES) {
      expect(scope).not.toContain('*');
      expect(scope).not.toBe('');
    }
  });
});

/**
 * The two axes meeting (ADR-048).
 *
 * A capability says what a handset may ask bfm for; a scope says what bfm may
 * ask a sibling for. Granting the first without the second produces a device
 * that is allowed to make a call bfm is then refused — a 403 from a pillar,
 * arriving at the phone as an upstream failure, for a configuration mistake
 * nothing else in the tree would have caught.
 */
describe('every capability has the downstream scope it leans on', () => {
  it('names a scope bfm actually holds, for every capability that needs one', () => {
    const unbacked = Object.entries(MOBILE_CAPABILITY_SCOPES)
      .filter((entry): entry is [string, string] => entry[1] !== null)
      .filter(([, scope]) => !BFM_SERVICE_ACCOUNT_SCOPES.includes(scope))
      .map(([capability]) => capability);

    expect(unbacked).toEqual([]);
  });

  it('recognises an unbacked capability when it sees one', () => {
    // The degenerate case, planted. Without it this reads as green on the day
    // the map is empty or the filter stops matching anything.
    const planted: Record<string, string | null> = {
      'session.read': null,
      'media.watchlist.write': 'media.watchlist',
    };

    const unbacked = Object.entries(planted)
      .filter((entry): entry is [string, string] => entry[1] !== null)
      .filter(([, scope]) => !BFM_SERVICE_ACCOUNT_SCOPES.includes(scope))
      .map(([capability]) => capability);

    expect(unbacked).toEqual(['media.watchlist.write']);
  });

  it('says explicitly which capabilities need no scope at all', () => {
    // `null` is an answer, not an omission: bootstrap calls no pillar's domain
    // surface, so there is no grant that could authorise or refuse it.
    expect(MOBILE_CAPABILITY_SCOPES['session.read']).toBeNull();
  });
});
