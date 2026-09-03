import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { CURRENCY_KINDS } from '../../contract/currency-kind.js';

export const currencies = sqliteTable(
  'currencies',
  {
    code: text('code').primaryKey(),
    name: text('name').notNull(),
    /** Nullable — a points currency has none. */
    symbol: text('symbol'),
    /** Minor-unit count for a fiat currency; always 0 for points. */
    decimals: integer('decimals').notNull(),
    kind: text('kind', { enum: CURRENCY_KINDS }).notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index('idx_currencies_kind').on(table.kind)]
);
