import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callContractMismatch,
  callOk,
  callUnavailable,
  mockPillarContacts,
  mockPillarFinance,
  pillarMockGetter,
} from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { financeTools } = await import('./finance.js');

const transactions = mockPillarFinance.finance.transactions;
const budgets = mockPillarFinance.finance.budgets;
const entities = mockPillarContacts.contacts.entities;
const corrections = mockPillarFinance.finance.corrections;
const tagRules = mockPillarFinance.finance.tagRules;
const wishlist = mockPillarFinance.finance.wishlist;
const imports = mockPillarFinance.finance.imports;
const search = mockPillarFinance.finance.search;

beforeEach(() => {
  vi.clearAllMocks();
  transactions.list.mockResolvedValue(callOk({ data: [], pagination: { total: 0 } }));
  transactions.get.mockResolvedValue(callOk({ data: null }));
  budgets.list.mockResolvedValue(callOk({ data: [], pagination: { total: 0 } }));
  budgets.get.mockResolvedValue(callOk({ data: null }));
  entities.list.mockResolvedValue(callOk({ data: [], pagination: { total: 0 } }));
  corrections.list.mockResolvedValue(callOk({ data: [], pagination: { total: 0 } }));
  tagRules.vocabulary.mockResolvedValue(callOk({ tags: [] }));
  wishlist.list.mockResolvedValue(callOk({ data: [], pagination: { total: 0 } }));
  wishlist.get.mockResolvedValue(callOk({ data: null }));
  imports.getImportProgress.mockResolvedValue(callOk(null));
  search.search.mockResolvedValue(callOk({ hits: [] }));
});

describe('finance.transactions.list', () => {
  const tool = financeTools.find((t) => t.name === 'finance.transactions.list')!;

  it('passes date filters through', async () => {
    await tool.handler({ startDate: '2025-01-01', endDate: '2025-12-31', type: 'expense' });
    expect(transactions.list).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2025-01-01', endDate: '2025-12-31', type: 'expense' })
    );
  });

  it('ignores invalid type values', async () => {
    await tool.handler({ type: 'invalid' });
    const call = transactions.list.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['type']).toBeUndefined();
  });

  it('returns isError on unavailable', async () => {
    transactions.list.mockResolvedValueOnce(callUnavailable('finance'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it('returns isError on contract-mismatch', async () => {
    transactions.list.mockResolvedValueOnce(callContractMismatch('finance', '1.0.0', '2.0.0'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});

describe('finance.entities.list', () => {
  const tool = financeTools.find((t) => t.name === 'finance.entities.list')!;

  it('calls contacts.entities.list with search filter', async () => {
    await tool.handler({ search: 'woolworths' });
    expect(entities.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'woolworths' }));
  });

  it('ignores unknown entity type values', async () => {
    await tool.handler({ type: 'alien' });
    const call = entities.list.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['type']).toBeUndefined();
  });

  it('passes valid entity type values', async () => {
    await tool.handler({ type: 'company' });
    const call = entities.list.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['type']).toBe('company');
  });
});

describe('finance.budgets.list', () => {
  const tool = financeTools.find((t) => t.name === 'finance.budgets.list')!;

  it('passes period and active filters', async () => {
    await tool.handler({ period: 'monthly', active: 'true' });
    expect(budgets.list).toHaveBeenCalledWith(
      expect.objectContaining({ period: 'monthly', active: 'true' })
    );
  });

  it('ignores invalid period values', async () => {
    await tool.handler({ period: 'weekly' });
    const call = budgets.list.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['period']).toBeUndefined();
  });

  it('returns isError on unavailable', async () => {
    budgets.list.mockResolvedValueOnce(callUnavailable('finance'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});

describe('finance.transactions.get', () => {
  const tool = financeTools.find((t) => t.name === 'finance.transactions.get')!;

  it('calls transactions.get with the id', async () => {
    await tool.handler({ id: 'txn_1' });
    expect(transactions.get).toHaveBeenCalledWith({ id: 'txn_1' });
  });

  it('errors on missing id without calling the pillar', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    expect(transactions.get).not.toHaveBeenCalled();
  });

  it('returns isError on not-found', async () => {
    transactions.get.mockResolvedValueOnce({ kind: 'not-found', pillar: 'finance' });
    const result = await tool.handler({ id: 'missing' });
    expect(result.isError).toBe(true);
  });
});

describe('finance.budgets.get', () => {
  const tool = financeTools.find((t) => t.name === 'finance.budgets.get')!;

  it('calls budgets.get with the id', async () => {
    await tool.handler({ id: 'budget_1' });
    expect(budgets.get).toHaveBeenCalledWith({ id: 'budget_1' });
  });

  it('errors on missing id without calling the pillar', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    expect(budgets.get).not.toHaveBeenCalled();
  });
});

describe('finance.corrections.list', () => {
  const tool = financeTools.find((t) => t.name === 'finance.corrections.list')!;

  it('passes minConfidence and matchType filters', async () => {
    await tool.handler({ minConfidence: 0.8, matchType: 'contains' });
    expect(corrections.list).toHaveBeenCalledWith(
      expect.objectContaining({ minConfidence: 0.8, matchType: 'contains' })
    );
  });

  it('ignores invalid matchType values', async () => {
    await tool.handler({ matchType: 'fuzzy' });
    const call = corrections.list.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['matchType']).toBeUndefined();
  });

  it('returns isError on unavailable', async () => {
    corrections.list.mockResolvedValueOnce(callUnavailable('finance'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});

describe('finance.tagRules.vocabulary', () => {
  const tool = financeTools.find((t) => t.name === 'finance.tagRules.vocabulary')!;

  it('calls tagRules.vocabulary with no arguments', async () => {
    await tool.handler({});
    expect(tagRules.vocabulary).toHaveBeenCalledWith();
  });

  it('returns isError on unavailable', async () => {
    tagRules.vocabulary.mockResolvedValueOnce(callUnavailable('finance'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});

describe('finance.wishlist.list', () => {
  const tool = financeTools.find((t) => t.name === 'finance.wishlist.list')!;

  it('passes search and priority filters', async () => {
    await tool.handler({ search: 'camera', priority: 'high' });
    expect(wishlist.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'camera', priority: 'high' })
    );
  });

  it('returns isError on unavailable', async () => {
    wishlist.list.mockResolvedValueOnce(callUnavailable('finance'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});

describe('finance.wishlist.get', () => {
  const tool = financeTools.find((t) => t.name === 'finance.wishlist.get')!;

  it('calls wishlist.get with the id', async () => {
    await tool.handler({ id: 'wish_1' });
    expect(wishlist.get).toHaveBeenCalledWith({ id: 'wish_1' });
  });

  it('errors on missing id without calling the pillar', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    expect(wishlist.get).not.toHaveBeenCalled();
  });
});

describe('finance.imports.getImportProgress', () => {
  const tool = financeTools.find((t) => t.name === 'finance.imports.getImportProgress')!;

  it('calls imports.getImportProgress with the sessionId', async () => {
    await tool.handler({ sessionId: 'sess_1' });
    expect(imports.getImportProgress).toHaveBeenCalledWith({ sessionId: 'sess_1' });
  });

  it('errors on missing sessionId without calling the pillar', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    expect(imports.getImportProgress).not.toHaveBeenCalled();
  });

  it('returns isError on unavailable', async () => {
    imports.getImportProgress.mockResolvedValueOnce(callUnavailable('finance'));
    const result = await tool.handler({ sessionId: 'sess_1' });
    expect(result.isError).toBe(true);
  });
});

describe('finance.search', () => {
  const tool = financeTools.find((t) => t.name === 'finance.search')!;

  it('wraps the text query without filters', async () => {
    await tool.handler({ text: 'woolworths' });
    expect(search.search).toHaveBeenCalledWith({ query: { text: 'woolworths' } });
  });

  it('includes well-formed structured filters', async () => {
    await tool.handler({
      text: 'groceries',
      filters: [{ field: 'account', operator: 'eq', value: 'checking' }],
    });
    expect(search.search).toHaveBeenCalledWith({
      query: {
        text: 'groceries',
        filters: [{ field: 'account', operator: 'eq', value: 'checking' }],
      },
    });
  });

  it('drops malformed filter entries', async () => {
    await tool.handler({ text: 'groceries', filters: [{ field: 'account' }] });
    expect(search.search).toHaveBeenCalledWith({ query: { text: 'groceries' } });
  });

  it('errors on missing text without calling the pillar', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    expect(search.search).not.toHaveBeenCalled();
  });

  it('returns isError on unavailable', async () => {
    search.search.mockResolvedValueOnce(callUnavailable('finance'));
    const result = await tool.handler({ text: 'x' });
    expect(result.isError).toBe(true);
  });
});

describe('financeTools read-only guarantee', () => {
  it('exposes no mutation-shaped tool names (create/update/delete/apply/reject/etc.)', () => {
    const mutationVerbs = /\.(create|update|delete|apply|propose|reject|revise|restore|commit)/i;
    for (const tool of financeTools) {
      expect(tool.name, `${tool.name} looks like a mutation tool`).not.toMatch(mutationVerbs);
    }
  });
});
