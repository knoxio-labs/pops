-- POPS-2607: `occasion:admin` is retired — `type` already says it.
--
-- The 2026-08-28 namespace migration mapped the flat `Transfer`, `Bank` and
-- `Credit Card` tags onto `occasion:admin`, giving the closed `occasion:` axis a
-- value whose whole job was "this is not spend". POPS-2610 then made `type`
-- answer that question deterministically, in the importer, from the descriptor,
-- on every future import with nobody in the loop.
--
-- Keeping both is the redundancy this codebase has deleted twice already (a
-- merchant name beside `entity_id`, `Bank`/`Credit Card` beside `account`), and
-- it was already failing: of the 38 non-spend rows `occasion:admin` was supposed
-- to cover, 21 did not carry it, after a curated pass. A tag needs a human to
-- remember forever; a column does not.
--
-- So `occasion:` becomes total over spend and silent everywhere else: on a spend
-- row a missing occasion means "not yet decided", and on a non-spend row the
-- axis does not apply. `src/db/services/tag-coverage.ts` measures exactly that.
--
-- The one row where the two disagreed is the point of the change rather than
-- collateral of it. `PAYMENT THANKYOU 754244` is `type = 'purchase'` carrying
-- `occasion:admin` — a card payment mis-typed as a purchase. Stripping the tag
-- silently would hide it, so a spend row carrying the retired value is flagged
-- for review instead of just cleaned.
--
-- Rules keep the same treatment. Four `PayID` tag rules assert `occasion:admin`
-- and nothing else, so stripping it leaves a rule that asserts nothing; those
-- are deactivated rather than left inert, since a rule with an empty tag set can
-- only waste a match. Rules that also assert something real (`contains:fee`)
-- keep working.
--
-- The vocabulary row is deactivated, not deleted: `usage_count` and the `seed`
-- provenance are the record of why the value existed, and `is_active = 0` is how
-- this table already models retirement.
--
-- Idempotent: every statement re-derives its result from the current tag set, so
-- a second run finds no `occasion:admin` to strip, appends no second flag, and
-- deactivates what is already deactivated. REQUIRED before running against a
-- real database: take a snapshot first (finance-audit remediation policy).
-- Rollback = restore the snapshot.

-- 1. Flag the spend rows that carry the retired value. Their `type` is wrong —
-- a purchase is not an administrative event — and that is a defect to look at,
-- not a tag to tidy away. Runs BEFORE the strip, while the evidence is still on
-- the row, and skips a row already flagged so a re-run adds nothing.
UPDATE `transactions`
SET `tags` = json_insert(`tags`, '$[#]', 'flag:needs-review')
WHERE `type` IN ('purchase', 'refund', 'reversal')
  AND EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'occasion:admin')
  AND NOT EXISTS (
    SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'flag:needs-review'
  );
--> statement-breakpoint
-- 2. Strip the value from every transaction.
UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
	 WHERE je.value <> 'occasion:admin'
)
WHERE EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'occasion:admin');
--> statement-breakpoint
-- 3. Strip it from the tag rules that assert it.
UPDATE `transaction_tag_rules`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_tag_rules`.`tags`) je
	 WHERE je.value <> 'occasion:admin'
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'occasion:admin'
);
--> statement-breakpoint
-- 4. …and from the correction rules, which carry a tag set of their own.
UPDATE `transaction_corrections`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_corrections`.`tags`) je
	 WHERE je.value <> 'occasion:admin'
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'occasion:admin'
);
--> statement-breakpoint
-- 5. A tag rule whose only assertion was `occasion:admin` now asserts nothing.
-- An empty rule cannot help and can still match, so retire it.
UPDATE `transaction_tag_rules`
SET `is_active` = 0
WHERE `is_active` = 1
  AND json_array_length(`tags`) = 0;
--> statement-breakpoint
-- 6. Retire the vocabulary row, keeping its provenance and usage count.
UPDATE `tag_vocabulary` SET `is_active` = 0 WHERE `tag` = 'occasion:admin';
