import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { INGEST_API_KEY_ENV } from '../backfill.js';
import {
  digitalBundleWith,
  digitalOrderNamed,
  invoiceFor,
  storedFiles,
  temporaryReceiptStore,
  warnings,
} from './amazon-bundle.js';

vi.mock('../../src/ingest/amazon-digital/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/ingest/amazon-digital/index.js')>()),
  parseAmazonDigitalOrders: vi.fn(() => ({ orders: [], anomalies: [] })),
}));

const { parseAmazonDigitalOrders } = await import('../../src/ingest/amazon-digital/index.js');
const { main } = await import('../ingest-amazon-digital.js');

const parseMock = vi.mocked(parseAmazonDigitalOrders);

const DIGITAL_ORDER = 'D01-9651602-7705054';
const UNKNOWN_DIGITAL_ORDER = 'D01-1111111-2222222';
const PURCHASE_ID = 'a9c4d0ce-4f8f-4b5d-9d3a-0b1f2e3d4c5b';

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly body?: string;
}

let requests: RecordedRequest[];
let receipts: string;

function indexedOrder(sourceOrderId = DIGITAL_ORDER, id = PURCHASE_ID) {
  return { id, sourceOrderId };
}

function stubPillar(
  indexed: readonly { id: string; sourceOrderId: string | null }[] = [],
  createStatus = 201,
  attachStatuses: readonly number[] = [201]
): void {
  requests = [];
  let attachIndex = 0;

  vi.stubGlobal('fetch', (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const request: RecordedRequest = {
      url,
      method,
      ...(typeof init?.body === 'string' ? { body: init.body } : {}),
    };
    requests.push(request);

    if (url.includes('/documents')) {
      const status = attachStatuses[Math.min(attachIndex, attachStatuses.length - 1)] ?? 201;
      attachIndex += 1;
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
    if (method === 'POST' && url.endsWith('/purchases')) {
      return Promise.resolve(new Response('{}', { status: createStatus }));
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
}

function purchaseRequests(): RecordedRequest[] {
  return requests.filter(({ method, url }) => method === 'POST' && url.endsWith('/purchases'));
}

function documentRequests(): RecordedRequest[] {
  return requests.filter(({ url }) => url.includes('/documents'));
}

beforeEach(() => {
  vi.unstubAllEnvs();
  receipts = temporaryReceiptStore('amazon-digital-receipts-');
  vi.stubEnv(INGEST_API_KEY_ENV, 'pops_sa_test.secret');
  parseMock.mockReset();
  parseMock.mockReturnValue({ orders: [digitalOrderNamed(DIGITAL_ORDER)], anomalies: [] });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

it('creates matched invoices and reports an unparsed digital id as unknown-order', async () => {
  stubPillar();

  await main([
    digitalBundleWith({
      '1.pdf': invoiceFor(DIGITAL_ORDER),
      '2.pdf': invoiceFor(UNKNOWN_DIGITAL_ORDER),
    }),
  ]);

  const [purchase] = purchaseRequests();
  expect(JSON.parse(String(purchase?.body))).toMatchObject({
    source: 'amazon-digital',
    sourceOrderId: DIGITAL_ORDER,
    documents: [
      {
        documentUri: expect.stringMatching(/^pops:\/\/purchases\/receipt\/[0-9a-f]{64}$/u),
        kind: 'tax_invoice',
      },
    ],
  });
  expect(documentRequests()).toEqual([]);
  expect(warnings()).toContain('invoices not attached: unknown-order=1');
  expect(warnings()).toContain(UNKNOWN_DIGITAL_ORDER);
  expect(warnings()).toContain('2.pdf');
  expect(storedFiles(receipts)).toHaveLength(1);
  expect(process.exitCode).toBeUndefined();
});

it('attaches to existing digital orders and treats a repeat as a no-op', async () => {
  stubPillar([indexedOrder()], 409, [201, 409]);
  const bundle = digitalBundleWith({ '1.pdf': invoiceFor(DIGITAL_ORDER) });

  await main([bundle]);
  await main([bundle]);

  const getOrders = requests.filter(
    ({ method, url }) => method === 'GET' && url.includes('/purchases?')
  );
  expect(getOrders).toHaveLength(2);
  expect(getOrders[0]?.url).toContain('sources=amazon-digital');
  expect(documentRequests().map(({ url, method }) => ({ url, method }))).toEqual([
    { url: `http://localhost:3013/purchases/${PURCHASE_ID}/documents`, method: 'POST' },
    { url: `http://localhost:3013/purchases/${PURCHASE_ID}/documents`, method: 'POST' },
  ]);
  expect(warnings()).toContain(
    'Amazon Digital existing-order pass: 0 invoice(s) attached to 1 order(s), 1 already carried theirs'
  );
  expect(storedFiles(receipts)).toHaveLength(1);
  expect(process.exitCode).toBeUndefined();
});

it('fails visibly and removes bytes when a matched digital order is absent from the database', async () => {
  stubPillar([], 409);

  await main([digitalBundleWith({ '1.pdf': invoiceFor(DIGITAL_ORDER) })]);

  expect(documentRequests()).toEqual([]);
  expect(warnings()).toContain(DIGITAL_ORDER);
  expect(warnings()).toContain('in neither this run nor the database');
  expect(warnings()).toContain('their invoices were dropped');
  expect(storedFiles(receipts)).toEqual([]);
  expect(process.exitCode).toBe(1);
});
