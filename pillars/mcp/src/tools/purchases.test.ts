import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callContractMismatch,
  callOk,
  callUnavailable,
  extractText,
  mockPillarPurchases,
  pillarMockGetter,
} from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { purchasesTools, PURCHASE_STATUSES } = await import('./purchases.js');

const purchase = mockPillarPurchases.purchases.purchase;
const analytics = mockPillarPurchases.purchases.analytics;
const search = mockPillarPurchases.purchases.search;

function tool(name: string) {
  const found = purchasesTools.find((t) => t.name === name);
  if (!found) throw new Error(`no such tool: ${name}`);
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  purchase.list.mockResolvedValue(callOk({ items: [] }));
  purchase.get.mockResolvedValue(callOk(null));
  purchase.itemsByTag.mockResolvedValue(callOk({ items: [] }));
  analytics.merchantSpend.mockResolvedValue(
    callOk({ period: { from: null, to: null }, merchants: [], totals: [] })
  );
  search.search.mockResolvedValue(callOk({ hits: [] }));
});

describe('the tool set', () => {
  it('is read-only — no tool reaches a write route', () => {
    // Confirming a line's kind is where a machine proposal becomes a human
    // assertion. A tool that could do it would erase the only thing that
    // tells the two apart.
    const names = purchasesTools.map((t) => t.name);
    for (const forbidden of ['create', 'delete', 'patch', 'confirm', 'upload', 'sweep', 'unlink']) {
      expect(names.some((name) => name.toLowerCase().includes(forbidden))).toBe(false);
    }
  });

  it('names every tool under the purchases namespace', () => {
    for (const t of purchasesTools) expect(t.name.startsWith('purchases.')).toBe(true);
  });
});

describe('purchases.orders.list', () => {
  it('passes the scope filters through', async () => {
    await tool('purchases.orders.list').handler({
      sources: ['amazon'],
      from: '2026-01-01T00:00:00Z',
      to: '2026-12-31T23:59:59Z',
      limit: 10,
    });

    expect(purchase.list).toHaveBeenCalledWith({
      sources: ['amazon'],
      from: '2026-01-01T00:00:00Z',
      to: '2026-12-31T23:59:59Z',
      limit: 10,
    });
  });

  it('lifts a single source string into the repeated-parameter array', async () => {
    await tool('purchases.orders.list').handler({ sources: 'amazon' });
    expect(purchase.list).toHaveBeenCalledWith({ sources: ['amazon'] });
  });

  it('forwards an unrecognised status instead of dropping it', async () => {
    // Dropping it would widen the scope to every order and say nothing. The
    // pillar answers a bad value with a 400, which a model can read.
    await tool('purchases.orders.list').handler({ statuses: ['not_a_status'] });
    expect(purchase.list).toHaveBeenCalledWith({ statuses: ['not_a_status'] });
  });

  it('sends no filter at all when given none', async () => {
    await tool('purchases.orders.list').handler({});
    expect(purchase.list).toHaveBeenCalledWith({});
  });

  it('advertises the pillar status vocabulary to the model', () => {
    const schema = tool('purchases.orders.list').inputSchema;
    const properties = schema['properties'] as Record<string, { items?: { enum?: string[] } }>;
    expect(properties['statuses']?.items?.enum).toEqual([...PURCHASE_STATUSES]);
  });

  it('surfaces an unavailable pillar as a tool error', async () => {
    purchase.list.mockResolvedValueOnce(callUnavailable('purchases'));
    expect((await tool('purchases.orders.list').handler({})).isError).toBe(true);
  });
});

describe('purchases.orders.get', () => {
  it('refuses to call the pillar without an id', async () => {
    const result = await tool('purchases.orders.get').handler({});
    expect(result.isError).toBe(true);
    expect(purchase.get).not.toHaveBeenCalled();
  });

  it('passes the id through', async () => {
    await tool('purchases.orders.get').handler({ id: 'ord_1' });
    expect(purchase.get).toHaveBeenCalledWith({ id: 'ord_1' });
  });

  it('surfaces a contract mismatch as a tool error', async () => {
    purchase.get.mockResolvedValueOnce(callContractMismatch('purchases', '1.0.0', '2.0.0'));
    expect((await tool('purchases.orders.get').handler({ id: 'ord_1' })).isError).toBe(true);
  });
});

describe('purchases.search', () => {
  it('wraps the text in the query envelope the pillar contract takes', async () => {
    await tool('purchases.search').handler({ text: 'dosing funnel' });
    expect(search.search).toHaveBeenCalledWith({ query: { text: 'dosing funnel' } });
  });

  it('refuses an empty query rather than asking the pillar for everything', async () => {
    const result = await tool('purchases.search').handler({ text: '' });
    expect(result.isError).toBe(true);
    expect(search.search).not.toHaveBeenCalled();
  });
});

describe('purchases.items.byTag', () => {
  it('requires the tag', async () => {
    const result = await tool('purchases.items.byTag').handler({});
    expect(result.isError).toBe(true);
    expect(purchase.itemsByTag).not.toHaveBeenCalled();
  });

  it('omits the limit rather than sending an undefined one', async () => {
    await tool('purchases.items.byTag').handler({ tag: 'snack' });
    expect(purchase.itemsByTag).toHaveBeenCalledWith({ tag: 'snack' });
  });

  it('passes a limit when given one', async () => {
    await tool('purchases.items.byTag').handler({ tag: 'snack', limit: 20 });
    expect(purchase.itemsByTag).toHaveBeenCalledWith({ tag: 'snack', limit: 20 });
  });

  it('passes an offset when given one', async () => {
    await tool('purchases.items.byTag').handler({ tag: 'snack', offset: 40 });
    expect(purchase.itemsByTag).toHaveBeenCalledWith({ tag: 'snack', offset: 40 });
  });

  it('tells the model the confirmation marker is not decoration', () => {
    expect(tool('purchases.items.byTag').description).toMatch(/confirmedAt/);
  });

  it('does not claim completeness the response does not deliver', () => {
    const description = tool('purchases.items.byTag').description;
    expect(description).not.toMatch(/^Every line item/);
    expect(description).toMatch(/pagination\.total/);
  });
});

describe('purchases.analytics.merchantSpend', () => {
  it('takes the same scope vocabulary as the order index', async () => {
    await tool('purchases.analytics.merchantSpend').handler({
      sources: ['amazon'],
      from: '2026-01-01T00:00:00Z',
    });

    expect(analytics.merchantSpend).toHaveBeenCalledWith({
      sources: ['amazon'],
      from: '2026-01-01T00:00:00Z',
    });
  });

  it('exposes no limit, because a truncated roll-up is a wrong one', () => {
    const properties = tool('purchases.analytics.merchantSpend').inputSchema['properties'];
    expect(Object.keys(properties as Record<string, unknown>)).not.toContain('limit');
  });

  it('returns the roll-up body verbatim', async () => {
    analytics.merchantSpend.mockResolvedValueOnce(
      callOk({
        period: { from: null, to: null },
        merchants: [{ merchant: { resolution: 'name', entityId: null, name: 'Amazon' } }],
        totals: [],
      })
    );

    const result = await tool('purchases.analytics.merchantSpend').handler({});
    expect(result.isError).toBeUndefined();
    expect(extractText(result)).toContain('Amazon');
  });
});
