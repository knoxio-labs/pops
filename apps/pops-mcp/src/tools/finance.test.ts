import { describe, expect, it, vi } from 'vitest';

import { mockClient } from './test-helpers.js';

vi.mock('../client.js', () => ({ getClient: () => mockClient }));

const { financeTools } = await import('./finance.js');

describe('finance.transactions.list', () => {
  const tool = financeTools.find((t) => t.name === 'finance.transactions.list')!;

  it('passes date filters through', async () => {
    await tool.handler({ startDate: '2025-01-01', endDate: '2025-12-31', type: 'expense' });
    expect(mockClient.finance.transactions.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2025-01-01', endDate: '2025-12-31', type: 'expense' })
    );
  });

  it('ignores invalid type values', async () => {
    await tool.handler({ type: 'invalid' });
    const call = mockClient.finance.transactions.list.query.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['type']).toBeUndefined();
  });
});

describe('finance.entities.list', () => {
  const tool = financeTools.find((t) => t.name === 'finance.entities.list')!;

  it('calls core.entities.list with search filter', async () => {
    await tool.handler({ search: 'woolworths' });
    expect(mockClient.core.entities.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'woolworths' })
    );
  });

  it('ignores unknown entity type values', async () => {
    await tool.handler({ type: 'alien' });
    const call = mockClient.core.entities.list.query.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['type']).toBeUndefined();
  });

  it('passes valid entity type values', async () => {
    await tool.handler({ type: 'company' });
    const call = mockClient.core.entities.list.query.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['type']).toBe('company');
  });
});

describe('finance.budgets.list', () => {
  const tool = financeTools.find((t) => t.name === 'finance.budgets.list')!;

  it('passes period and active filters', async () => {
    await tool.handler({ period: 'monthly', active: 'true' });
    expect(mockClient.finance.budgets.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ period: 'monthly', active: 'true' })
    );
  });

  it('ignores invalid period values', async () => {
    await tool.handler({ period: 'weekly' });
    const call = mockClient.finance.budgets.list.query.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['period']).toBeUndefined();
  });
});
