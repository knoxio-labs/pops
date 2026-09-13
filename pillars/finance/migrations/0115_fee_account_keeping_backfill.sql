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
-- Idempotent: gated on `type = 'purchase'` / "no fee: tag yet", so a second
-- run finds nothing left to retype. REQUIRED before running against a real
-- database: take a snapshot first (finance-audit remediation policy).
-- Rollback = restore the snapshot.

UPDATE `transactions` SET `type` = 'fee'
FROM (SELECT `id` AS nid,
	           REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') AS norm
	    FROM `transactions`) n
WHERE `transactions`.`id` = n.nid
  AND `transactions`.`type` = 'purchase'
  AND (n.norm LIKE '%ACCOUNT SERVICING FEE%'
	    OR n.norm LIKE '%ACCOUNT KEEPING FEE%');
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
	    OR n.norm LIKE '%ACCOUNT KEEPING FEE%')
  AND NOT EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value LIKE 'fee:%'
  );
--> statement-breakpoint
-- The `fee:` values just applied were not on the rows when 0114 last counted.
-- Recomputed rather than incremented, so a re-run lands on the same number.
-- `COUNT(DISTINCT r.id)`, not `COUNT(*)`, matching 0114's reasoning.
UPDATE `tag_vocabulary`
SET `usage_count` = (
	SELECT COUNT(DISTINCT r.id) FROM `transactions` r, json_each(r.`tags`) je
	 WHERE je.value = `tag_vocabulary`.`tag`
)
WHERE `tag` = 'fee:account-keeping';
