/**
 * `purchase_sources` — the merchants and feeds this pillar ingests from.
 *
 * A table rather than a compiled enum on purpose: adding Bunnings is an
 * INSERT, not a deploy. The pillar registry taught this lesson (ADR-035)
 * and the same reasoning applies to anything whose membership changes on
 * a human timescale.
 */
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { AUTO_LINK_POLICIES, DEFAULT_SETTLEMENT_WINDOW_DAYS } from '../../contract/constants.js';

export const purchaseSources = sqliteTable('purchase_sources', {
  /** Stable slug — `amazon`, `paypal`, `woolworths`. Referenced by `purchases.source`. */
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  /**
   * Bank-descriptor pattern used by stage 0 of the reconciliation ladder to
   * block candidate transactions before any arithmetic runs. Null means the
   * source contributes no descriptor blocking and must match on amount and
   * date alone — correct for cash-only sources.
   */
  descriptorPattern: text('descriptor_pattern'),
  /** Per-source override of {@link DEFAULT_SETTLEMENT_WINDOW_DAYS}. */
  settlementWindowDays: integer('settlement_window_days')
    .notNull()
    .default(DEFAULT_SETTLEMENT_WINDOW_DAYS),
  autoLinkPolicy: text('auto_link_policy', { enum: AUTO_LINK_POLICIES })
    .notNull()
    .default('review'),
  /**
   * Identifier of the ingest adapter that produces purchases for this
   * source, e.g. `amazon-export`. Null while a source exists only to carry
   * matching configuration for manually-entered purchases.
   */
  ingestAdapter: text('ingest_adapter'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});
