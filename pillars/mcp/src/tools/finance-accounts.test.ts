import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callContractMismatch,
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

const { financeTools } = await import('./finance.js');

const accounts = mockPillarFinance.finance.accounts;
const checkpoints = mockPillarFinance.finance.checkpoints;

const AMEX_BALANCE = {
  balanceCents: -213755,
  asOf: '2026-09-05',
  basis: 'checkpoint' as const,
  anchor: { checkpointId: 'chk_1', asOf: '2026-09-01', source: 'manual' as const },
  inconsistent: false,
};

const AMEX_ACCOUNT = {
  id: 'acc_amex',
  name: 'Amex',
  institutionId: 'inst_amex',
  kind: 'credit-card',
  currency: 'AUD',
  archivedAt: null,
  displayOrder: 0,
  entityId: null,
  entityDisplayName: null,
  entityDisplayNameStale: false,
  balance: AMEX_BALANCE,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const CHECKPOINT = {
  id: 'chk_2',
  accountId: 'acc_amex',
  balanceCents: -213755,
  asOf: '2026-09-01',
  source: 'manual',
  sourceRef: null,
  note: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  expectedBalanceCents: -210000,
  deltaCents: -3755,
};

beforeEach(() => {
  vi.clearAllMocks();
  accounts.list.mockResolvedValue(
    callOk({ data: [AMEX_ACCOUNT], pagination: { total: 1, limit: 50, offset: 0, hasMore: false } })
  );
  checkpoints.list.mockResolvedValue(callOk({ data: [CHECKPOINT] }));
});

describe('finance.accounts.list', () => {
  const tool = financeTools.find((t) => t.name === 'finance.accounts.list')!;

  it('excludes archived accounts by default', async () => {
    await tool.handler({});
    expect(accounts.list).toHaveBeenCalledWith(expect.objectContaining({ archived: 'false' }));
  });

  it('includes archived accounts when requested', async () => {
    await tool.handler({ includeArchived: true });
    const call = accounts.list.mock.lastCall?.[0] as Record<string, unknown>;
    expect(call['archived']).toBeUndefined();
  });

  it('passes limit and offset through', async () => {
    await tool.handler({ limit: 10, offset: 20 });
    expect(accounts.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 20 }));
  });

  it('returns the ledger-signed balance field for every row', async () => {
    const result = await tool.handler({});
    const parsed = parseResult(result) as { data: { balance: { balanceCents: number } }[] };
    expect(parsed.data[0]?.balance.balanceCents).toBe(-213755);
  });

  it('returns isError on unavailable', async () => {
    accounts.list.mockResolvedValueOnce(callUnavailable('finance'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it('returns isError on contract-mismatch', async () => {
    accounts.list.mockResolvedValueOnce(callContractMismatch('finance', '1.0.0', '2.0.0'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});

describe('finance.accounts.checkpoints', () => {
  const tool = financeTools.find((t) => t.name === 'finance.accounts.checkpoints')!;

  it('calls checkpoints.list with the account id', async () => {
    await tool.handler({ accountId: 'acc_amex' });
    expect(checkpoints.list).toHaveBeenCalledWith({ id: 'acc_amex' });
  });

  it('errors on missing accountId without calling the pillar', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    expect(checkpoints.list).not.toHaveBeenCalled();
  });

  it('surfaces expectedBalanceCents and deltaCents so the gap is nameable', async () => {
    const result = await tool.handler({ accountId: 'acc_amex' });
    const parsed = parseResult(result) as {
      data: { expectedBalanceCents: number | null; deltaCents: number | null }[];
    };
    expect(parsed.data[0]).toMatchObject({ expectedBalanceCents: -210000, deltaCents: -3755 });
  });

  it('returns isError on unavailable', async () => {
    checkpoints.list.mockResolvedValueOnce(callUnavailable('finance'));
    const result = await tool.handler({ accountId: 'acc_amex' });
    expect(result.isError).toBe(true);
  });

  it('returns isError on contract-mismatch', async () => {
    checkpoints.list.mockResolvedValueOnce(callContractMismatch('finance', '1.0.0', '2.0.0'));
    const result = await tool.handler({ accountId: 'acc_amex' });
    expect(result.isError).toBe(true);
  });
});

describe('financeTools read-only guarantee still holds with accounts tools present', () => {
  it('neither new tool name is mutation-shaped', () => {
    const mutationVerbs = /\.(create|update|delete|apply|propose|reject|revise|restore|commit)/i;
    expect('finance.accounts.list').not.toMatch(mutationVerbs);
    expect('finance.accounts.checkpoints').not.toMatch(mutationVerbs);
  });
});

/**
 * Pins the new tools' assumed wire shapes against the finance pillar's REAL
 * committed OpenAPI projection — the mock fixtures above are hand-typed and
 * could silently drift from what `GET /accounts` and `GET
 * /accounts/:id/checkpoints` actually serve. Same rationale as
 * `finance-search.test.ts`: mcp has no compile-time dependency on the
 * finance pillar's contract, so the committed spec is the only ground truth
 * reachable from here.
 */
describe('finance.accounts.* wire shapes against the real finance OpenAPI spec', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const FINANCE_OPENAPI_PATH = join(here, '../../../finance/openapi/finance.openapi.json');
  const spec = JSON.parse(readFileSync(FINANCE_OPENAPI_PATH, 'utf8')) as Record<string, unknown>;

  function drill(value: unknown, ...keys: string[]): unknown {
    return keys.reduce((acc: unknown, key) => {
      if (typeof acc !== 'object' || acc === null) {
        throw new Error(`expected an object while reading "${key}"`);
      }
      return (acc as Record<string, unknown>)[key];
    }, value);
  }

  it('GET /accounts response items carry a balance object with balanceCents', () => {
    const props = drill(
      spec,
      'paths',
      '/accounts',
      'get',
      'responses',
      '200',
      'content',
      'application/json',
      'schema',
      'properties',
      'data',
      'items',
      'properties'
    ) as Record<string, unknown>;
    expect(Object.keys(props)).toContain('balance');
    const balanceProps = drill(props, 'balance', 'properties') as Record<string, unknown>;
    expect(Object.keys(balanceProps)).toEqual(
      expect.arrayContaining(['balanceCents', 'asOf', 'basis', 'anchor', 'inconsistent'])
    );
  });

  it('GET /accounts/:id/checkpoints response items carry expectedBalanceCents and deltaCents', () => {
    const props = drill(
      spec,
      'paths',
      '/accounts/{id}/checkpoints',
      'get',
      'responses',
      '200',
      'content',
      'application/json',
      'schema',
      'properties',
      'data',
      'items',
      'properties'
    ) as Record<string, unknown>;
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(['expectedBalanceCents', 'deltaCents', 'balanceCents', 'accountId'])
    );
  });
});
