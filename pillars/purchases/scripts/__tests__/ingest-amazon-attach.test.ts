/**
 * `--attach-existing`: the pass that puts the bundle's invoices on orders the
 * run did not create.
 *
 * This is the case the backfill has against the live database — every order is
 * already there, so `POST /purchases` answers 409 for all of them and the
 * create pass attaches nothing. The flag is the only path by which the
 * evidence reaches those orders, and running it a second time has to change
 * nothing.
 *
 * The stub answers the routes by shape rather than replaying a script, so a
 * regression that posts to the wrong path shows up as a request that was never
 * made rather than as an off-by-one in a queue of canned responses.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { INGEST_API_KEY_ENV } from '../backfill.js';
import {
  bundleWith,
  invoiceFor,
  KNOWN_ORDER,
  orderNamed,
  storedFiles,
  temporaryDirectory,
  UNKNOWN_ORDER,
  warnings,
} from './amazon-bundle.js';

vi.mock('../../src/ingest/amazon/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/ingest/amazon/index.js')>()),
  parseAmazonOrderHistory: vi.fn(() => ({ orders: [], anomalies: [] })),
}));

const { parseAmazonOrderHistory } = await import('../../src/ingest/amazon/index.js');
const { main } = await import('../ingest-amazon.js');

const parseMock = vi.mocked(parseAmazonOrderHistory);

const PURCHASE_ID = 'a9c4d0ce-4f8f-4b5d-9d3a-0b1f2e3d4c5b';

interface Recorded {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

let requests: Recorded[];
let receipts: string;

/**
 * A pillar that already holds `indexed` and answers each attach with the next
 * status in `attachStatuses`, repeating the last one once they run out.
 */
function stubPillar(
  indexed: readonly { id: string; sourceOrderId: string | null }[],
  attachStatuses: readonly number[] = [201],
  createStatus = 409
): void {
  requests = [];
  let attach = 0;

  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    const method = init.method ?? 'GET';
    requests.push({ url, method, body: init.body });

    if (url.includes('/documents')) {
      const status = attachStatuses[Math.min(attach, attachStatuses.length - 1)] ?? 201;
      attach += 1;
      return Promise.resolve(new Response('{}', { status }));
    }
    if (method === 'GET' && url.includes('/purchases?')) {
      return Promise.resolve(
        new Response(JSON.stringify({ items: indexed }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    }
    if (url.endsWith('/purchases')) {
      return Promise.resolve(new Response('{}', { status: createStatus }));
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
}

/** The order row `GET /purchases` would return for a known order. */
function indexedOrder(sourceOrderId = KNOWN_ORDER, id = PURCHASE_ID) {
  return { id, sourceOrderId };
}

function attachRequests(): Recorded[] {
  return requests.filter(({ url }) => url.includes('/documents'));
}

beforeEach(() => {
  vi.unstubAllEnvs();
  receipts = temporaryDirectory('amazon-receipts-');
  vi.stubEnv('PURCHASES_RECEIPT_DIR', receipts);
  vi.stubEnv(INGEST_API_KEY_ENV, 'pops_sa_test.secret');
  parseMock.mockReset();
  parseMock.mockReturnValue({ orders: [orderNamed(KNOWN_ORDER)], anomalies: [] });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function run(flags: readonly string[]): Promise<void> {
  return main([bundleWith({ '1.pdf': invoiceFor(KNOWN_ORDER) }), ...flags]);
}

it('attaches the invoice to an order that was already in the database', async () => {
  stubPillar([indexedOrder()]);

  await run(['--attach-existing']);

  const [attached] = attachRequests();
  expect(attached?.url).toBe(`http://localhost:3013/purchases/${PURCHASE_ID}/documents`);
  expect(attached?.method).toBe('POST');
  expect(JSON.parse(String(attached?.body))).toMatchObject({
    documentUri: expect.stringMatching(/^pops:\/\/purchases\/receipt\/[0-9a-f]{64}$/u),
    kind: 'tax_invoice',
  });
});

it('leaves the bytes on the volume once a row references them', async () => {
  stubPillar([indexedOrder()]);

  await run(['--attach-existing']);

  const sha256 =
    /pops:\/\/purchases\/receipt\/([0-9a-f]{64})/u.exec(String(attachRequests()[0]?.body))?.[1] ??
    '';
  expect(sha256).not.toBe('');
  expect(storedFiles(receipts)).toEqual([[sha256.slice(0, 2), `${sha256}.pdf`].join('/')]);
});

it('reports a second run as already attached and writes nothing new', async () => {
  stubPillar([indexedOrder()], [409]);

  await run(['--attach-existing']);

  expect(attachRequests()).toHaveLength(1);
  expect(warnings()).toContain('0 invoice(s) attached to 1 order(s)');
  expect(warnings()).toContain('1 already carried theirs');
  // A 409 means a row is pointing at those bytes already; taking them off the
  // volume would break the reference this run just confirmed.
  expect(storedFiles(receipts)).toHaveLength(1);
  expect(process.exitCode).toBeUndefined();
});

it('does nothing at all without the flag', async () => {
  stubPillar([indexedOrder()]);

  await run([]);

  expect(attachRequests()).toEqual([]);
  expect(storedFiles(receipts)).toEqual([]);
  expect(warnings()).toContain('Re-run with --attach-existing');
});

it('names an order whose invoice matched but which is in neither the run nor the database', async () => {
  stubPillar([indexedOrder(UNKNOWN_ORDER, 'other-order')]);

  await run(['--attach-existing']);

  expect(attachRequests()).toEqual([]);
  expect(warnings()).toContain(KNOWN_ORDER);
  expect(warnings()).toContain('in neither this run nor the database');
  // Their bytes come back off the volume, so the run dropped evidence and
  // an unattended one must not read as a success.
  expect(process.exitCode).toBe(1);
});

it('names every dropped order, not the first ten, and fails the run', async () => {
  // The operator's next move is a ticket per order, so a list truncated at
  // ten is a list they cannot act on. The live bundle names 250 orders.
  const dropped = Array.from(
    { length: 12 },
    (_, index) => `503-1631401-27894${String(index).padStart(2, '0')}`
  );
  parseMock.mockReturnValue({ orders: dropped.map(orderNamed), anomalies: [] });
  stubPillar([]);

  await main([
    bundleWith(
      Object.fromEntries(dropped.map((order, index) => [`${String(index)}.pdf`, invoiceFor(order)]))
    ),
    '--attach-existing',
  ]);

  const printed = warnings();
  for (const order of dropped) expect(printed).toContain(order);
  expect(process.exitCode).toBe(1);
});

it('fails the run when an attach is refused', async () => {
  stubPillar([indexedOrder()], [422]);

  await run(['--attach-existing']);

  expect(process.exitCode).toBe(1);
});

it('stops after the first 403 rather than repeating it for every invoice', async () => {
  parseMock.mockReturnValue({
    orders: [orderNamed(KNOWN_ORDER), orderNamed(UNKNOWN_ORDER)],
    anomalies: [],
  });
  stubPillar([indexedOrder(), indexedOrder(UNKNOWN_ORDER, 'second-order')], [403]);

  await main([
    bundleWith({ '1.pdf': invoiceFor(KNOWN_ORDER), '2.pdf': invoiceFor(UNKNOWN_ORDER) }),
    '--attach-existing',
  ]);

  expect(attachRequests()).toHaveLength(1);
  expect(process.exitCode).toBe(1);
});

it('does not re-post an invoice that rode in on the order this run created', async () => {
  // The create pass already put it there, so the index now holds an order
  // whose invoice is attached. Posting it again would be a 409 counted as a
  // repeat, and would read as if the bundle had been attached twice.
  stubPillar([indexedOrder()], [201], 201);

  await run(['--attach-existing']);

  expect(attachRequests()).toEqual([]);
  expect(warnings()).toContain('attached 1 invoice(s) to the order(s) this run created');
  expect(storedFiles(receipts)).toHaveLength(1);
});

it('reads the order index scoped to amazon, not the whole database', async () => {
  stubPillar([indexedOrder()]);

  await run(['--attach-existing']);

  const index = requests.find(({ method, url }) => method === 'GET' && url.includes('/purchases?'));
  expect(index?.url).toContain('sources=amazon');
});
