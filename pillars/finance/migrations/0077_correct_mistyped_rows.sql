-- POPS-2680: seven rows whose `type` misrepresents what they are.
--
-- Since POPS-2610 made spend aggregations filter on `type`, a wrong `type` is a
-- wrong number rather than a cosmetic mislabel. These seven were found by
-- querying for rows whose amount sign and type disagree, and by the two rows
-- holding `audit-tag-coverage --strict` red.
--
-- Matched by id, never by description or by sign. A description match would
-- sweep the correctly-typed rows sharing those merchants, and a sign match
-- would re-fire on every future credit — the kind of backfill that is right
-- today and wrong on the next import.
--
-- Each id was read against its `raw_row` before being listed here.
--
-- THE THREE POSITIVE AMEX ROWS. Amex exports a charge as a positive `Amount`
-- and a credit as a negative one, and the importer inverts that, so a stored
-- positive is money genuinely arriving. The amounts are right and only the type
-- is wrong.
--
--   adc58397  +$5.00   `Additional Information: "Amex Offer Credit"` — a
--                      promotional credit from the issuer, so `rebate` (income
--                      tile, outside spend) rather than `refund`. Both types
--                      exist precisely to separate a marketing credit from
--                      money back on returned goods.
--   71a7755a  +$24.95  Amazon, no additional information — goods returned, so
--   9e5c2053  +$10.00  Bunnings, likewise                    `refund`, which
--                      stays inside spend because it offsets what was spent
--                      at that merchant.
--
-- THE CARD PAYMENT. fe71d44d, +$500.00 `PAYMENT THANKYOU 754244` on the ANZ
-- card, is money moving from a bank account to a card. It is not spend in any
-- direction, so `transfer`. As `purchase` it added $500 to a total that sums
-- outgoings. Its `flag:needs-review` goes with it: the flag recorded that the
-- row needed a decision, and this is the decision.
--
-- THE THREE SURCHARGES. Each is a fee the descriptor does not announce, which
-- is why no classifier pattern found them and why they are corrected here by id
-- rather than by a new pattern.
--
--   47e162b1, 3003e3e2  −$0.49 `VIRGIN AUSTRALIA`, each dated the same day as a
--                       −$46.00 fare from the same merchant. The pairing is the
--                       evidence: a 49-cent line beside a fare is the booking
--                       surcharge on it.
--   35b038bf            −$0.72 `TM *TICKETMASTER`. `raw_row` gives `0.72` with
--                       no additional information, so it is a genuine charge
--                       and not a partial refund; 72 cents at a ticket agency
--                       is a booking surcharge.
--
-- Their tags move with the type, on 0073's reasoning: `contains:` says what a
-- purchase contained, and a fee is not a purchase. The two Virgin rows carry
-- `contains:fee`, a value 0073 retired but deliberately left on them because
-- the classifier could not type them — typing them here is exactly the event
-- 0073 was waiting for, so the stranded value goes and `fee:surcharge` says
-- which fee it is. `occasion:travel` stays: it is still true, and it is only
-- measured on spend rows, so it stops being asked for rather than becoming
-- wrong. Ticketmaster's `contains:events` goes for the same reason its type
-- changes.
--
-- Idempotent: every statement re-derives from the current state, so a second
-- run finds the types already correct and the tags already stripped. REQUIRED
-- before running against a real database: take a snapshot first (finance-audit
-- remediation policy). Rollback = restore the snapshot.

-- 1. The Amex promotional credit — income, not an offset against spend.
UPDATE `transactions` SET `type` = 'rebate'
WHERE `id` = 'adc58397-b2e9-436c-8290-f91f076e0b63' AND `type` <> 'rebate';
--> statement-breakpoint
-- 2. The two merchant credits for returned goods.
UPDATE `transactions` SET `type` = 'refund'
WHERE `id` IN (
	'71a7755a-0dd9-4a3b-8293-3cac48504b34',
	'9e5c2053-0039-4959-991a-8db0e5b322aa'
) AND `type` <> 'refund';
--> statement-breakpoint
-- 3. The card payment, and any other row wearing the descriptor that missed.
--
-- The one place this migration matches on a descriptor rather than an id, and
-- deliberately: `PAYMENT THANKYOU` unambiguously means a card being paid, the
-- way 0070's own patterns do, and ANZ writes it on every monthly statement. The
-- classifier gained the spelling in this change, so the rows already stored
-- need the same backfill 0070 gave the patterns it knew — otherwise a stored
-- row and a freshly imported one disagree, which is the invariant
-- `fee-transfer-type-migration.test.ts` exists to hold.
--
-- This is not the description match the header warns against. That warning is
-- about `AMAZON MARKETPLACE AU`, where the descriptor is shared with genuine
-- purchases and only the id distinguishes them.
UPDATE `transactions` SET `type` = 'transfer'
WHERE `type` = 'purchase'
  AND replace(upper(`description`), '  ', ' ') LIKE '%PAYMENT THANKYOU%';
--> statement-breakpoint
-- 4. The three surcharges.
UPDATE `transactions` SET `type` = 'fee'
WHERE `id` IN (
	'47e162b1-b356-40a3-8554-f83c6f579618',
	'3003e3e2-3ef0-4e57-abf5-c92af9b9df94',
	'35b038bf-d143-48b6-a9e0-4144de98080e'
) AND `type` <> 'fee';
--> statement-breakpoint
-- 5. The card payment's review flag: it recorded that a decision was owed, and
-- statement 3 is that decision.
UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
	 WHERE je.value <> 'flag:needs-review'
)
WHERE `id` = 'fe71d44d-cf81-4703-bc20-3d95eac77ed2'
  AND EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'flag:needs-review');
--> statement-breakpoint
-- 6. The surcharges' purchase-shaped tags and review flags, replaced by the
-- `fee:` value that names the kind. `occasion:travel` is untouched.
UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
	 WHERE je.value NOT IN ('contains:fee', 'contains:events', 'flag:needs-review')
)
WHERE `id` IN (
	'47e162b1-b356-40a3-8554-f83c6f579618',
	'3003e3e2-3ef0-4e57-abf5-c92af9b9df94',
	'35b038bf-d143-48b6-a9e0-4144de98080e'
) AND EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je
	 WHERE je.value IN ('contains:fee', 'contains:events', 'flag:needs-review')
);
--> statement-breakpoint
UPDATE `transactions`
SET `tags` = json_insert(`tags`, '$[#]', 'fee:surcharge')
WHERE `id` IN (
	'47e162b1-b356-40a3-8554-f83c6f579618',
	'3003e3e2-3ef0-4e57-abf5-c92af9b9df94',
	'35b038bf-d143-48b6-a9e0-4144de98080e'
) AND NOT EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'fee:surcharge'
);
--> statement-breakpoint
-- 7. `contains:fee` is now worn by nobody, so its usage count says so.
-- Recomputed rather than decremented, so a re-run lands on the same number.
UPDATE `tag_vocabulary`
SET `usage_count` = (
	SELECT COUNT(*) FROM `transactions` r, json_each(r.`tags`) je
	 WHERE je.value = `tag_vocabulary`.`tag`
)
WHERE `tag` = 'contains:fee';
