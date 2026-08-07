/** Everyday Rewards export adapter. See the README beside this file. */
import { WoolworthsExportSchema } from './blocks.js';
import { mapReceipt, WOOLWORTHS_SOURCE_ID, type WoolworthsAnomaly } from './receipt.js';

import type { CreatePurchaseInput } from '../../db/services/purchase-input.js';

export { WOOLWORTHS_SOURCE_ID } from './receipt.js';
export type { WoolworthsAnomaly } from './receipt.js';

/** The file did not come from the extension, or came from a newer one. */
export class WoolworthsExportShapeError extends Error {}

export interface WoolworthsParseResult {
  readonly capturedAt: string;
  readonly purchases: readonly CreatePurchaseInput[];
  readonly anomalies: readonly WoolworthsAnomaly[];
}

/**
 * Parse an export file into purchases.
 *
 * A receipt this adapter cannot map is reported and skipped rather than
 * aborting the file: one unreadable receipt out of a year's shopping is not
 * a reason to ingest none of it. What is never allowed is a *silent* skip,
 * which is why every refusal produces an anomaly naming the receipt.
 */
export function parseWoolworthsExport(raw: unknown): WoolworthsParseResult {
  const parsed = WoolworthsExportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new WoolworthsExportShapeError(
      `not a ${WOOLWORTHS_SOURCE_ID} export file: ${parsed.error.issues[0]?.message ?? 'unknown shape'}`
    );
  }

  const purchases: CreatePurchaseInput[] = [];
  const anomalies: WoolworthsAnomaly[] = [];
  const seen = new Set<string>();

  for (const entry of parsed.data.receipts) {
    const mapped = mapReceipt(entry.activityDetailsId, entry.receipt);
    if (mapped === null) {
      anomalies.push({
        kind: 'dropped-receipt',
        activityDetailsId: entry.activityDetailsId,
        detail: 'no readable transaction line, total or item block',
      });
      continue;
    }

    const key = mapped.purchase.sourceOrderId ?? entry.activityDetailsId;
    if (seen.has(key)) {
      // Two API ids for one till transaction. Ingesting both would double
      // the day's spend, and the `(source, sourceOrderId)` unique index
      // would reject the second anyway — loudly, mid-import.
      anomalies.push({
        kind: 'dropped-receipt',
        activityDetailsId: entry.activityDetailsId,
        detail: `duplicate of an earlier receipt with the same till transaction ${key}`,
      });
      continue;
    }
    seen.add(key);

    purchases.push(mapped.purchase);
    anomalies.push(...mapped.anomalies);
  }

  return { capturedAt: parsed.data.capturedAt, purchases, anomalies };
}
