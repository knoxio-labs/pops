import { describe, expect, it } from 'vitest';

import { resolveSelfBaseUrl } from '../self-base-url.js';

const FINANCE = { envVar: 'FINANCE_SELF_BASE_URL', port: 3004, processLabel: 'finance-api' };

describe('resolveSelfBaseUrl', () => {
  it('falls back to the loopback origin for the listening port', () => {
    expect(resolveSelfBaseUrl({ ...FINANCE, env: {} })).toBe('http://localhost:3004');
  });

  it('prefers the env var when set', () => {
    expect(
      resolveSelfBaseUrl({ ...FINANCE, env: { FINANCE_SELF_BASE_URL: 'http://finance-api:3004' } })
    ).toBe('http://finance-api:3004');
  });

  it('normalises the value it advertises', () => {
    expect(
      resolveSelfBaseUrl({ ...FINANCE, env: { FINANCE_SELF_BASE_URL: 'http://finance-api:3004/' } })
    ).toBe('http://finance-api:3004');
  });

  // An empty env var is a deploy that meant to set it and did not. Treating it
  // as the loopback fallback would register a localhost origin no sibling can
  // reach, so it must fail instead.
  it('rejects an empty env var rather than falling back', () => {
    expect(() => resolveSelfBaseUrl({ ...FINANCE, env: { FINANCE_SELF_BASE_URL: '' } })).toThrow(
      /not a valid URL/u
    );
  });

  it('reads only its own variable', () => {
    expect(
      resolveSelfBaseUrl({ ...FINANCE, env: { FOOD_SELF_BASE_URL: 'http://food-api:3005' } })
    ).toBe('http://localhost:3004');
  });

  it.each([
    ['a path', 'http://finance-api:3004/v1'],
    ['a query', 'http://finance-api:3004/?a=b'],
    ['a fragment', 'http://finance-api:3004/#top'],
  ])('crashes boot on %s rather than registering it', (_label, raw) => {
    expect(() => resolveSelfBaseUrl({ ...FINANCE, env: { FINANCE_SELF_BASE_URL: raw } })).toThrow(
      /bare origin/u
    );
  });

  it('names the process and the variable so an operator can find both', () => {
    expect(() =>
      resolveSelfBaseUrl({ ...FINANCE, env: { FINANCE_SELF_BASE_URL: 'nonsense' } })
    ).toThrow(/^\[finance-api\] FINANCE_SELF_BASE_URL "nonsense"/u);
  });

  // The registry pillar boots as `core-api` and the orchestrator as
  // `orchestrator`, so the prefix cannot be derived from the pillar id.
  it('uses the caller-supplied process label verbatim', () => {
    expect(() =>
      resolveSelfBaseUrl({
        envVar: 'REGISTRY_SELF_BASE_URL',
        port: 3001,
        processLabel: 'core-api',
        env: { REGISTRY_SELF_BASE_URL: 'nonsense' },
      })
    ).toThrow(/^\[core-api\]/u);
  });

  it('keeps the parse failure as the cause', () => {
    let caught: unknown;
    try {
      resolveSelfBaseUrl({ ...FINANCE, env: { FINANCE_SELF_BASE_URL: 'nonsense' } });
    } catch (err) {
      caught = err;
    }
    expect((caught as Error).cause).toBeInstanceOf(Error);
    expect(((caught as Error).cause as Error).name).toBe('BareOriginParseError');
  });

  it('defaults to process.env when no env is injected', () => {
    const previous = process.env['FINANCE_SELF_BASE_URL'];
    process.env['FINANCE_SELF_BASE_URL'] = 'http://from-process-env:3004';
    try {
      expect(resolveSelfBaseUrl(FINANCE)).toBe('http://from-process-env:3004');
    } finally {
      if (previous === undefined) delete process.env['FINANCE_SELF_BASE_URL'];
      else process.env['FINANCE_SELF_BASE_URL'] = previous;
    }
  });
});
