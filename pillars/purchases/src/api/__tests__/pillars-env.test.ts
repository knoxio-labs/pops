/**
 * The `POPS_PILLARS` parser is strict on purpose: a malformed entry must
 * crash boot rather than silently drop a pillar, because a dropped entry
 * surfaces later as an unexplained "pillar unavailable" with no clue where
 * it went.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseBareOrigin, parsePillarsEnv, PillarsEnvParseError } from '../pillars/env.js';
import { __resetPillarRegistryCache, getPillarRegistry } from '../pillars/registry.js';

beforeEach(() => {
  __resetPillarRegistryCache();
  delete process.env['POPS_PILLARS'];
});

afterEach(() => {
  __resetPillarRegistryCache();
  delete process.env['POPS_PILLARS'];
});

describe('parsePillarsEnv', () => {
  it('returns nothing for empty input by default', () => {
    expect(parsePillarsEnv(undefined)).toEqual([]);
    expect(parsePillarsEnv('')).toEqual([]);
    expect(parsePillarsEnv('   ')).toEqual([]);
  });

  it('throws on empty input when the deploy requires the variable', () => {
    expect(() => parsePillarsEnv('', { allowEmpty: false })).toThrow(PillarsEnvParseError);
  });

  it('parses several entries and tolerates whitespace', () => {
    expect(
      parsePillarsEnv(' finance : http://finance-api:3004 , food:http://food-api:3005 ')
    ).toEqual([
      { id: 'finance', baseUrl: 'http://finance-api:3004' },
      { id: 'food', baseUrl: 'http://food-api:3005' },
    ]);
  });

  it('strips a trailing slash to a bare origin', () => {
    expect(parsePillarsEnv('finance:http://finance-api:3004/')).toEqual([
      { id: 'finance', baseUrl: 'http://finance-api:3004' },
    ]);
  });

  it.each([
    ['a missing colon', 'finance'],
    ['a missing id', ':http://x:1'],
    ['a missing baseUrl', 'finance:'],
    ['a non-kebab-case id', 'Finance:http://x:1'],
    ['a stray comma', 'finance:http://x:1,,food:http://y:2'],
    ['a duplicate id', 'finance:http://x:1,finance:http://y:2'],
    ['a non-URL baseUrl', 'finance:not a url'],
    ['a non-http scheme', 'finance:ftp://x:1'],
    ['a path on the origin', 'finance:http://x:1/api'],
    ['a query on the origin', 'finance:http://x:1?a=b'],
  ])('rejects %s', (_label, raw) => {
    expect(() => parsePillarsEnv(raw)).toThrow(PillarsEnvParseError);
  });

  it('prefixes its errors so an operator can find the variable', () => {
    expect(() => parsePillarsEnv('finance')).toThrow(/^POPS_PILLARS:/);
  });
});

describe('parseBareOrigin', () => {
  it('normalises a valid origin', () => {
    expect(parseBareOrigin('test', 'https://example.com/')).toBe('https://example.com');
  });

  it('names the label it was given so the message points at the right env', () => {
    expect(() => parseBareOrigin('PURCHASES_SELF_BASE_URL', 'nonsense')).toThrow(
      /PURCHASES_SELF_BASE_URL/
    );
  });
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
    expect(() => getPillarRegistry({ selfBaseUrl: 'not-a-url' })).toThrow(PillarsEnvParseError);
  });
});
