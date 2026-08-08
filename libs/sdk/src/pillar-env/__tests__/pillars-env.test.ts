/**
 * The `POPS_PILLARS` parser is strict on purpose: a malformed entry must crash
 * boot rather than silently drop a pillar, because a dropped entry surfaces
 * later as an unexplained "pillar unavailable" with no clue where it went.
 */
import { describe, expect, it } from 'vitest';

import { BareOriginParseError } from '../bare-origin.js';
import { parsePillarsEnv, PillarsEnvParseError } from '../pillars-env.js';

describe('parsePillarsEnv', () => {
  it('returns nothing for empty input by default', () => {
    expect(parsePillarsEnv(undefined)).toEqual([]);
    expect(parsePillarsEnv('')).toEqual([]);
    expect(parsePillarsEnv('   ')).toEqual([]);
  });

  it('throws on empty input when the deploy requires the variable', () => {
    expect(() => parsePillarsEnv('', { allowEmpty: false })).toThrow(PillarsEnvParseError);
    expect(() => parsePillarsEnv(undefined, { allowEmpty: false })).toThrow(PillarsEnvParseError);
  });

  it('parses a single entry', () => {
    expect(parsePillarsEnv('finance:http://finance-api:3004')).toEqual([
      { id: 'finance', baseUrl: 'http://finance-api:3004' },
    ]);
  });

  it('parses several entries and tolerates whitespace', () => {
    expect(
      parsePillarsEnv(' finance : http://finance-api:3004 , food:http://food-api:3005 ')
    ).toEqual([
      { id: 'finance', baseUrl: 'http://finance-api:3004' },
      { id: 'food', baseUrl: 'http://food-api:3005' },
    ]);
  });

  it('preserves declaration order', () => {
    const parsed = parsePillarsEnv('food:http://b:2,ai:http://a:1,lists:http://c:3');
    expect(parsed.map((e) => e.id)).toEqual(['food', 'ai', 'lists']);
  });

  it('strips a trailing slash to a bare origin', () => {
    expect(parsePillarsEnv('finance:http://finance-api:3004/')).toEqual([
      { id: 'finance', baseUrl: 'http://finance-api:3004' },
    ]);
  });

  // The colon split is on the FIRST colon, so the scheme's own colon and the
  // port's colon both survive into the baseUrl half.
  it('splits on the first colon only, leaving scheme and port intact', () => {
    expect(parsePillarsEnv('finance:https://finance.example.com:8443')).toEqual([
      { id: 'finance', baseUrl: 'https://finance.example.com:8443' },
    ]);
  });

  it('accepts a kebab-case id', () => {
    expect(parsePillarsEnv('my-pillar-2:http://x:1')).toEqual([
      { id: 'my-pillar-2', baseUrl: 'http://x:1' },
    ]);
  });

  it.each([
    ['a missing colon', 'finance'],
    ['a missing id', ':http://x:1'],
    ['a missing baseUrl', 'finance:'],
    ['an uppercase id', 'Finance:http://x:1'],
    ['an id with an underscore', 'my_pillar:http://x:1'],
    ['a leading comma', ',finance:http://x:1'],
    ['a trailing comma', 'finance:http://x:1,'],
    ['a stray comma', 'finance:http://x:1,,food:http://y:2'],
    ['a duplicate id', 'finance:http://x:1,finance:http://y:2'],
    ['a non-URL baseUrl', 'finance:not a url'],
    ['a non-http scheme', 'finance:ftp://x:1'],
    ['a path on the origin', 'finance:http://x:1/api'],
    ['a query on the origin', 'finance:http://x:1?a=b'],
    ['a fragment on the origin', 'finance:http://x:1#top'],
  ])('rejects %s', (_label, raw) => {
    expect(() => parsePillarsEnv(raw)).toThrow(PillarsEnvParseError);
  });

  it('rejects a duplicate id rather than letting the last entry win', () => {
    expect(() => parsePillarsEnv('finance:http://x:1,finance:http://y:2')).toThrow(/duplicate/u);
  });

  describe('error messages', () => {
    it('prefixes its errors so an operator can find the variable', () => {
      expect(() => parsePillarsEnv('finance')).toThrow(/^POPS_PILLARS:/u);
    });

    // The origin rule lives in `parseBareOrigin`, which must not claim
    // POPS_PILLARS is at fault — its other callers read a different variable.
    // parsePillarsEnv re-labels the failure on the way out.
    it('prefixes a bare-origin failure too, and names the offending pillar', () => {
      expect(() => parsePillarsEnv('finance:http://x:1/api')).toThrow(
        /^POPS_PILLARS: pillar 'finance' baseUrl "http:\/\/x:1\/api" must be a bare origin/u
      );
    });

    it('reports a bare-origin failure as a PillarsEnvParseError, not the raw cause', () => {
      expect(() => parsePillarsEnv('finance:http://x:1/api')).toThrow(PillarsEnvParseError);
      expect(() => parsePillarsEnv('finance:http://x:1/api')).not.toThrow(BareOriginParseError);
    });

    it('keeps the bare-origin failure as the cause so the chain survives', () => {
      let caught: unknown;
      try {
        parsePillarsEnv('finance:http://x:1/api');
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(PillarsEnvParseError);
      expect((caught as Error).cause).toBeInstanceOf(BareOriginParseError);
    });
  });
});
