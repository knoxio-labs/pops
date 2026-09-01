-- POPS-2754: the rows a correction rule mistyped, and the two rules that did it.
--
-- 0070 backfilled `type` from the descriptor and 0077 corrected the seven rows
-- that survived it. Both were correct when they ran. What refilled the hole is
-- the live import path: a correction rule that named a merchant applied the
-- merchant and dropped its own `transactionType`, and a rule that named a
-- merchant and no type suppressed the descriptor stage entirely. Every row a
-- rule matched was therefore typed by the commit-time
-- `txn.transactionType ?? 'purchase'` default rather than by the classifier.
-- The 2026-09-01 ANZ import is the visible result: `PAYMENT THANKYOU 008667`
-- (+$4,545.37) and `PAYMENT THANKYOU 964110` (+$3,000.00) stored as `purchase`,
-- against a rule that says `transfer`, subtracting $7,545 from June's expenses.
--
-- Matching by descriptor rather than by id, on 0070's reasoning and 0077's
-- exception: these phrases are unambiguous and issuer-emitted, they are the
-- same table the classifier types future imports from, and re-deriving covers
-- the rows this audit did not enumerate — the ledger is larger than the sample
-- that found the defect. `n.norm` folds case, hyphens, `&` and `.` exactly as
-- `normalizeDescription` does, and does not strip digits, which plain SQLite
-- cannot do; the only divergence that creates is a descriptor whose phrase is
-- split by a digit (`LATE 1 FEE`), which no issuer emits.
--
-- Each fee statement is gated on `type = 'purchase'`, so the most specific kind
-- claims the row and the later statements leave it alone — the classifier's
-- own first-match-wins order.
--
-- Idempotent: every statement re-derives from the description and the current
-- value, so a second run finds the types already correct. REQUIRED before
-- running against a real database: take a snapshot first (finance-audit
-- remediation policy). Rollback = restore the snapshot.

-- 1. Inbound account payments. Money arriving to settle a card is a `transfer`
-- in both directions and never spend, whichever sign the amount carries. 0070
-- swept the spaced spellings and 0077 the joined one; both ran before the rows
-- this migration exists for were imported.
UPDATE `transactions`
SET `type` = 'transfer'
FROM (SELECT `id` AS nid,
	           REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') AS norm
	    FROM `transactions`) n
WHERE `transactions`.`id` = n.nid
  AND `transactions`.`type` = 'purchase'
  AND (n.norm LIKE '%PAYMENT RECEIVED%'
	    OR n.norm LIKE '%PAYMENT THANK YOU%'
	    OR n.norm LIKE '%PAYMENT THANKYOU%'
	    OR n.norm LIKE '%THANK YOU FOR YOUR PAYMENT%'
	    OR n.norm LIKE '%DIRECT DEBIT RECEIVED%');
--> statement-breakpoint
-- 2. Fees, most specific kind first. A fee is money that left, so it stays on
-- the expense tile; what its type buys is separability from the purchases, and
-- a fee typed `purchase` is invisible to every fee report by construction.
UPDATE `transactions` SET `type` = 'fee'
FROM (SELECT `id` AS nid,
	           REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') AS norm
	    FROM `transactions`) n
WHERE `transactions`.`id` = n.nid
  AND `transactions`.`type` = 'purchase'
  AND (n.norm LIKE '%INTEREST CHARGE%'
	    OR n.norm LIKE '%PURCHASE INTEREST%'
	    OR n.norm LIKE '%CASH ADVANCE INTEREST%'
	    OR n.norm LIKE '%BALANCE TRANSFER INTEREST%');
--> statement-breakpoint
UPDATE `transactions` SET `type` = 'fee'
FROM (SELECT `id` AS nid,
	           REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') AS norm
	    FROM `transactions`) n
WHERE `transactions`.`id` = n.nid
  AND `transactions`.`type` = 'purchase'
  AND (n.norm LIKE '%CHARGE FOR OVERDUE PAYMENT%'
	    OR n.norm LIKE '%OVERDUE PAYMENT FEE%'
	    OR n.norm LIKE '%LATE PAYMENT FEE%'
	    OR n.norm LIKE '%LATE FEE%'
	    OR n.norm LIKE '%MISSED PAYMENT FEE%'
	    OR n.norm LIKE '%PAYMENT DISHONOUR FEE%'
	    OR n.norm LIKE '%DISHONOUR FEE%');
--> statement-breakpoint
UPDATE `transactions` SET `type` = 'fee'
FROM (SELECT `id` AS nid,
	           REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') AS norm
	    FROM `transactions`) n
WHERE `transactions`.`id` = n.nid
  AND `transactions`.`type` = 'purchase'
  AND (n.norm LIKE '%FOREIGN CURRENCY CONVERSION FEE%'
	    OR n.norm LIKE '%CURRENCY CONVERSION FEE%'
	    OR n.norm LIKE '%INTERNATIONAL TRANSACTION FEE%'
	    OR n.norm LIKE '%OVERSEAS TRANSACTION FEE%'
	    OR n.norm LIKE '%FOREIGN TRANSACTION FEE%');
--> statement-breakpoint
UPDATE `transactions` SET `type` = 'fee'
FROM (SELECT `id` AS nid,
	           REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') AS norm
	    FROM `transactions`) n
WHERE `transactions`.`id` = n.nid
  AND `transactions`.`type` = 'purchase'
  AND (n.norm LIKE '%ATM WITHDRAWAL FEE%'
	    OR n.norm LIKE '%ATM OPERATOR FEE%'
	    OR n.norm LIKE '%ATM FEE%'
	    OR n.norm LIKE '%CASH ADVANCE FEE%');
--> statement-breakpoint
UPDATE `transactions` SET `type` = 'fee'
FROM (SELECT `id` AS nid,
	           REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') AS norm
	    FROM `transactions`) n
WHERE `transactions`.`id` = n.nid
  AND `transactions`.`type` = 'purchase'
  AND (n.norm LIKE '%MEMBERSHIP FEE%'
	    OR n.norm LIKE '%ANNUAL MEMBERSHIP%'
	    OR n.norm LIKE '%ANNUAL FEE%'
	    OR n.norm LIKE '%CARD FEE%'
	    OR n.norm LIKE '%MONTHLY ACCOUNT FEE%'
	    OR n.norm LIKE '%ACCOUNT SERVICE FEE%');
--> statement-breakpoint
UPDATE `transactions` SET `type` = 'fee'
FROM (SELECT `id` AS nid,
	           REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') AS norm
	    FROM `transactions`) n
WHERE `transactions`.`id` = n.nid
  AND `transactions`.`type` = 'purchase'
  AND (n.norm LIKE '%CARD SURCHARGE%'
	    OR n.norm LIKE '%PAYMENT SURCHARGE%'
	    OR n.norm LIKE '%SURCHARGE FEE%');
--> statement-breakpoint
-- 3. The `fee:` value naming the kind, for any row statement 2 typed that did
-- not already carry one. Rebuilt from scratch — existing `fee:` values stripped,
-- the derived one appended — so a re-run lands on the same single value.
UPDATE `transactions`
SET `tags` = json_insert(
		(SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
		 WHERE je.value NOT LIKE 'fee:%'),
		'$[#]',
		CASE
			WHEN n.norm LIKE '%INTEREST CHARGE%'
				  OR n.norm LIKE '%PURCHASE INTEREST%'
				  OR n.norm LIKE '%CASH ADVANCE INTEREST%'
				  OR n.norm LIKE '%BALANCE TRANSFER INTEREST%'
				THEN 'fee:interest'
			WHEN n.norm LIKE '%CHARGE FOR OVERDUE PAYMENT%'
				  OR n.norm LIKE '%OVERDUE PAYMENT FEE%'
				  OR n.norm LIKE '%LATE PAYMENT FEE%'
				  OR n.norm LIKE '%LATE FEE%'
				  OR n.norm LIKE '%MISSED PAYMENT FEE%'
				  OR n.norm LIKE '%PAYMENT DISHONOUR FEE%'
				  OR n.norm LIKE '%DISHONOUR FEE%'
				THEN 'fee:late'
			WHEN n.norm LIKE '%FOREIGN CURRENCY CONVERSION FEE%'
				  OR n.norm LIKE '%CURRENCY CONVERSION FEE%'
				  OR n.norm LIKE '%INTERNATIONAL TRANSACTION FEE%'
				  OR n.norm LIKE '%OVERSEAS TRANSACTION FEE%'
				  OR n.norm LIKE '%FOREIGN TRANSACTION FEE%'
				THEN 'fee:conversion'
			WHEN n.norm LIKE '%ATM WITHDRAWAL FEE%'
				  OR n.norm LIKE '%ATM OPERATOR FEE%'
				  OR n.norm LIKE '%ATM FEE%'
				  OR n.norm LIKE '%CASH ADVANCE FEE%'
				THEN 'fee:atm'
			WHEN n.norm LIKE '%MEMBERSHIP FEE%'
				  OR n.norm LIKE '%ANNUAL MEMBERSHIP%'
				  OR n.norm LIKE '%ANNUAL FEE%'
				  OR n.norm LIKE '%CARD FEE%'
				  OR n.norm LIKE '%MONTHLY ACCOUNT FEE%'
				  OR n.norm LIKE '%ACCOUNT SERVICE FEE%'
				THEN 'fee:membership'
			WHEN n.norm LIKE '%CARD SURCHARGE%'
				  OR n.norm LIKE '%PAYMENT SURCHARGE%'
				  OR n.norm LIKE '%SURCHARGE FEE%'
				THEN 'fee:surcharge'
		END
	)
FROM (SELECT `id` AS nid,
	           REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') AS norm
	    FROM `transactions`) n
WHERE `transactions`.`id` = n.nid
  AND `transactions`.`type` = 'fee'
  AND NOT EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value LIKE 'fee:%'
  );
--> statement-breakpoint
-- 4. The Apple credit. `f0469c46` is +$139.72 on `APPLE.COM/BILL`, the same
-- descriptor as the subscription charges around it, so only the id
-- distinguishes it — money back from a merchant, which is a `refund`: it stays
-- inside spend because it offsets what was spent there, unlike the promotional
-- credit 0077 typed `rebate`. It reached `purchase` through no rule of its own:
-- the Apple rule carries no type, the entity matched, and the commit-time
-- default supplied `purchase` for a positive amount.
UPDATE `transactions` SET `type` = 'refund'
WHERE `id` = 'f0469c46-57e8-4e6d-a67c-96090f6beee6' AND `type` <> 'refund';
--> statement-breakpoint
-- 5. The two rules that assert a fee is a purchase. Both predate `type = 'fee'`
-- (0070), when `purchase` was the only value a spend row could hold, and both
-- outrank the descriptor stage by design — so leaving them re-mistypes every
-- future `MEMBERSHIP FEE` and `INTEREST CHARGES` the moment statement 2 has
-- run. Cleared rather than set to `fee`: with no type of its own each rule
-- keeps naming the merchant and lets the classifier answer "which kind", which
-- is the one answer that cannot go stale as the fee table grows.
UPDATE `transaction_corrections` SET `transaction_type` = NULL
WHERE `id` IN (
	'4dc906d6-9453-46cc-b699-6b0d63ad2b51',
	'b54a8cf4-3c06-4a22-9742-a66f8149d5a8'
) AND `transaction_type` IS NOT NULL;
--> statement-breakpoint
-- 6. The `fee:` values statement 3 applied were not in `transactions` when 0069
-- counted them. Recomputed rather than incremented, so a re-run lands on the
-- same number.
UPDATE `tag_vocabulary`
SET `usage_count` = (
	SELECT COUNT(*) FROM `transactions` r, json_each(r.`tags`) je
	 WHERE je.value = `tag_vocabulary`.`tag`
)
WHERE `tag` LIKE 'fee:%';
