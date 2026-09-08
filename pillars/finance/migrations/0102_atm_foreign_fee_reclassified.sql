-- POPS-3149 companion: `type = 'fee'` rows that are actually ATM cash
-- withdrawals, reclassified `purchase` to agree with the classifier change in
-- the same PR.
--
-- ANZ appends `INCL ... TRANSACTION FEE $X.XX` to a foreign-currency ATM
-- withdrawal line as a disclosure of what the total includes, not as a
-- separate charge. That trailer matched a `fee:` pattern
-- (`transaction-classification.ts`'s `FEE_PATTERNS`) and typed the whole
-- withdrawn amount `fee`, when only a few dollars of it are one — the cash is
-- still gone, so `classifyFromDescription` now types this shape `purchase`
-- instead. Without this migration, a row imported before this change keeps
-- `type = 'fee'` forever while the identical descriptor on a fresh import is
-- `purchase` — the invariant `fee-transfer-type-migration.test.ts` exists to
-- hold.
--
-- Matched the same way `classifyFromDescription` now decides it: any `fee`
-- row whose description contains `ATM CARD`. That marker is specific to a
-- bank's ATM-withdrawal narrative and does not appear on a standalone fee
-- line (`ATM WITHDRAWAL FEE`, `ATM OPERATOR FEE`), so this does not touch a
-- row that is genuinely only a fee.
--
-- The stale `fee:` value is stripped along with the type: a `purchase` row
-- carrying a `fee:` tag is a row two migrations disagree about.
--
-- Idempotent: gated on `type = 'fee'`, so a second run finds nothing left to
-- retype. REQUIRED before running against a real database: take a snapshot
-- first (finance-audit remediation policy). Rollback = restore the snapshot.

UPDATE `transactions` SET `type` = 'purchase'
FROM (SELECT `id` AS nid,
	           REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') AS norm
	    FROM `transactions`) n
WHERE `transactions`.`id` = n.nid
  AND `transactions`.`type` = 'fee'
  AND n.norm LIKE '%ATM CARD%';
--> statement-breakpoint
UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
	 WHERE je.value NOT LIKE 'fee:%'
)
WHERE `type` = 'purchase'
  AND REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') LIKE '%ATM CARD%'
  AND EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value LIKE 'fee:%');
--> statement-breakpoint
-- The `fee:` values just vacated are still worn by other rows, so recomputed
-- rather than decremented — a re-run lands on the same number.
UPDATE `tag_vocabulary`
SET `usage_count` = (
	SELECT COUNT(*) FROM `transactions` r, json_each(r.`tags`) je
	 WHERE je.value = `tag_vocabulary`.`tag`
)
WHERE `tag` LIKE 'fee:%';
