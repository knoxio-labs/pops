-- POPS-3699: strip every `fee:` value from rows not typed `fee`.
--
-- Since POPS-2610 a `fee:` value names which fee a `type = 'fee'` row is, and
-- direct transaction writes now refuse one on any other type. 0116 only removed
-- `fee:membership`; a row left carrying another `fee:` value on a non-fee type
-- (a foreign ATM withdrawal typed `transfer` still tagged `fee:atm` and
-- `fee:conversion`) is, as 0102 puts it, a row two migrations disagree about,
-- and any later edit to its type or tags would be refused.
--
-- Rows: every tag whose trimmed, lower-cased value starts with `fee:` is
-- removed from every row whose type is not `fee` (a NULL type is not `fee`,
-- matching `feeTagsOnNonFeeType`); every other tag keeps its place. A `fee` row
-- is untouched. Tag rules are left alone: on prod they carry `fee:` values only
-- on fee descriptors, and 0116 already handled the `fee:membership` ones.
--
-- Vocabulary: `usage_count` of every `fee:` value is recounted from the rows
-- left, never adjusted by a delta.
--
-- Idempotent: the row update is gated on a `fee:` value still being present and
-- the count is recomputed outright, so a second run changes nothing.
-- REQUIRED before running against a real database: take a snapshot first
-- (finance-audit remediation policy). Rollback = restore the snapshot.

UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
	 WHERE lower(trim(je.value)) NOT LIKE 'fee:%'
)
WHERE (`type` IS NULL OR `type` != 'fee')
  AND EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE lower(trim(je.value)) LIKE 'fee:%'
  );
--> statement-breakpoint
UPDATE `tag_vocabulary`
SET `usage_count` = (
	SELECT COUNT(DISTINCT r.id) FROM `transactions` r, json_each(r.`tags`) je
	 WHERE je.value = `tag_vocabulary`.`tag`
)
WHERE `tag` LIKE 'fee:%';
