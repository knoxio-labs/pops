import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ webList: vi.fn() }));

vi.mock('../../inventory-api/index.js', () => ({
  webList: (...args: unknown[]) => mocks.webList(...args),
}));

import { listLabelItems } from './label-subject-reads.js';

function page(items: { id: string }[], nextCursor: string | null) {
  return { data: { items, nextCursor }, error: undefined, response: { status: 200 } };
}

beforeEach(() => mocks.webList.mockReset());

describe('listLabelItems', () => {
  it('reads every descendant page with inactive items included', async () => {
    mocks.webList.mockResolvedValueOnce(page([{ id: 'child' }], 'second'));
    mocks.webList.mockResolvedValueOnce(page([{ id: 'deep' }], null));

    const items = await listLabelItems({ within: 'box', includeInactive: true });

    expect(items.map((item) => item.id)).toEqual(['child', 'deep']);
    expect(mocks.webList).toHaveBeenNthCalledWith(1, {
      query: { within: 'box', includeInactive: true, limit: 200 },
    });
    expect(mocks.webList).toHaveBeenNthCalledWith(2, {
      query: { within: 'box', includeInactive: true, limit: 200, cursor: 'second' },
    });
  });

  it('reads all selected and direct-content pages with their original filters', async () => {
    mocks.webList.mockResolvedValueOnce(page([{ id: 'first' }], 'more'));
    mocks.webList.mockResolvedValueOnce(page([{ id: 'second' }], null));
    mocks.webList.mockResolvedValueOnce(page([{ id: 'held' }], null));

    expect((await listLabelItems({ ids: 'first,second' })).map((item) => item.id)).toEqual([
      'first',
      'second',
    ]);
    expect((await listLabelItems({ containingItemId: 'box' })).map((item) => item.id)).toEqual([
      'held',
    ]);
    expect(mocks.webList).toHaveBeenNthCalledWith(3, {
      query: { containingItemId: 'box', limit: 200 },
    });
  });

  it('rejects a repeated cursor instead of silently accepting incomplete results', async () => {
    mocks.webList.mockResolvedValueOnce(page([], 'again'));
    mocks.webList.mockResolvedValueOnce(page([], 'again'));

    await expect(listLabelItems({ within: 'box' })).rejects.toThrow('repeated page cursor');
    expect(mocks.webList).toHaveBeenCalledTimes(2);
  });
});
