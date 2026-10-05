import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callContractMismatch,
  callOk,
  callUnavailable,
  extractText,
  mockPillarPurchases,
  parseResult,
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
  it('writes nothing but an inventory-proposal accept', () => {
    // Confirming a line's kind is where a machine proposal becomes a human
    // assertion. A tool that could do it would erase the only thing that
    // tells the two apart. Declining an offer is the same kind of judgement.
    const names = purchasesTools.map((t) => t.name);
    for (const forbidden of [
      'create',
      'delete',
      'patch',
      'confirm',
      'upload',
      'sweep',
      'unlink',
      'decline',
      'decide',
    ]) {
      expect(names.some((name) => name.toLowerCase().includes(forbidden))).toBe(false);
    }
    expect(
      names.filter(
        (name) => !/\.(list|get|search|byTag|merchantSpend|productLeaderboard)$/.test(name)
      )
    ).toEqual(['purchases.inventoryProposals.accept']);
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

  it('adds purchase URIs to every listed order', async () => {
    purchase.list.mockResolvedValueOnce(
      callOk({ items: [{ id: 'ord_1' }, { id: 'ord_2' }], total: 2 })
    );

    const result = await tool('purchases.orders.list').handler({});

    expect(parseResult(result)).toEqual({
      items: [
        { id: 'ord_1', uri: 'pops:purchases/purchase/ord_1' },
        { id: 'ord_2', uri: 'pops:purchases/purchase/ord_2' },
      ],
      total: 2,
    });
  });

  it('rejects a plain date with a field-specific timestamp hint', async () => {
    const result = await tool('purchases.orders.list').handler({ from: '2026-01-01' });

    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain("Invalid field 'from'");
    expect(extractText(result)).toContain('ISO-8601 timestamp with a timezone');
    expect(purchase.list).not.toHaveBeenCalled();
  });

  it('names the field when a timestamp does not name a real date', async () => {
    const result = await tool('purchases.orders.list').handler({
      to: '2026-02-30T00:00:00Z',
    });

    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain("Invalid field 'to'");
    expect(purchase.list).not.toHaveBeenCalled();
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

  it('advertises timezone-bearing timestamps for the order date filters', () => {
    const properties = tool('purchases.orders.list').inputSchema['properties'] as Record<
      string,
      { description?: string; format?: string }
    >;

    expect(properties['from']?.format).toBe('date-time');
    expect(properties['from']?.description).toContain('2026-02-02T01:41:21Z');
    expect(properties['to']?.format).toBe('date-time');
    expect(properties['to']?.description).toContain('2026-02-02T01:41:21Z');
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

  it('adds a URI to the purchase while leaving its line items unchanged', async () => {
    purchase.get.mockResolvedValueOnce(
      callOk({ purchase: { id: 'ord_1' }, items: [{ id: 'line_1' }] })
    );

    const result = await tool('purchases.orders.get').handler({ id: 'ord_1' });

    expect(parseResult(result)).toEqual({
      purchase: { id: 'ord_1', uri: 'pops:purchases/purchase/ord_1' },
      items: [{ id: 'line_1' }],
    });
  });

  it('keeps a null purchase payload as a successful result', async () => {
    const result = await tool('purchases.orders.get').handler({ id: 'ord_1' });

    expect(result.isError).not.toBe(true);
    expect(parseResult(result)).toBeNull();
  });

  it('surfaces a contract mismatch as a tool error', async () => {
    purchase.get.mockResolvedValueOnce(callContractMismatch('purchases', '1.0.0', '2.0.0'));
    expect((await tool('purchases.orders.get').handler({ id: 'ord_1' })).isError).toBe(true);
  });
});

describe('purchases.search', () => {
  it('returns its hits unchanged because they already carry purchase URIs', async () => {
    const hits = {
      hits: [{ kind: 'purchase', uri: 'pops:purchases/purchase/ord_1' }],
    };
    search.search.mockResolvedValueOnce(callOk(hits));

    const result = await tool('purchases.search').handler({ text: 'order' });

    expect(parseResult(result)).toEqual(hits);
  });

  it('wraps the text in the query envelope the pillar contract takes', async () => {
    await tool('purchases.search').handler({ text: 'dosing funnel' });
    expect(search.search).toHaveBeenCalledWith({ query: { text: 'dosing funnel' } });
  });

  it('exposes the purchase scope and translates it into structured filters', async () => {
    const searchTool = tool('purchases.search');
    const properties = searchTool.inputSchema['properties'];
    expect(properties).toHaveProperty('sources');
    expect(properties).toHaveProperty('statuses');
    expect(properties).toHaveProperty('from');
    expect(properties).toHaveProperty('to');

    await searchTool.handler({
      text: 'dosing funnel',
      sources: ['amazon', 'woolworths'],
      statuses: ['linked', 'future_status'],
      from: '2026-01-01T00:00:00Z',
      to: '2026-12-31T23:59:59Z',
    });

    expect(search.search).toHaveBeenCalledWith({
      query: {
        text: 'dosing funnel',
        filters: [
          { field: 'source', operator: 'eq', value: 'amazon' },
          { field: 'source', operator: 'eq', value: 'woolworths' },
          { field: 'status', operator: 'eq', value: 'linked' },
          { field: 'status', operator: 'eq', value: 'future_status' },
          { field: 'orderedAt', operator: 'gte', value: '2026-01-01T00:00:00Z' },
          { field: 'orderedAt', operator: 'lte', value: '2026-12-31T23:59:59Z' },
        ],
      },
    });
  });

  it('rejects a plain date with a field-specific timestamp hint', async () => {
    const result = await tool('purchases.search').handler({ text: 'kettle', from: '2026-01-01' });

    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain("Invalid field 'from'");
    expect(extractText(result)).toContain('ISO-8601 timestamp with a timezone');
    expect(search.search).not.toHaveBeenCalled();
  });

  it('refuses an empty query rather than asking the pillar for everything', async () => {
    const result = await tool('purchases.search').handler({ text: '' });
    expect(result.isError).toBe(true);
    expect(search.search).not.toHaveBeenCalled();
  });
});

describe('purchases.items.byTag', () => {
  it('adds a purchase URI to tagged-item results without assigning a line URI', async () => {
    purchase.itemsByTag.mockResolvedValueOnce(
      callOk({
        items: [
          { item: { id: 'line_1', purchaseId: 'ord_1' }, confirmedAt: null },
          { item: { id: 'line_2' }, confirmedAt: null },
          { confirmedAt: null },
        ],
      })
    );

    const result = await tool('purchases.items.byTag').handler({ tag: 'snack' });

    expect(parseResult(result)).toEqual({
      items: [
        {
          item: { id: 'line_1', purchaseId: 'ord_1' },
          confirmedAt: null,
          purchaseUri: 'pops:purchases/purchase/ord_1',
        },
        { item: { id: 'line_2' }, confirmedAt: null },
        { confirmedAt: null },
      ],
    });
  });

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

  it('rejects a plain date with a field-specific timestamp hint', async () => {
    const result = await tool('purchases.analytics.merchantSpend').handler({ to: '2026-01-01' });

    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain("Invalid field 'to'");
    expect(extractText(result)).toContain('ISO-8601 timestamp with a timezone');
    expect(analytics.merchantSpend).not.toHaveBeenCalled();
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

describe('purchases.analytics.productLeaderboard', () => {
  it('passes every contract scope field to the purchases pillar', async () => {
    await tool('purchases.analytics.productLeaderboard').handler({
      sources: 'amazon',
      statuses: ['settled_cash'],
      from: '2026-01-01T00:00:00Z',
      to: '2026-12-31T23:59:59Z',
      minOrderCount: 3,
    });

    expect(analytics.productLeaderboard).toHaveBeenCalledWith({
      sources: ['amazon'],
      statuses: ['settled_cash'],
      from: '2026-01-01T00:00:00Z',
      to: '2026-12-31T23:59:59Z',
      minOrderCount: 3,
    });
  });

  it('rejects a date without a timezone before calling the purchases pillar', async () => {
    const result = await tool('purchases.analytics.productLeaderboard').handler({
      from: '2026-01-01',
    });

    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain("Invalid field 'from'");
    expect(analytics.productLeaderboard).not.toHaveBeenCalled();
  });

  it('advertises the minimum order count and does not paginate a complete roll-up', () => {
    const properties = tool('purchases.analytics.productLeaderboard').inputSchema['properties'];
    if (!properties) throw new Error('product leaderboard input schema has no properties');
    expect(properties).toHaveProperty('sources');
    expect(properties).toHaveProperty('statuses');
    expect(properties).toHaveProperty('from');
    expect(properties).toHaveProperty('to');
    expect(properties['minOrderCount']).toMatchObject({
      type: 'number',
      minimum: 1,
      multipleOf: 1,
    });
    expect(Object.keys(properties)).not.toContain('limit');
  });

  it('returns the product roll-up body and reports an unavailable pillar', async () => {
    analytics.productLeaderboard.mockResolvedValueOnce(
      callOk({ minOrderCount: 2, products: [{ identity: { basis: 'name', name: 'Coffee' } }] })
    );
    const result = await tool('purchases.analytics.productLeaderboard').handler({
      minOrderCount: 2,
    });
    expect(extractText(result)).toContain('Coffee');

    analytics.productLeaderboard.mockResolvedValueOnce(callUnavailable('purchases'));
    expect((await tool('purchases.analytics.productLeaderboard').handler({})).isError).toBe(true);
  });
});
