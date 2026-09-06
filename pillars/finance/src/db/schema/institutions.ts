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
    /**
     * POPS-3062 scaffolding: the contacts `bank`-typed Entity this institution
     * was migrated to, once migrated. Temporary — dropped in POPS-3064 along
     * with the rest of this table.
     */
    migratedEntityId: text('migrated_entity_id'),
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
