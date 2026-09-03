import { sql } from 'drizzle-orm';
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const institutions = sqliteTable(
  'institutions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    /** Hex colour (`#rrggbb`) used for the initials fallback when there is no logo. */
    colour: text('colour').notNull(),
    /** Nullable — the upload flow that populates this is POPS-2804, not yet built. */
    logoAssetId: text('logo_asset_id'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    // Case-insensitive uniqueness — migration hand-edited for `COLLATE NOCASE`,
    // same device contacts' `entities.name` index uses.
    index('idx_institutions_name_nocase').on(table.name),
  ]
);
