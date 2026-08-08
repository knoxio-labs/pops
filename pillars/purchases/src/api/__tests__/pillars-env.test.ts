/**
 * The `POPS_PILLARS` parser and the bare-origin rule live in
 * `@pops/pillar-sdk/pillar-env` and are asserted there. What is
 * purchases-specific — and asserted here — is how this pillar splices its own
 * synthetic entry into the registry it serves.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PillarsEnvParseError } from '@pops/pillar-sdk/pillar-env';

import { __resetPillarRegistryCache, getPillarRegistry } from '../pillars/registry.js';

beforeEach(() => {
  __resetPillarRegistryCache();
  delete process.env['POPS_PILLARS'];
});

afterEach(() => {
  __resetPillarRegistryCache();
  delete process.env['POPS_PILLARS'];
});

describe('getPillarRegistry', () => {
  it('puts the host pillar first so callers need no special case', () => {
    process.env['POPS_PILLARS'] = 'finance:http://finance-api:3004';
    const entries = getPillarRegistry({ selfBaseUrl: 'http://localhost:3013' });
    expect(entries[0]).toEqual({ id: 'purchases', baseUrl: 'http://localhost:3013' });
    expect(entries).toHaveLength(2);
  });

  it('never lists purchases twice, even when the env names it', () => {
    process.env['POPS_PILLARS'] = 'purchases:http://stale:9999,finance:http://finance-api:3004';
    const entries = getPillarRegistry({ selfBaseUrl: 'http://localhost:3013' });
    expect(entries.filter((e) => e.id === 'purchases')).toEqual([
      { id: 'purchases', baseUrl: 'http://localhost:3013' },
    ]);
  });

  it('normalises the self origin', () => {
    const entries = getPillarRegistry({ selfBaseUrl: 'http://localhost:3013/' });
    expect(entries[0]?.baseUrl).toBe('http://localhost:3013');
  });

  it('rejects an invalid self origin rather than publishing it', () => {
    expect(() => getPillarRegistry({ selfBaseUrl: 'not-a-url' })).toThrow(/not a valid URL/u);
  });

  it('surfaces a malformed POPS_PILLARS rather than serving a partial registry', () => {
    process.env['POPS_PILLARS'] = 'finance:http://finance-api:3004,Bad Id:http://x:1';
    expect(() => getPillarRegistry({ selfBaseUrl: 'http://localhost:3013' })).toThrow(
      PillarsEnvParseError
    );
  });
});
