-- POPS-2607: `venue:bar` and `venue:pub` become one value.
--
-- The nine two-venue rows POPS-2606 left for this ticket to clean included two
-- carrying `venue:bar` + `venue:pub`, and resolving those two by hand would have
-- left the thing that produced the ambiguity in place. The distinction is what
-- is wrong, not those rows.
--
-- The ledger says the two do not behave differently: alcohol on 63% vs 67% of
-- rows, food on 50% vs 33%, average ticket $28.64 vs $24.40. Nor does any
-- question this taxonomy exists to answer separate them — "how much at bars and
-- pubs versus restaurants" groups them by construction, and the substitution
-- question rides on `contains:alcohol`, which sits on 51 rows independently of
-- venue including all ten bottle-shop rows that carry no venue at all. So the
-- analytical facts are already on the rows and bar-vs-pub is a judgement call
-- with no consumer, which is the sprawl POPS-2606 and POPS-2602 exist to stop.
--
-- `venue:pub` is the survivor rather than `venue:bar` because an Australian
-- licensed venue named "Hotel" is a pub, and those are the rows that forced the
-- question (`ABERCROMBIE HOTEL`, `HIGHLANDS HOTEL`). Both disputed rows are
-- pubs on that reading; merging makes the reading unnecessary.
--
-- Idempotent: the rewrite is a set operation keyed on the value, so a second run
-- finds no `venue:bar` to map and the deduplication has nothing left to collapse.
-- REQUIRED before running against a real database: take a snapshot first
-- (finance-audit remediation policy). Rollback = restore the snapshot.

-- 1. Transactions. `json_group_array` over a DISTINCT projection both maps the
-- value and collapses the two rows that carried it alongside `venue:pub` — a row
-- ending up with `venue:pub` twice would be a new cardinality violation created
-- while fixing one.
UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(mapped) FROM (
		SELECT DISTINCT CASE je.value WHEN 'venue:bar' THEN 'venue:pub' ELSE je.value END AS mapped
		  FROM json_each(`transactions`.`tags`) je
	)
)
WHERE EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'venue:bar');
--> statement-breakpoint
-- 2. Tag rules, on the same reasoning: a rule left naming `venue:bar` would
-- write the retired value back onto a transaction at the next re-evaluation.
UPDATE `transaction_tag_rules`
SET `tags` = (
	SELECT json_group_array(mapped) FROM (
		SELECT DISTINCT CASE je.value WHEN 'venue:bar' THEN 'venue:pub' ELSE je.value END AS mapped
		  FROM json_each(`transaction_tag_rules`.`tags`) je
	)
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'venue:bar'
);
--> statement-breakpoint
-- 3. Correction rules carry a tag set of their own.
UPDATE `transaction_corrections`
SET `tags` = (
	SELECT json_group_array(mapped) FROM (
		SELECT DISTINCT CASE je.value WHEN 'venue:bar' THEN 'venue:pub' ELSE je.value END AS mapped
		  FROM json_each(`transaction_corrections`.`tags`) je
	)
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'venue:bar'
);
--> statement-breakpoint
-- 4. Carry the usage across before retiring the row, so the vocabulary ranking
-- reflects the merged value rather than restarting `venue:pub` at its own count.
UPDATE `tag_vocabulary`
SET `usage_count` = `usage_count` + (
	SELECT COALESCE(SUM(`usage_count`), 0) FROM `tag_vocabulary` WHERE `tag` = 'venue:bar' AND `is_active` = 1
)
WHERE `tag` = 'venue:pub';
--> statement-breakpoint
-- 5. Retire the merged-away value, keeping its provenance. Deactivating rather
-- than deleting is how this table models retirement, and it is what makes the
-- commit-time closed-facet gate refuse the value from here on.
UPDATE `tag_vocabulary` SET `is_active` = 0, `usage_count` = 0 WHERE `tag` = 'venue:bar';
