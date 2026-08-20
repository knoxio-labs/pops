/**
 * Real DSAR bundles on a real filesystem, for the Amazon CLI suites.
 *
 * Nothing here mocks `node:fs`. The bundles are directories in a temp dir, so
 * the invoice walk, the content-addressed store and the ordering guarantee are
 * exercised against the filesystem rather than against a stub of it.
 */
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { vi } from 'vitest';

import {
  legacyInvoice,
  pdfWithRuns,
} from '../../src/ingest/amazon/__tests__/__fixtures__/invoice-pdf.js';

import type { CreatePurchaseInput } from '../../src/db/services/purchase-input.js';

export const KNOWN_ORDER = '503-1631401-2789435';
export const UNKNOWN_ORDER = '249-4494679-2017412';
export const DOCUMENT = '12484342-INV-AU-2021-26473870';

export function temporaryDirectory(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** A bundle root holding an `Order History.csv` and the given invoices. */
export function bundleWith(invoices: Readonly<Record<string, Buffer>> = {}): string {
  const root = temporaryDirectory('amazon-cli-');
  mkdirSync(join(root, 'Your Amazon Orders'), { recursive: true });
  writeFileSync(join(root, 'Your Amazon Orders', 'Order History.csv'), 'order id,order date\n');

  for (const [relative, bytes] of Object.entries(invoices)) {
    const path = join(root, 'Additional Data', 'Retail.TransactionalInvoicing.3.1', relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, bytes);
  }
  return root;
}

export function invoiceFor(sourceOrderId: string, documentNumber = DOCUMENT): Buffer {
  return pdfWithRuns(legacyInvoice(sourceOrderId, documentNumber));
}

export function orderNamed(sourceOrderId: string): CreatePurchaseInput {
  return {
    source: 'amazon',
    sourceOrderId,
    ingestMethod: 'export',
    orderedAt: '2021-07-23T00:00:00.000Z',
    currency: 'AUD',
    totalCents: 7575,
    checksum: 'checksum',
  };
}

/** Everything the CLI printed, as one string. */
export function warnings(): string {
  return vi.mocked(console.warn).mock.calls.flat().join('\n');
}

/** Every stored file under a store root, whichever shard it landed in. */
export function storedFiles(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((entry) => entry.endsWith('.pdf'));
}
