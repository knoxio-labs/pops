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
-- Matched the same way `classifyFromDescription` now decides it, and no
-- looser: `ATM CARD` alone is not enough, because a `type = 'fee'` row can
-- also come from a `transaction_corrections` rule, which "still wins outright"
-- over the descriptor stage (process-transaction.ts) and has nothing to do
-- with this bug — retyping it here would silently overwrite a deliberate
-- correction. The classifier only overrides to `purchase` when the
-- description ALSO matches one of `FEE_PATTERNS`, so this migration repeats
-- that same phrase list (every tag, not only `fee:conversion` — the override
-- applies regardless of which fee kind matched) alongside the `ATM CARD`
-- check.
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
  AND n.norm LIKE '%ATM CARD%'
  AND (n.norm LIKE '%INTEREST CHARGE%'
	    OR n.norm LIKE '%PURCHASE INTEREST%'
	    OR n.norm LIKE '%CASH ADVANCE INTEREST%'
	    OR n.norm LIKE '%BALANCE TRANSFER INTEREST%'
	    OR n.norm LIKE '%CHARGE FOR OVERDUE PAYMENT%'
	    OR n.norm LIKE '%OVERDUE PAYMENT FEE%'
	    OR n.norm LIKE '%LATE PAYMENT FEE%'
	    OR n.norm LIKE '%LATE FEE%'
	    OR n.norm LIKE '%MISSED PAYMENT FEE%'
	    OR n.norm LIKE '%PAYMENT DISHONOUR FEE%'
	    OR n.norm LIKE '%DISHONOUR FEE%'
	    OR n.norm LIKE '%FOREIGN CURRENCY CONVERSION FEE%'
	    OR n.norm LIKE '%CURRENCY CONVERSION FEE%'
	    OR n.norm LIKE '%INTERNATIONAL TRANSACTION FEE%'
	    OR n.norm LIKE '%OVERSEAS TRANSACTION FEE%'
	    OR n.norm LIKE '%FOREIGN TRANSACTION FEE%'
	    OR n.norm LIKE '%ATM WITHDRAWAL FEE%'
	    OR n.norm LIKE '%ATM OPERATOR FEE%'
	    OR n.norm LIKE '%ATM FEE%'
	    OR n.norm LIKE '%CASH ADVANCE FEE%'
	    OR n.norm LIKE '%MEMBERSHIP FEE%'
	    OR n.norm LIKE '%ANNUAL MEMBERSHIP%'
	    OR n.norm LIKE '%ANNUAL FEE%'
	    OR n.norm LIKE '%CARD FEE%'
	    OR n.norm LIKE '%MONTHLY ACCOUNT FEE%'
	    OR n.norm LIKE '%ACCOUNT SERVICE FEE%'
	    OR n.norm LIKE '%CARD SURCHARGE%'
	    OR n.norm LIKE '%PAYMENT SURCHARGE%'
	    OR n.norm LIKE '%SURCHARGE FEE%');
--> statement-breakpoint
UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
	 WHERE je.value NOT LIKE 'fee:%'
)
FROM (SELECT `id` AS nid,
	           REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') AS norm
	    FROM `transactions`) n
WHERE `transactions`.`id` = n.nid
  AND `transactions`.`type` = 'purchase'
  AND n.norm LIKE '%ATM CARD%'
  AND (n.norm LIKE '%INTEREST CHARGE%'
	    OR n.norm LIKE '%PURCHASE INTEREST%'
	    OR n.norm LIKE '%CASH ADVANCE INTEREST%'
	    OR n.norm LIKE '%BALANCE TRANSFER INTEREST%'
	    OR n.norm LIKE '%CHARGE FOR OVERDUE PAYMENT%'
	    OR n.norm LIKE '%OVERDUE PAYMENT FEE%'
	    OR n.norm LIKE '%LATE PAYMENT FEE%'
	    OR n.norm LIKE '%LATE FEE%'
	    OR n.norm LIKE '%MISSED PAYMENT FEE%'
	    OR n.norm LIKE '%PAYMENT DISHONOUR FEE%'
	    OR n.norm LIKE '%DISHONOUR FEE%'
	    OR n.norm LIKE '%FOREIGN CURRENCY CONVERSION FEE%'
	    OR n.norm LIKE '%CURRENCY CONVERSION FEE%'
	    OR n.norm LIKE '%INTERNATIONAL TRANSACTION FEE%'
	    OR n.norm LIKE '%OVERSEAS TRANSACTION FEE%'
	    OR n.norm LIKE '%FOREIGN TRANSACTION FEE%'
	    OR n.norm LIKE '%ATM WITHDRAWAL FEE%'
	    OR n.norm LIKE '%ATM OPERATOR FEE%'
	    OR n.norm LIKE '%ATM FEE%'
	    OR n.norm LIKE '%CASH ADVANCE FEE%'
	    OR n.norm LIKE '%MEMBERSHIP FEE%'
	    OR n.norm LIKE '%ANNUAL MEMBERSHIP%'
	    OR n.norm LIKE '%ANNUAL FEE%'
	    OR n.norm LIKE '%CARD FEE%'
	    OR n.norm LIKE '%MONTHLY ACCOUNT FEE%'
	    OR n.norm LIKE '%ACCOUNT SERVICE FEE%'
	    OR n.norm LIKE '%CARD SURCHARGE%'
	    OR n.norm LIKE '%PAYMENT SURCHARGE%'
	    OR n.norm LIKE '%SURCHARGE FEE%')
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
