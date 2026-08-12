import { describe, expect, it } from 'vitest';

import { DEFAULT_PAIRING_CODE_TTL_MS } from '../../db/index.js';
import {
  DEFAULT_PORT,
  DEFAULT_SQLITE_PATH,
  resolvePairingCodeIssuanceLimit,
  resolvePairingCodeTtlMs,
  resolvePort,
  resolvePublicBaseUrl,
  resolveSelfBaseUrl,
  resolveSqlitePath,
  resolveVersion,
  shouldSelfRegister,
} from '../boot-env.js';
import { PAIRING_CODE_RATE_LIMIT } from '../rate-limit.js';

describe('resolvePort', () => {
  it('defaults to the pillar port when PORT is absent or empty', () => {
    expect(resolvePort({})).toBe(DEFAULT_PORT);
    expect(resolvePort({ PORT: '' })).toBe(DEFAULT_PORT);
    expect(DEFAULT_PORT).toBe(3014);
  });

  it('accepts a valid port', () => {
    expect(resolvePort({ PORT: '8080' })).toBe(8080);
  });

  it.each([
    ['non-numeric', 'notanumber'],
    ['fractional', '3014.5'],
    ['zero', '0'],
    ['negative', '-1'],
    ['above the 16-bit range', '65536'],
    ['whitespace, which Number coerces to 0', ' '],
  ])('rejects a %s PORT rather than binding something unintended', (_label, raw) => {
    expect(() => resolvePort({ PORT: raw })).toThrow(/PORT must be a positive integer/u);
  });

  it('accepts the boundary ports', () => {
    expect(resolvePort({ PORT: '1' })).toBe(1);
    expect(resolvePort({ PORT: '65535' })).toBe(65535);
  });
});

describe('shouldSelfRegister', () => {
  it('is off unless POPS_REGISTRY_ENABLED is exactly "true"', () => {
    expect(shouldSelfRegister({})).toBe(false);
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: '' })).toBe(false);
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: 'false' })).toBe(false);
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: '1' })).toBe(false);
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: 'TRUE' })).toBe(false);
  });

  it('is on for the exact opt-in string', () => {
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: 'true' })).toBe(true);
  });
});

describe('resolveVersion', () => {
  it('defaults to dev', () => {
    expect(resolveVersion({})).toBe('dev');
    expect(resolveVersion({ BUILD_VERSION: '' })).toBe('dev');
  });

  it('passes a build identifier through verbatim, semver or not', () => {
    expect(resolveVersion({ BUILD_VERSION: '1.2.3' })).toBe('1.2.3');
    expect(resolveVersion({ BUILD_VERSION: 'abc1234' })).toBe('abc1234');
  });
});

// The bare-origin rule itself is the SDK's and is asserted in
// `@pops/pillar-sdk/pillar-env`. What is bfm's — and asserted here — is that
// this pillar reads the right variable, falls back to the right port, and
// reports failures under its own process label.
describe('resolveSelfBaseUrl', () => {
  it('falls back to the loopback origin for the listening port', () => {
    expect(resolveSelfBaseUrl(3014, {})).toBe('http://localhost:3014');
  });

  it('prefers BFM_SELF_BASE_URL when set', () => {
    expect(resolveSelfBaseUrl(3014, { BFM_SELF_BASE_URL: 'http://bfm-api:3014' })).toBe(
      'http://bfm-api:3014'
    );
  });

  it('normalises the origin it advertises', () => {
    expect(resolveSelfBaseUrl(3014, { BFM_SELF_BASE_URL: 'http://bfm-api:3014/' })).toBe(
      'http://bfm-api:3014'
    );
  });

  it('crashes loudly rather than registering an invalid baseUrl', () => {
    expect(() => resolveSelfBaseUrl(3014, { BFM_SELF_BASE_URL: 'http://bfm-api:3014/v1' })).toThrow(
      /^\[bfm-api\] BFM_SELF_BASE_URL .* bare origin/u
    );
  });

  it('reads only its own variable', () => {
    expect(resolveSelfBaseUrl(3014, { FOOD_SELF_BASE_URL: 'http://food-api:3005' })).toBe(
      'http://localhost:3014'
    );
  });
});

/**
 * The public origin is the one baked into the pairing QR, so it is the one the
 * PHONE dials — distinct from the in-cluster origin bfm advertises to the
 * registry. Conflating them publishes a `pops-backend`-internal hostname to a
 * handset on cellular.
 */
describe('resolvePublicBaseUrl', () => {
  it('prefers BFM_PUBLIC_BASE_URL when set', () => {
    expect(
      resolvePublicBaseUrl(3014, {
        BFM_PUBLIC_BASE_URL: 'https://bfm.example.com',
        BFM_SELF_BASE_URL: 'http://bfm-api:3014',
      })
    ).toBe('https://bfm.example.com');
  });

  it('falls back to the self base URL, which is the right answer only in dev', () => {
    expect(resolvePublicBaseUrl(3014, { BFM_SELF_BASE_URL: 'http://bfm-api:3014' })).toBe(
      'http://bfm-api:3014'
    );
    expect(resolvePublicBaseUrl(3014, {})).toBe('http://localhost:3014');
  });

  it('treats an empty value as unset rather than as an origin', () => {
    expect(resolvePublicBaseUrl(3014, { BFM_PUBLIC_BASE_URL: '' })).toBe('http://localhost:3014');
  });

  it('normalises the origin', () => {
    expect(resolvePublicBaseUrl(3014, { BFM_PUBLIC_BASE_URL: 'https://bfm.example.com/' })).toBe(
      'https://bfm.example.com'
    );
  });

  /** A path here would produce a pairing URL with a doubled prefix. */
  it('crashes loudly on a value carrying a path', () => {
    expect(() =>
      resolvePublicBaseUrl(3014, { BFM_PUBLIC_BASE_URL: 'https://bfm.example.com/bfm-api' })
    ).toThrow(/^\[bfm-api\] BFM_PUBLIC_BASE_URL .* bare origin/u);
  });
});

describe('resolveSqlitePath', () => {
  it('defaults under ./data when nothing is configured', () => {
    expect(resolveSqlitePath({})).toBe(DEFAULT_SQLITE_PATH);
    expect(DEFAULT_SQLITE_PATH).toBe('./data/bfm.db');
  });

  it('prefers BFM_SQLITE_PATH verbatim, absolute or relative', () => {
    expect(resolveSqlitePath({ BFM_SQLITE_PATH: '/data/sqlite/bfm.db' })).toBe(
      '/data/sqlite/bfm.db'
    );
    expect(resolveSqlitePath({ BFM_SQLITE_PATH: './tmp/other-name.db' })).toBe(
      './tmp/other-name.db'
    );
  });

  // The compose service sets the literal path this asserts. If the two ever
  // disagree the Litestream stream replicates a file the pillar does not
  // write, which fails silently — there is no backup, and nothing says so.
  it('lands bfm.db in the directory the container mounts its volume at', () => {
    expect(resolveSqlitePath({ BFM_SQLITE_PATH: '/data/sqlite/bfm.db' })).toBe(
      '/data/sqlite/bfm.db'
    );
  });

  it('derives its own file from a fleet-wide SQLITE_PATH', () => {
    expect(resolveSqlitePath({ SQLITE_PATH: '/data/sqlite/shared.db' })).toBe(
      '/data/sqlite/bfm.db'
    );
  });

  it('never shares a file with the pillar that set SQLITE_PATH', () => {
    expect(resolveSqlitePath({ SQLITE_PATH: '/data/sqlite/finance.db' })).not.toBe(
      '/data/sqlite/finance.db'
    );
  });

  it('lets its own variable win over the shared one', () => {
    expect(
      resolveSqlitePath({ BFM_SQLITE_PATH: '/elsewhere/bfm.db', SQLITE_PATH: '/data/sqlite/x.db' })
    ).toBe('/elsewhere/bfm.db');
  });

  // A compose interpolation that resolved to nothing leaves `VAR=` behind.
  // Honouring that as a path would open a database at the process CWD.
  it.each([
    ['empty', ''],
    ['whitespace', '   '],
  ])('treats a %s value as unset rather than as a path', (_label, raw) => {
    expect(resolveSqlitePath({ BFM_SQLITE_PATH: raw })).toBe(DEFAULT_SQLITE_PATH);
    expect(resolveSqlitePath({ SQLITE_PATH: raw })).toBe(DEFAULT_SQLITE_PATH);
  });
});

// The default is a security control, not a convenience default — see
// `resolvePairingCodeIssuanceLimit`'s doc comment for why it may be raised at
// all and for which one caller does it.
describe('resolvePairingCodeIssuanceLimit', () => {
  it('defaults to the security limit when unset or empty', () => {
    expect(resolvePairingCodeIssuanceLimit({})).toBe(PAIRING_CODE_RATE_LIMIT);
    expect(resolvePairingCodeIssuanceLimit({ BFM_PAIRING_CODE_ISSUANCE_LIMIT: '' })).toBe(
      PAIRING_CODE_RATE_LIMIT
    );
    expect(PAIRING_CODE_RATE_LIMIT).toBe(5);
  });

  it('accepts a raised budget', () => {
    expect(resolvePairingCodeIssuanceLimit({ BFM_PAIRING_CODE_ISSUANCE_LIMIT: '50' })).toBe(50);
  });

  it.each([
    ['non-numeric', 'notanumber'],
    ['fractional', '1.5'],
    ['zero', '0'],
    ['negative', '-1'],
  ])('rejects a %s limit rather than silently keeping the default', (_label, raw) => {
    expect(() => resolvePairingCodeIssuanceLimit({ BFM_PAIRING_CODE_ISSUANCE_LIMIT: raw })).toThrow(
      /BFM_PAIRING_CODE_ISSUANCE_LIMIT must be a positive integer/u
    );
  });
});

// The default is a security control, not a convenience default — see
// `resolvePairingCodeTtlMs`'s doc comment for why it may be raised at all and
// for which one caller does it.
describe('resolvePairingCodeTtlMs', () => {
  it('defaults to the security TTL when unset or empty', () => {
    expect(resolvePairingCodeTtlMs({})).toBe(DEFAULT_PAIRING_CODE_TTL_MS);
    expect(resolvePairingCodeTtlMs({ BFM_PAIRING_CODE_TTL_MS: '' })).toBe(
      DEFAULT_PAIRING_CODE_TTL_MS
    );
    expect(DEFAULT_PAIRING_CODE_TTL_MS).toBe(5 * 60 * 1000);
  });

  it('accepts a raised TTL', () => {
    expect(resolvePairingCodeTtlMs({ BFM_PAIRING_CODE_TTL_MS: '1800000' })).toBe(1_800_000);
  });

  it.each([
    ['non-numeric', 'notanumber'],
    ['fractional', '1.5'],
    ['zero', '0'],
    ['negative', '-1'],
  ])('rejects a %s TTL rather than silently keeping the default', (_label, raw) => {
    expect(() => resolvePairingCodeTtlMs({ BFM_PAIRING_CODE_TTL_MS: raw })).toThrow(
      /BFM_PAIRING_CODE_TTL_MS must be a positive integer/u
    );
  });
});
