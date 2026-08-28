-- POPS-2606 (parent POPS-2594): give `tag_vocabulary` the two columns that make
-- the namespace taxonomy queryable — `facet` (the prefix: `venue`, `occasion`,
-- …) and `kind` (`closed | open | marker`, who may mint a value on that axis) —
-- plus the `usage_count` the prompt and the tag pickers rank on.
--
-- The two columns are not the same kind of thing. `facet` IS derived: the
-- `facet:value` encoding introduced by 0067 makes the split unambiguous.
-- `kind` is not derivable from any tag string — nothing in
-- `trip:hunter-valley-2026` says whether `trip` is open or closed. It is policy,
-- written out here by facet name and mirrored in `src/db/tag-facets.ts`'s
-- `TAG_FACET_KINDS`. It is spelled out rather than taken from a
-- `SELECT DISTINCT` for the same reason: `project` is a real open facet with
-- zero values today, so no derivation from live data would ever mention it.
--
-- A tag with no prefix, or a prefix outside that map, is `open`, matching
-- `DEFAULT_TAG_FACET_KIND` — never `closed`, which would put an unvetted value
-- in front of the categorizer.
--
-- `usage_count` is backfilled once from `transactions.tags`. That is a
-- migration reading the transactions table, not the prompt path reading it: from
-- here the counter is maintained where tags are written, and the prompt reads
-- only this table. POPS-2616 ranks the tag pickers on the same column.
ALTER TABLE tag_vocabulary ADD COLUMN facet text;--> statement-breakpoint
ALTER TABLE tag_vocabulary ADD COLUMN kind text NOT NULL DEFAULT 'open';--> statement-breakpoint
ALTER TABLE tag_vocabulary ADD COLUMN usage_count integer NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE tag_vocabulary
   SET facet = CASE
         WHEN instr(tag, ':') > 1 AND length(tag) > instr(tag, ':')
           THEN substr(tag, 1, instr(tag, ':') - 1)
         ELSE NULL
       END;--> statement-breakpoint
UPDATE tag_vocabulary
   SET kind = CASE facet
         WHEN 'venue' THEN 'closed'
         WHEN 'occasion' THEN 'closed'
         WHEN 'contains' THEN 'closed'
         WHEN 'channel' THEN 'closed'
         WHEN 'fee' THEN 'closed'
         WHEN 'trip' THEN 'open'
         WHEN 'asset' THEN 'open'
         WHEN 'project' THEN 'open'
         WHEN 'hobby' THEN 'open'
         WHEN 'tax' THEN 'open'
         WHEN 'enrich' THEN 'marker'
         WHEN 'person' THEN 'marker'
         WHEN 'flag' THEN 'marker'
         ELSE 'open'
       END;--> statement-breakpoint
UPDATE tag_vocabulary
   SET usage_count = COALESCE(
       (SELECT COUNT(*)
          FROM transactions r, json_each(r.tags) je
         WHERE je.value = tag_vocabulary.tag),
       0);--> statement-breakpoint
CREATE INDEX idx_tag_vocabulary_kind ON tag_vocabulary (kind, usage_count);
