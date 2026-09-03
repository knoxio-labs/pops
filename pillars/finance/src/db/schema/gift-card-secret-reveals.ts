import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { accounts } from './accounts.js';

/**
 * Audit trail of one-shot plaintext reveals of a gift card's number/PIN
 * (POPS-2772). No generic audit-log table exists anywhere in this repo
 * (checked across `pillars/`) — this is a dedicated table scoped to gift-card
 * reveals only, not shared infrastructure. Worth revisiting as a generic
 * audit facility if a second pillar needs the same shape; not invented here.
 *
 * This pillar's REST handlers have no access to "who" made a request: the
 * inbound service-account gate (`src/api/middleware/service-account-scope.ts`)
 * resolves a presented `X-API-Key` to a principal only to decide whether to
 * let the request through, and does not attach that principal to `req` for a
 * handler to read; browser traffic carries no key at all. So a row records
 * only which account's secret was revealed and when, not who revealed it.
 */
export const giftCardSecretReveals = sqliteTable('gift_card_secret_reveals', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  revealedAt: text('revealed_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});
