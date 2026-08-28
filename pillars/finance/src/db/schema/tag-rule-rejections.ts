import { sql } from 'drizzle-orm';
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const tagRuleRejections = sqliteTable(
  'tag_rule_rejections',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /**
     * The rejected rule's shape, denormalized out of the ChangeSet's `add`
     * op so a later proposer can look up "was this pattern turned down?"
     * without parsing every stored ChangeSet. Null when the rejected
     * ChangeSet carried no `add` op (an edit/disable/remove rejection) —
     * `change_set` is then the only record of what was refused.
     */
    descriptionPattern: text('description_pattern'),
    matchType: text('match_type', { enum: ['exact', 'contains', 'regex'] }),
    entityId: text('entity_id'),
    tags: text('tags').notNull().default('[]'),
    feedback: text('feedback').notNull(),
    /** The full rejected ChangeSet, verbatim, as JSON. */
    changeSet: text('change_set').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('idx_tag_rule_rejections_pattern').on(table.descriptionPattern),
    index('idx_tag_rule_rejections_created_at').on(table.createdAt),
  ]
);
