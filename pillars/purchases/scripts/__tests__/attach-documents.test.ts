/**
 * The two halves of the attach pass, on their own.
 *
 * The paging walk is here rather than in the CLI suite because the CLI's
 * fixtures are one short page and can never reach the second request. The live
 * Amazon backfill is 748 orders against a 500-row cap, so a walk that stopped
 * at the first page would report 248 orders as "in neither this run nor the
 * database" and drop their evidence — silently, and only in production.
 */
import { afterEach, expect, it, vi } from 'vitest';

import { attachDocuments, fetchPurchaseIdsBySourceOrderId } from '../attach-documents.js';

import type { IngestClient } from '../backfill.js';

const CLIENT: IngestClient = { baseUrl: 'http://purchases.test', apiKey: 'pops_sa_test.secret' };
const PAGE_SIZE = 500;
const URI = 'pops://purchases/receipt/sha256-1';

let urls: string[];

/** A pillar answering each `GET /purchases` with the next page in turn. */
function stubPages(pages: readonly { id: string; sourceOrderId: string | null }[][]): void {
  urls = [];
  let page = 0;
  vi.stubGlobal('fetch', (url: string) => {
    urls.push(url);
    const items = pages[page] ?? [];
    page += 1;
    return Promise.resolve(
      new Response(JSON.stringify({ items }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
  });
}

function fullPage(prefix: string) {
  return Array.from({ length: PAGE_SIZE }, (_, index) => ({
    id: `${prefix}-id-${String(index)}`,
    sourceOrderId: `${prefix}-order-${String(index)}`,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('walks past a full page and merges what the next one holds', async () => {
  stubPages([fullPage('a'), [{ id: 'late-id', sourceOrderId: 'late-order' }]]);

  const ids = await fetchPurchaseIdsBySourceOrderId(CLIENT, 'amazon');

  expect(ids.size).toBe(PAGE_SIZE + 1);
  expect(ids.get('late-order')).toBe('late-id');
  expect(urls).toHaveLength(2);
  expect(urls[1]).toContain(`offset=${String(PAGE_SIZE)}`);
});

it('stops at a short page rather than asking for one more', async () => {
  stubPages([[{ id: 'only-id', sourceOrderId: 'only-order' }]]);

  await fetchPurchaseIdsBySourceOrderId(CLIENT, 'amazon');

  expect(urls).toHaveLength(1);
});

it('leaves out an order the merchant never named', async () => {
  stubPages([
    [
      { id: 'named', sourceOrderId: 'order-1' },
      { id: 'photographed', sourceOrderId: null },
    ],
  ]);

  const ids = await fetchPurchaseIdsBySourceOrderId(CLIENT, 'amazon');

  expect([...ids]).toEqual([['order-1', 'named']]);
});

it('refuses to walk forever when the index answers the same full page again', async () => {
  // A server or proxy that ignores `offset` answers page one forever. The
  // walk only ends on a short page, so without this it never ends at all.
  const repeated = fullPage('a');
  stubPages([repeated, repeated, repeated]);

  await expect(fetchPurchaseIdsBySourceOrderId(CLIENT, 'amazon')).rejects.toThrow(/offset/u);
  expect(urls).toHaveLength(2);
});

it('refuses to return a partial map when a page cannot be read', async () => {
  // A partial map is indistinguishable from a bundle naming orders that are
  // not in the database, and the run would report the evidence as
  // unattachable rather than as unread.
  vi.stubGlobal('fetch', () => Promise.resolve(new Response('nope', { status: 500 })));

  await expect(fetchPurchaseIdsBySourceOrderId(CLIENT, 'amazon')).rejects.toThrow(/500/u);
});

/** A pillar answering each attach with the next status in turn. */
function stubAttaches(statuses: readonly number[]): void {
  urls = [];
  let call = 0;
  vi.stubGlobal('fetch', (url: string) => {
    urls.push(url);
    const status = statuses[call] ?? 201;
    call += 1;
    return Promise.resolve(new Response('{}', { status }));
  });
}

function attachment(purchaseId: string) {
  return { purchaseId, document: { documentUri: URI, kind: 'tax_invoice' as const } };
}

it('counts a repeat apart from a fresh attach and reports both bytes as referenced', async () => {
  const referenced: string[] = [];
  stubAttaches([201, 409]);

  const outcome = await attachDocuments(CLIENT, [attachment('a'), attachment('b')], {
    onReferenced: (uri) => referenced.push(uri),
  });

  expect(outcome).toMatchObject({ attached: 1, alreadyAttached: 1, failures: [] });
  expect(referenced).toEqual([URI, URI]);
});

it('does not report the bytes as referenced when the attach was refused', async () => {
  const referenced: string[] = [];
  stubAttaches([422]);

  const outcome = await attachDocuments(CLIENT, [attachment('a')], {
    onReferenced: (uri) => referenced.push(uri),
  });

  expect(referenced).toEqual([]);
  expect(outcome.failures).toHaveLength(1);
});

it('stops on a 403 instead of repeating it for every remaining document', async () => {
  stubAttaches([403, 201, 201]);

  const outcome = await attachDocuments(CLIENT, [
    attachment('a'),
    attachment('b'),
    attachment('c'),
  ]);

  expect(urls).toHaveLength(1);
  expect(outcome.failures.join('\n')).toContain('purchases.purchase');
});
