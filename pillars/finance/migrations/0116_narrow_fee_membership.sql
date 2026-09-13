-- POPS-3699: narrow `fee:membership` to a card or account membership fee.
--
-- `fee:membership` names a charge for holding the card or account itself — an
-- Amex `MEMBERSHIP FEE`, a card `ANNUAL FEE`. It never meant a chosen
-- subscription or a gym/club membership: those are purchases, described by
-- `contains:subscription` / `venue:gym`. Since POPS-2610 a `fee:` value names
-- which fee a `type = 'fee'` row is, so one on any other type is a
-- contradiction. The old description ("A recurring membership or
-- account-keeping fee.", 0104) invited exactly that reading, and a Prime
-- purchase was tagged `fee:membership` alongside `contains:subscription`.
--
-- Rows: the one value is removed from every row not typed `fee`; every other
-- tag keeps its place. A `fee` row is untouched — its `fee:membership` came
-- from the classifier's `FEE_PATTERNS` and is the meaning being kept.
--
-- Rules: the value is removed from every tag rule. No rule needs it — the
-- classifier derives `fee:membership` from the descriptor at import, and
-- `buildDerivedMatch` drops any rule-supplied `fee:` value on a derived fee
-- row anyway — so the rules that carry it are the gym/Prime rules that keyed
-- on it for lack of a better value (POPS-3679/3680). A rule left with no tags
-- is deactivated: the REST schemas refuse an empty `tags` on create and update
-- (`rest-tag-rules-schemas.ts`), so it is a state no write path can produce and
-- a rule that would apply nothing.
--
-- Idempotent: every statement is gated on the value still being present (or,
-- for the count and description, recomputed/assigned outright), so a second
-- run changes nothing.
-- REQUIRED before running against a real database: take a snapshot first
-- (finance-audit remediation policy). Rollback = restore the snapshot.

UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
	 WHERE je.value != 'fee:membership'
)
WHERE `type` != 'fee'
  AND EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'fee:membership'
  );
--> statement-breakpoint
UPDATE `transaction_tag_rules`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_tag_rules`.`tags`) je
	 WHERE je.value != 'fee:membership'
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'fee:membership'
);
--> statement-breakpoint
UPDATE `transaction_tag_rules`
SET `is_active` = 0
WHERE `is_active` = 1
  AND json_array_length(`tags`) = 0;
--> statement-breakpoint
UPDATE `tag_vocabulary`
SET `usage_count` = (
	SELECT COUNT(DISTINCT r.id) FROM `transactions` r, json_each(r.`tags`) je
	 WHERE je.value = `tag_vocabulary`.`tag`
)
WHERE `tag` = 'fee:membership';
--> statement-breakpoint
UPDATE `tag_vocabulary`
SET `description` = 'A card or account membership fee, charged for holding the card or account itself, such as a card''s annual fee. Not a subscription or a gym or club membership: those are purchases.'
WHERE `tag` = 'fee:membership';
--> statement-breakpoint
-- 0113's `fee:account-keeping` description glossed `fee:membership` as "a card
-- or subscription membership fee", which would keep telling the categorizer a
-- subscription belongs there.
UPDATE `tag_vocabulary`
SET `description` = 'A bank''s periodic account-keeping or servicing fee, e.g. for not meeting a minimum-deposit condition. Not fee:membership, a fee for holding a card.'
WHERE `tag` = 'fee:account-keeping';
