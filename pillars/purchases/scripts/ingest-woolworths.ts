/**
 * Backfill an Everyday Rewards export through `POST /purchases`.
 *
 *   POPS_INTERNAL_API_KEY=<key> pnpm ingest:woolworths -- \
 *     ~/Downloads/everyday-receipts-2026-08-07.json [--dry-run]
 *
 * The key is required for a real run and checked before the export is
 * parsed, so a missing one fails fast. `--dry-run` needs no key; it parses
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
  runCli,
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

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const exportPath = readExportPath(argv);
  const dryRun = argv.includes('--dry-run');

  // Resolved before the export is read, so a missing key fails immediately
  // rather than after the parse.
  const client = dryRun ? undefined : createIngestClient();

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

  if (client === undefined) {
    console.warn('--dry-run: nothing was written');
    return;
  }

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

// Guarded so importing `main` for tests does not also run the CLI.
if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli(main);
}
