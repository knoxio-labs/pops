-- POPS-3689: a gym has a venue value of its own.
--
-- venue: had no value for a gym, so gym visits landed on the nearest neighbour:
-- the Plus Fitness rows carried venue:club on two and venue:sauna on one, which
-- put gym spend in the nightclub bucket that "how much going out" groups by. A
-- definition cannot fix a missing bucket (0111 already says club and sauna are
-- not a gym); this adds the bucket and moves the rows that were in the wrong one.
--
-- Keyed on the entity, not the descriptor. The merchant arrives under two
-- descriptors ("PlusFitness DHS", "Plus Fitness DARLINGHU"), so a LIKE on either
-- would move some rows and silently leave the rest.
--
-- Only the venue value changes. A row's other tags stay exactly as a person left
-- them, and a Plus Fitness row carrying no venue at all is not given one: the
-- newest was left without a venue deliberately, and this migration does not
-- overrule that.
--
-- REQUIRED before running against a real database: take a snapshot first
-- (finance-audit remediation policy). Rollback = restore the snapshot.
--
-- Idempotent: every statement is keyed on the wrong value still being present,
-- so a second run matches nothing.

-- 1. The value.
INSERT OR IGNORE INTO `tag_vocabulary` (`tag`, `facet`, `kind`, `source`, `is_active`, `usage_count`, `description`)
VALUES ('venue:gym', 'venue', 'closed', 'seed', 1, 0, 'A gym or fitness centre, paid for membership or entry. Not a nightclub, and not a sauna or bathhouse.');
--> statement-breakpoint

-- 2. Move the usage counts before the rows move, while they still say what they count.
UPDATE `tag_vocabulary`
SET `usage_count` = `usage_count` + (
	SELECT COUNT(*) FROM `transactions` t
	 WHERE t.`entity_id` = '2d8c0f12-758d-4b21-941c-9da76877bfae'
	   AND EXISTS (SELECT 1 FROM json_each(t.`tags`) je WHERE je.value IN ('venue:club', 'venue:sauna'))
	   AND NOT EXISTS (SELECT 1 FROM json_each(t.`tags`) je WHERE je.value = 'venue:gym')
)
WHERE `tag` = 'venue:gym';
--> statement-breakpoint
UPDATE `tag_vocabulary`
SET `usage_count` = max(0, `usage_count` - (
	SELECT COUNT(*) FROM `transactions` t
	 WHERE t.`entity_id` = '2d8c0f12-758d-4b21-941c-9da76877bfae'
	   AND EXISTS (SELECT 1 FROM json_each(t.`tags`) je WHERE je.value = `tag_vocabulary`.`tag`)
))
WHERE `tag` IN ('venue:club', 'venue:sauna');
--> statement-breakpoint

-- 3. The rows: add venue:gym where a wrong venue is present, then remove the wrong venue.
UPDATE `transactions`
SET `tags` = json_insert(`tags`, '$[#]', 'venue:gym')
WHERE `entity_id` = '2d8c0f12-758d-4b21-941c-9da76877bfae'
  AND EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value IN ('venue:club', 'venue:sauna'))
  AND NOT EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'venue:gym');
--> statement-breakpoint
UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
	 WHERE je.value NOT IN ('venue:club', 'venue:sauna')
)
WHERE `entity_id` = '2d8c0f12-758d-4b21-941c-9da76877bfae'
  AND EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value IN ('venue:club', 'venue:sauna'));
--> statement-breakpoint

-- 4. The rules, so the next import does not put the wrong venue straight back.
UPDATE `transaction_tag_rules`
SET `tags` = json_insert(`tags`, '$[#]', 'venue:gym')
WHERE `entity_id` = '2d8c0f12-758d-4b21-941c-9da76877bfae'
  AND EXISTS (SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value IN ('venue:club', 'venue:sauna'))
  AND NOT EXISTS (SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'venue:gym');
--> statement-breakpoint
UPDATE `transaction_tag_rules`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_tag_rules`.`tags`) je
	 WHERE je.value NOT IN ('venue:club', 'venue:sauna')
)
WHERE `entity_id` = '2d8c0f12-758d-4b21-941c-9da76877bfae'
  AND EXISTS (SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value IN ('venue:club', 'venue:sauna'));
--> statement-breakpoint
UPDATE `transaction_corrections`
SET `tags` = json_insert(`tags`, '$[#]', 'venue:gym')
WHERE `entity_id` = '2d8c0f12-758d-4b21-941c-9da76877bfae'
  AND EXISTS (SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value IN ('venue:club', 'venue:sauna'))
  AND NOT EXISTS (SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'venue:gym');
--> statement-breakpoint
UPDATE `transaction_corrections`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_corrections`.`tags`) je
	 WHERE je.value NOT IN ('venue:club', 'venue:sauna')
)
WHERE `entity_id` = '2d8c0f12-758d-4b21-941c-9da76877bfae'
  AND EXISTS (SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value IN ('venue:club', 'venue:sauna'));
