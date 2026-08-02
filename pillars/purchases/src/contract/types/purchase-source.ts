import type { AutoLinkPolicy } from '../constants.js';

/**
 * A merchant or feed this pillar ingests from.
 *
 * A row, not an enum member: registering Bunnings is an insert, not a
 * deploy (ADR-035).
 */
export interface PurchaseSource {
  /** Stable slug — `amazon`, `paypal`, `woolworths`. */
  id: string;
  label: string;
  /** Bank-descriptor pattern used to block candidate transactions. */
  descriptorPattern: string | null;
  /** How far apart `transaction.date` and `purchase.orderedAt` may be. */
  settlementWindowDays: number;
  /**
   * `auto` skips the review queue. Grocery must be `auto` — thousands of
   * line items a year cannot pass through a human (ADR-042).
   */
  autoLinkPolicy: AutoLinkPolicy;
  /** Identifier of the ingest adapter producing purchases for this source. */
  ingestAdapter: string | null;
  createdAt: string;
}
