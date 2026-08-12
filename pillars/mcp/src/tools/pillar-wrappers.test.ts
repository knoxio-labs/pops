/**
 * Regression guard for the pillar-SDK client wrappers.
 *
 * The REST transport resolves a call by joining the proxy path into an
 * operationId `'<domain>.<proc>'` with NO pillarId prefix (see
 * `@pops/pillar-sdk` `rest-call`, and every pillar's `/openapi`). A wrapper that
 * accesses `.<pillar>` on the handle injects a redundant leading segment, so the
 * call resolves to a nonexistent `<pillar>.<domain>.<proc>` operationId and every
 * tool fails as `contract-mismatch`. These tests assert each wrapper invokes with
 * a two-part `[domain, proc]` path whose first segment is the domain, not the
 * pillar id — the exact shape the openapi route map is keyed by.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cerebrumTools } from './cerebrum.js';
import { contacts, finance } from './finance-client.js';
import { connectionTools } from './inventory-connections.js';
import { fixtures } from './inventory-fixtures-write.js';
import { items } from './inventory-items-write.js';
import { locationTools } from './inventory-locations.js';
import { mediaTools } from './media.js';
import { purchasesTools } from './purchases.js';

import type { ToolDef } from './tool-def.js';

const h = vi.hoisted(() => {
  let lastPath: readonly string[] | undefined;
  const recordingHandle = (): unknown => {
    const build = (path: readonly string[]): unknown =>
      new Proxy(() => undefined, {
        get(_t, prop) {
          if (typeof prop !== 'string' || prop === 'then') return undefined;
          return build([...path, prop]);
        },
        apply() {
          lastPath = path;
          return Promise.resolve({ kind: 'ok', value: null });
        },
      });
    return build([]);
  };
  return {
    recordingHandle,
    lastPath: () => lastPath,
    reset: () => {
      lastPath = undefined;
    },
  };
});

vi.mock('../pillar-client.js', () => ({
  getPillar: () => h.recordingHandle(),
}));

const PILLAR_IDS = ['finance', 'contacts', 'inventory', 'media', 'cerebrum', 'purchases'];

function handlerFor(tools: readonly ToolDef[], name: string): ToolDef['handler'] {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool.handler;
}

beforeEach(() => {
  h.reset();
});

describe('pillar client wrappers resolve to [domain, proc] operationIds', () => {
  it('finance() → transactions.list', async () => {
    await finance().transactions.list({});
    expect(h.lastPath()).toEqual(['transactions', 'list']);
  });

  it('contacts() → entities.list', async () => {
    await contacts().entities.list({});
    expect(h.lastPath()).toEqual(['entities', 'list']);
  });

  it('items() → items.list', async () => {
    await items().list({});
    expect(h.lastPath()).toEqual(['items', 'list']);
  });

  it('fixtures() → fixtures.list', async () => {
    await fixtures().list({});
    expect(h.lastPath()).toEqual(['fixtures', 'list']);
  });

  it('media watchlist.list tool → watchlist.list', async () => {
    await handlerFor(mediaTools, 'media.watchlist.list')({});
    expect(h.lastPath()).toEqual(['watchlist', 'list']);
  });

  it('cerebrum engrams.list tool → engrams.list', async () => {
    await handlerFor(cerebrumTools, 'cerebrum.engrams.list')({});
    expect(h.lastPath()).toEqual(['engrams', 'list']);
  });

  it('inventory connections.list tool → connections.listForItem', async () => {
    await handlerFor(connectionTools, 'inventory.connections.list')({ itemId: 'i1' });
    expect(h.lastPath()).toEqual(['connections', 'listForItem']);
  });

  it('inventory locations.list tool → locations.list', async () => {
    await handlerFor(locationTools, 'inventory.locations.list')({});
    expect(h.lastPath()).toEqual(['locations', 'list']);
  });

  it('purchases orders.get tool → purchase.get', async () => {
    await handlerFor(purchasesTools, 'purchases.orders.get')({ id: 'ord_1' });
    expect(h.lastPath()).toEqual(['purchase', 'get']);
  });

  it('purchases search tool → search.search', async () => {
    await handlerFor(purchasesTools, 'purchases.search')({ text: 'funnel' });
    expect(h.lastPath()).toEqual(['search', 'search']);
  });

  it('purchases merchantSpend tool → analytics.merchantSpend', async () => {
    await handlerFor(purchasesTools, 'purchases.analytics.merchantSpend')({});
    expect(h.lastPath()).toEqual(['analytics', 'merchantSpend']);
  });

  it('never prefixes the operationId with a pillar id', async () => {
    await finance().transactions.list({});
    expect(PILLAR_IDS).not.toContain(h.lastPath()?.[0]);
  });
});
