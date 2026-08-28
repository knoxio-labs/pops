-- POPS-2610: fees and gift cards stop being purchases.
--
-- `transactions.type` held two values in practice — `purchase` and `transfer` —
-- so everything that was not a purchase was expressed as a tag. Two kinds of row
-- were wrong as a result: an interest or late charge sat in the same namespace
-- as the things that were bought (and the one nobody tagged sat in no namespace
-- at all), and a gift card bought booked outflow that the later spend booked a
-- second time.
--
-- This backfill types the rows already stored, from their descriptors, mirroring
-- `contract/transaction-classification.ts` — which is what types every future
-- import. The two are pinned to each other by
-- `src/db/__tests__/fee-transfer-type-migration.test.ts`, which runs both over
-- the same descriptors and fails if they disagree.
--
-- `n.norm` folds case, hyphens, `&` and `.` exactly as `normalizeDescription`
-- does. It does NOT strip digits, which plain SQLite cannot do; the only
-- divergence that creates is a descriptor whose phrase is split by a digit
-- (`LATE 1 FEE`), which no issuer emits.
--
-- Idempotent: every statement re-derives its result from the description rather
-- than from the current value, and the `fee:` value is rebuilt from scratch
-- (existing `fee:` values stripped, the derived one appended), so a second run
-- lands the same rows on the same single value. REQUIRED before running against
-- a real database: take a snapshot first (finance-audit remediation policy).
-- Rollback = restore the snapshot.

-- 1. Fees. `type` answers "is this spend at all"; the `fee:` value answers
-- "which fee". Most specific kind first, first match wins — the order of the
-- classifier's pattern table.
UPDATE `transactions`
SET `type` = 'fee',
	`tags` = json_insert(
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
-- 2. Gift cards. Buying one converts money into a different spendable form —
-- structurally a cash withdrawal, and counted twice the moment the card is
-- spent. `contains:gift-card` stays as the descriptor; the type is what takes
-- the row out of spend. Only a `purchase` is rewritten: a gift-card refund or
-- income row means something else.
UPDATE `transactions`
SET `type` = 'transfer'
WHERE `type` = 'purchase'
  AND EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'contains:gift-card'
  );
--> statement-breakpoint
-- 3. Inbound account payments (`PayID Payment Received, Thank you` and friends)
-- were stored as purchases, which no spend query handles correctly whichever
-- sign the amount carried. They are money moving between the user's own
-- accounts.
UPDATE `transactions`
SET `type` = 'transfer'
FROM (SELECT `id` AS nid,
	           REPLACE(REPLACE(REPLACE(UPPER(`description`), '-', ' '), '&', ''), '.', '') AS norm
	    FROM `transactions`) n
WHERE `transactions`.`id` = n.nid
  AND `transactions`.`type` = 'purchase'
  AND (n.norm LIKE '%PAYMENT RECEIVED%'
	    OR n.norm LIKE '%PAYMENT THANK YOU%'
	    OR n.norm LIKE '%THANK YOU FOR YOUR PAYMENT%'
	    OR n.norm LIKE '%DIRECT DEBIT RECEIVED%');
--> statement-breakpoint
-- 4. The `fee:` values this backfill just applied were not in `transactions` when
-- 0069 counted them, so their `usage_count` is short by exactly the rows above.
-- Recomputed rather than incremented, so a re-run lands on the same number.
UPDATE `tag_vocabulary`
SET `usage_count` = (
	SELECT COUNT(*) FROM `transactions` r, json_each(r.`tags`) je
	 WHERE je.value = `tag_vocabulary`.`tag`
)
WHERE `tag` LIKE 'fee:%';
