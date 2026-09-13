/**
 * `finance.summary.get` — its behaviour, and its advertised `window`
 * vocabulary pinned against the finance pillar's REAL enforcement.
 *
 * `SUMMARY_WINDOWS` in `finance-client.ts` is a hand-maintained mirror of the
 * same-named constant in `pillars/finance/src/contract/summary-windows.ts` —
 * the mcp pillar cannot import that contract module directly (mcp has no
 * compile-time dependency on the finance pillar, and adding one would drag
 * finance's whole runtime dependency set, including its native sqlite
 * binding, into the mcp image). The finance pillar's committed OpenAPI spec
 * is a mechanical projection of that same contract
 * (`pnpm --filter @pops/finance generate:openapi`), so reading it back here
 * is a check against the real enforcement, not a second hand-typed copy.
 *
 * If the vocabulary test fails, `SUMMARY_WINDOWS` no longer matches what
 * `GET /summary` accepts — update it to match, and expect every window the
 * tool advertises but the pillar has dropped to come back as a 400 the model
 * cannot do anything with.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callOk,
  callUnavailable,
  mockPillarFinance,
  parseResult,
  pillarMockGetter,
} from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { SUMMARY_WINDOWS } = await import('./finance-client.js');
const { financeTools } = await import('./finance.js');

const here = dirname(fileURLToPath(import.meta.url));
const FINANCE_OPENAPI_PATH = join(here, '../../../finance/openapi/finance.openapi.json');

function prop(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`expected an object while reading "${key}", got ${typeof value}`);
  }
  return (value as Record<string, unknown>)[key];
}

function readEnforcedWindows(): string[] {
  const spec: unknown = JSON.parse(readFileSync(FINANCE_OPENAPI_PATH, 'utf8'));
  const params = prop(prop(prop(prop(spec, 'paths'), '/summary'), 'get'), 'parameters');
  if (!Array.isArray(params)) throw new Error('expected GET /summary parameters to be an array');
  const windowParam = params.find(
    (p): p is Record<string, unknown> =>
      typeof p === 'object' && p !== null && (p as Record<string, unknown>)['name'] === 'window'
  );
  if (!windowParam) throw new Error('expected a "window" query parameter on GET /summary');
  const values = prop(prop(windowParam, 'schema'), 'enum');
  if (!Array.isArray(values) || !values.every((v): v is string => typeof v === 'string')) {
    throw new Error(`expected the window enum to be a string array, got ${JSON.stringify(values)}`);
  }
  return values;
}

const tool = financeTools.find((t) => t.name === 'finance.summary.get')!;

describe('finance.summary.get window vocabulary', () => {
  const enforced = readEnforcedWindows();

  it('SUMMARY_WINDOWS matches what GET /summary actually enforces', () => {
    expect([...SUMMARY_WINDOWS]).toEqual(enforced);
  });

  it('the advertised tool schema enum matches SUMMARY_WINDOWS', () => {
    const properties = tool.inputSchema.properties as
      | Record<string, { enum?: readonly string[] }>
      | undefined;
    expect(properties?.['window']?.enum).toEqual([...SUMMARY_WINDOWS]);
  });
});

describe('finance.summary.get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defers to the pillar default rather than naming a window itself', async () => {
    await tool.handler({});

    expect(mockPillarFinance.finance.summary.get).toHaveBeenCalledWith({
      window: undefined,
      topLimit: undefined,
    });
  });

  it('forwards every window it advertises', async () => {
    for (const window of SUMMARY_WINDOWS) {
      await tool.handler({ window });
      expect(mockPillarFinance.finance.summary.get).toHaveBeenLastCalledWith({
        window,
        topLimit: undefined,
      });
    }
  });

  it('drops a window it does not recognise instead of forwarding it', async () => {
    // A 400 the model cannot act on is worse than the default window: the
    // question it was asked is still answerable, just over 30 days.
    await tool.handler({ window: 'fortnight' });

    expect(mockPillarFinance.finance.summary.get).toHaveBeenCalledWith({
      window: undefined,
      topLimit: undefined,
    });
  });

  it('forwards topLimit only when it is a number', async () => {
    await tool.handler({ topLimit: 5 });
    expect(mockPillarFinance.finance.summary.get).toHaveBeenLastCalledWith({
      window: undefined,
      topLimit: 5,
    });

    await tool.handler({ topLimit: 'lots' });
    expect(mockPillarFinance.finance.summary.get).toHaveBeenLastCalledWith({
      window: undefined,
      topLimit: undefined,
    });
  });

  it('round-trips the pillar payload verbatim', async () => {
    const body = {
      data: {
        window: { key: '30d', start: '2026-08-14', end: '2026-09-12', previous: null },
        empty: false,
        total: { cents: 1234, transactionCount: 2 },
      },
    };
    mockPillarFinance.finance.summary.get.mockResolvedValueOnce(callOk(body));

    expect(parseResult(await tool.handler({}))).toEqual(body);
  });

  it('surfaces an unavailable pillar as a tool error', async () => {
    mockPillarFinance.finance.summary.get.mockResolvedValueOnce(callUnavailable('finance'));

    expect((await tool.handler({})).isError).toBe(true);
  });
});

describe('finance.summary.get description', () => {
  it('tells the model that a zero-count measure is not a measured zero', () => {
    expect(tool.description).toMatch(/transactionCount 0/u);
  });

  it('says there is no income figure, so nobody looks for one', () => {
    expect(tool.description).toMatch(/no income/u);
  });
});
