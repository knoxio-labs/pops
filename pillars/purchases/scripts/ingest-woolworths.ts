/**
 * Backfill an Everyday Rewards export through `POST /purchases`.
 *
 *   POPS_INTERNAL_API_KEY=<key> pnpm ingest:woolworths -- \
 *     ~/Downloads/everyday-receipts-2026-08-07.json [--dry-run]
 *
 * The key is required for a real run and unused by `--dry-run`, which parses
 * and prints without making a request.
 *
 * The file comes from the Chrome extension in `extension/`; Woolworths
 * offers no export of its own. It contains the EFTPOS terminal block
 * verbatim, so delete it once this has run — the mapping keeps only the
 * card scheme and last four (`src/ingest/woolworths/payment.ts`).
 */
import { readFileSync } from 'node:fs';

import { parseWoolworthsExport, WOOLWORTHS_SOURCE_ID } from '../src/ingest/woolworths/index.js';
import {
  createIngestClient,
  postPurchases,
  reportOutcome,
  summariseAnomalies,
  upsertSource,
} from './backfill.js';

function readExportPath(argv: readonly string[]): string {
  const path = argv.find((arg) => !arg.startsWith('--'));
  if (path === undefined) {
    throw new Error('usage: pnpm ingest:woolworths -- "<export.json>" [--dry-run]');
  }
  return path;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const exportPath = readExportPath(argv);

  const { capturedAt, purchases, anomalies } = parseWoolworthsExport(
    JSON.parse(readFileSync(exportPath, 'utf8'))
  );

  const lines = purchases.reduce((count, purchase) => count + (purchase.items?.length ?? 0), 0);
  const spendCents = purchases.reduce((total, purchase) => total + purchase.totalCents, 0);
  console.warn(
    `captured ${capturedAt}: ${String(purchases.length)} receipts, ${String(lines)} lines, ` +
      `$${(spendCents / 100).toFixed(2)}`
  );
  if (anomalies.length > 0) console.warn(`anomalies: ${summariseAnomalies(anomalies)}`);

  if (argv.includes('--dry-run')) {
    console.warn('--dry-run: nothing was written');
    return;
  }

  const client = createIngestClient();
  await upsertSource(client, {
    id: WOOLWORTHS_SOURCE_ID,
    label: 'Woolworths',
    // `WOOLWORTHS 1034 CANTERBURY`, `WOOLWORTHS ONLINE`, `WW METRO ...` all
    // start the same way; the trailing `%` is what makes this match any of
    // them.
    descriptorPattern: 'WOOLWORTHS%',
    // A till receipt settles as exactly one card charge for exactly the
    // stated total, on the day it happened. There is nothing for a human to
    // decide, and grocery is thousands of lines a year — a queue that asks
    // about every shop gets abandoned along with the orders that do need a
    // decision (ADR-042).
    autoLinkPolicy: 'auto',
    ingestAdapter: 'everyday-rewards-export',
  });

  reportOutcome(await postPurchases(client, purchases));
}

await main();
