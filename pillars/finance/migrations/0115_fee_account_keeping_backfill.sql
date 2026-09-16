-- POPS-3703: type-backfill companion to 0113's vocabulary insert.
--
-- 0113 added `fee:account-keeping` to the closed vocabulary but the
-- deterministic classifier (`transaction-classification.ts`'s `FEE_PATTERNS`)
-- had no pattern for it, so an `ACCOUNT SERVICING FEE` / `ACCOUNT KEEPING FEE`
-- import fell through to the entity matcher or AI fallback instead of
-- classifying deterministically. The classifier now knows the pattern; this
-- migration retypes any row imported before that fix, on the same convention
-- 0080/0102 use for a pattern added after the fact — the invariant
-- `fee-transfer-type-migration.test.ts` exists to hold: a stored row must end
-- up typed the same as a fresh import of the same descriptor would be.
--
-- No amount-sign special-case: `REVERSAL OF ACCOUNT SERVICING FEE` (the
-- credit undoing the charge) still matches and is typed `fee` /
-- `fee:account-keeping` the same as the debit, exactly as the classifier does
-- it — the two are meant to net out in a fee report.
--
-- `MONTHLY ACCOUNT FEE` / `ACCOUNT SERVICE FEE` moved into this same bucket
-- from `fee:membership` (POPS-3703 review finding): they name the bank
-- charging for the account, not a card or subscription membership, the same
-- distinction that put `ACCOUNT SERVICING FEE` here in the first place. A row
-- imported under the old classification is retyped the same way, and a row
-- already `fee`/`fee:membership` has that one value swapped for
-- `fee:account-keeping` — every other tag on the row is left as authored.
--
-- Idempotent: gated on `type = 'purchase'` / "no fee: tag yet" / "still
-- carries fee:membership", so a second run finds nothing left to change.
-- REQUIRED before running against a real database: take a snapshot first
-- (finance-audit remediation policy). Rollback = restore the snapshot.

UPDATE `transactions` SET `type` = 'fee'
FROM (SELECT `id` AS nid,
	           REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') AS norm
	    FROM `transactions`) n
WHERE `transactions`.`id` = n.nid
  AND `transactions`.`type` = 'purchase'
  AND (n.norm LIKE '%ACCOUNT SERVICING FEE%'
	    OR n.norm LIKE '%ACCOUNT KEEPING FEE%'
	    OR n.norm LIKE '%MONTHLY ACCOUNT FEE%'
	    OR n.norm LIKE '%ACCOUNT SERVICE FEE%');
--> statement-breakpoint
UPDATE `transactions`
SET `tags` = json_insert(
		(SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
		 WHERE je.value NOT LIKE 'fee:%'),
		'$[#]',
		'fee:account-keeping'
	)
FROM (SELECT `id` AS nid,
	           REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') AS norm
	    FROM `transactions`) n
WHERE `transactions`.`id` = n.nid
  AND `transactions`.`type` = 'fee'
  AND (n.norm LIKE '%ACCOUNT SERVICING FEE%'
	    OR n.norm LIKE '%ACCOUNT KEEPING FEE%'
	    OR n.norm LIKE '%MONTHLY ACCOUNT FEE%'
	    OR n.norm LIKE '%ACCOUNT SERVICE FEE%')
  AND NOT EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value LIKE 'fee:%'
  );
--> statement-breakpoint
-- A row already typed `fee` with `fee:membership` from the old pattern (only
-- `MONTHLY ACCOUNT FEE` / `ACCOUNT SERVICE FEE` could have earned that
-- combination) has that one value swapped, not appended — every non-`fee:`
-- tag stays, matching the "replace, don't add a second" convention above.
UPDATE `transactions`
SET `tags` = json_insert(
		(SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
		 WHERE je.value != 'fee:membership'),
		'$[#]',
		'fee:account-keeping'
	)
FROM (SELECT `id` AS nid,
	           REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') AS norm
	    FROM `transactions`) n
WHERE `transactions`.`id` = n.nid
  AND `transactions`.`type` = 'fee'
  AND (n.norm LIKE '%MONTHLY ACCOUNT FEE%'
	    OR n.norm LIKE '%ACCOUNT SERVICE FEE%')
  AND EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'fee:membership'
  );
--> statement-breakpoint
-- The `fee:` values just applied were not on the rows when 0114 last counted,
-- and `fee:membership` just lost some of the rows it had. Recomputed rather
-- than adjusted, so a re-run lands on the same numbers for both — same
-- `COUNT(DISTINCT r.id)` statement 0114 uses.
UPDATE `tag_vocabulary`
SET `usage_count` = (
	SELECT COUNT(DISTINCT r.id) FROM `transactions` r, json_each(r.`tags`) je
	 WHERE je.value = `tag_vocabulary`.`tag`
)
WHERE `tag` IN ('fee:account-keeping', 'fee:membership');
