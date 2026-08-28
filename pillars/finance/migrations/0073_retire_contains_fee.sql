-- POPS-2632: `contains:fee` is retired — `type` and the `fee:` namespace say it.
--
-- Before POPS-2610 this tag was the only marker a row was a fee. That ticket
-- gave fees their own `type` and a closed `fee:` namespace naming which fee it
-- is, so a typed fee row now states the same fact three times. It is also the
-- wrong statement: `contains:` says what a purchase contained, and a fee is not
-- a purchase — POPS-2610 took fees out of spend entirely.
--
-- 0070 left the tag in place deliberately (it strips only stale `fee:` values),
-- so every historical fee row carries both. This removes the redundant half.
--
-- A row carrying `contains:fee` with no `fee:` value is NOT stripped. That row
-- is a descriptor `contract/transaction-classification.ts` does not recognise,
-- and its tag is the only surviving evidence of what it is; dropping it would
-- destroy the finding. It is flagged for review instead, the same treatment
-- 0071 gave the rows where a tag and a column disagreed. The fix for such a row
-- is a new classifier pattern, not a tag edit.
--
-- Rules are stripped unconditionally, transactions are not, and the asymmetry is
-- the point: a rule is forward-looking, so one that keeps asserting a retired
-- value would put it back on every future import, where a transaction is a
-- record of something that already happened.
--
-- The vocabulary row is deactivated, not deleted — `usage_count` and the `seed`
-- provenance are the record of why the value existed, and the categorizer takes
-- its vocabulary from the active set, so deactivating is what stops the model
-- being offered the value again.
--
-- Idempotent: every statement re-derives its result from the current tag set, so
-- a second run finds nothing left to strip, appends no second flag, and
-- deactivates what is already deactivated. REQUIRED before running against a
-- real database: take a snapshot first (finance-audit remediation policy).
-- Rollback = restore the snapshot.

-- 1. Flag the rows the classifier could not type. Runs BEFORE the strip so it
-- sees the same tag set the strip will change, and skips a row already flagged
-- so a re-run adds nothing.
UPDATE `transactions`
SET `tags` = json_insert(`tags`, '$[#]', 'flag:needs-review')
WHERE EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'contains:fee')
  AND NOT EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value LIKE 'fee:%'
  )
  AND NOT EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'flag:needs-review'
  );
--> statement-breakpoint
-- 2. Strip the redundant half from every row that carries a `fee:` value.
UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
	 WHERE je.value <> 'contains:fee'
)
WHERE EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'contains:fee')
  AND EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value LIKE 'fee:%');
--> statement-breakpoint
-- 3. Strip it from the tag rules that assert it.
UPDATE `transaction_tag_rules`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_tag_rules`.`tags`) je
	 WHERE je.value <> 'contains:fee'
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'contains:fee'
);
--> statement-breakpoint
-- 4. …and from the correction rules, which carry a tag set of their own.
UPDATE `transaction_corrections`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_corrections`.`tags`) je
	 WHERE je.value <> 'contains:fee'
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'contains:fee'
);
--> statement-breakpoint
-- 5. A tag rule whose only assertion was the retired value now asserts nothing.
-- An empty rule cannot help and can still match, so retire it.
UPDATE `transaction_tag_rules`
SET `is_active` = 0
WHERE `is_active` = 1
  AND json_array_length(`tags`) = 0;
--> statement-breakpoint
-- 6. Retire the vocabulary row, keeping its provenance and usage count.
UPDATE `tag_vocabulary` SET `is_active` = 0 WHERE `tag` = 'contains:fee';
--> statement-breakpoint
-- 7. Recompute what the retired value is still worn by, so the count describes
-- the rows this migration deliberately left carrying it rather than the ledger
-- as it stood before. Recomputed rather than decremented, so a re-run lands on
-- the same number.
UPDATE `tag_vocabulary`
SET `usage_count` = (
	SELECT COUNT(*) FROM `transactions` r, json_each(r.`tags`) je
	 WHERE je.value = `tag_vocabulary`.`tag`
)
WHERE `tag` = 'contains:fee';
