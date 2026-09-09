-- POPS-3302: strip `occasion:home` from the rows that only ever had it because
-- the value had no definition.
--
-- 0104 recorded what `occasion:` means — the social setting the money was spent
-- in — and 0105 applied it to the two cases with unambiguous evidence on the
-- row. This is the rest. 167 rows carry `occasion:home`; under the recorded
-- definition most of them should carry no occasion at all, because routine
-- provisioning does not have one.
--
-- The rule is keyed on tags already on the row, in three buckets:
--
-- **Strip.** The row names something consumed or provisioned — groceries, a
-- meal, drink, a subscription, clothing. Where the goods end up is not an
-- occasion, which is the reasoning `PRICELINE PHARMACY -> occasion:home` and
-- the four grocery rules were all built on ("the food is consumed at home").
-- 68 of the 167 carry `contains:groceries` alone.
--
-- **Keep.** The row names spend on the dwelling itself: rent, utilities,
-- furnishing, repair, the household consumables that keep it running, or one of
-- the `enrich:` markers for a retailer that sells nothing else (IKEA, Bunnings,
-- The Good Guys). `occasion:home` is exactly right on these and 0104's
-- definition names them.
--
-- **Neither.** Flagged for review and left carrying the tag. ~30 rows match no
-- signal either way — an insurance payment, a phone bill, a one-off merchant
-- with nothing but `occasion:home` on it. Guessing at those is what produced
-- the problem; 0071 and 0073 both flag rather than guess, and stripping them
-- would destroy the only evidence of what a human once thought the row was.
--
-- Strip wins over keep where a row carries both. A Woolworths run that included
-- washing powder is still a grocery run: `contains:household` describes what
-- was in the basket, not what the money was spent on. Ordering the buckets the
-- other way would keep the tag on the single largest group this migration
-- exists to correct.
--
-- Pharmacy rows are already `occasion:health` after 0105 and match nothing
-- here. Bunnings rows keep `occasion:home` via `enrich:bunnings`.
--
-- `usage_count` is decremented by exactly the number of rows stripped, counted
-- before the strip. The counter ranks the categorizer prompt, so leaving it at
-- 167 would keep offering `home` second on the axis it was just corrected off.
--
-- Idempotent: every statement re-derives its set from the current tags, the
-- flag is guarded against being added twice, and a re-run finds nothing to
-- strip so decrements zero. REQUIRED before running against a real database:
-- take a snapshot first (finance-audit remediation policy). Rollback = restore
-- the snapshot.

-- 1. Flag the rows no signal decides, BEFORE anything moves, while the row
-- still reads as it did. These keep `occasion:home`; the flag says a human
-- still owes the row a decision.
UPDATE `transactions`
SET `tags` = json_insert(`tags`, '$[#]', 'flag:needs-review')
WHERE EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'occasion:home')
  AND NOT EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value IN (
	  'contains:groceries', 'contains:food', 'contains:alcohol', 'contains:coffee',
	  'contains:fast-food', 'contains:ice-cream', 'contains:bubble-tea',
	  'contains:subscription', 'contains:streaming', 'contains:software',
	  'contains:games', 'contains:clothing', 'contains:fitness', 'contains:events',
	  'contains:health', 'contains:haircut', 'contains:gift', 'contains:gift-card',
	  'contains:party-supplies', 'contains:office-supplies', 'contains:public-transport',
	  'contains:parking', 'contains:fuel', 'contains:charging', 'contains:rideshare',
	  'contains:accommodation', 'contains:flight', 'contains:car-rental', 'contains:entry',
	  'venue:bottle-shop', 'venue:bakery', 'venue:cafe', 'venue:restaurant', 'venue:takeaway',
	  'venue:convenience-store', 'venue:supermarket', 'venue:butcher', 'venue:clothing',
	  'venue:sex-shop', 'venue:pub', 'venue:club', 'venue:cinema', 'venue:arcade',
	  'venue:attraction', 'venue:vending-machine', 'venue:sauna', 'venue:transport',
	  'venue:parking', 'venue:pharmacy'
	)
  )
  AND NOT EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value IN (
	  'contains:utilities', 'contains:rent', 'contains:mortgage', 'contains:household',
	  'contains:maintenance', 'contains:internet',
	  'venue:homewares', 'venue:hardware', 'venue:electronics',
	  'enrich:ikea', 'enrich:bunnings', 'enrich:good-guys', 'enrich:kmart', 'enrich:bigw'
	)
  )
  AND NOT EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'flag:needs-review'
  );
--> statement-breakpoint

-- 2. Correct the usage count by the number of rows about to lose the tag,
-- while they still carry it.
UPDATE `tag_vocabulary`
SET `usage_count` = max(0, `usage_count` - (
	SELECT COUNT(*) FROM `transactions` t
	 WHERE EXISTS (SELECT 1 FROM json_each(t.`tags`) je WHERE je.value = 'occasion:home')
	   AND EXISTS (
		SELECT 1 FROM json_each(t.`tags`) je WHERE je.value IN (
		  'contains:groceries', 'contains:food', 'contains:alcohol', 'contains:coffee',
		  'contains:fast-food', 'contains:ice-cream', 'contains:bubble-tea',
		  'contains:subscription', 'contains:streaming', 'contains:software',
		  'contains:games', 'contains:clothing', 'contains:fitness', 'contains:events',
		  'contains:health', 'contains:haircut', 'contains:gift', 'contains:gift-card',
		  'contains:party-supplies', 'contains:office-supplies', 'contains:public-transport',
		  'contains:parking', 'contains:fuel', 'contains:charging', 'contains:rideshare',
		  'contains:accommodation', 'contains:flight', 'contains:car-rental', 'contains:entry',
		  'venue:bottle-shop', 'venue:bakery', 'venue:cafe', 'venue:restaurant', 'venue:takeaway',
		  'venue:convenience-store', 'venue:supermarket', 'venue:butcher', 'venue:clothing',
		  'venue:sex-shop', 'venue:pub', 'venue:club', 'venue:cinema', 'venue:arcade',
		  'venue:attraction', 'venue:vending-machine', 'venue:sauna', 'venue:transport',
		  'venue:parking', 'venue:pharmacy'
		)
	   )
))
WHERE `tag` = 'occasion:home';
--> statement-breakpoint

-- 3. Strip it from every row that names something consumed or provisioned.
UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
	 WHERE je.value <> 'occasion:home'
)
WHERE EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'occasion:home')
  AND EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value IN (
	  'contains:groceries', 'contains:food', 'contains:alcohol', 'contains:coffee',
	  'contains:fast-food', 'contains:ice-cream', 'contains:bubble-tea',
	  'contains:subscription', 'contains:streaming', 'contains:software',
	  'contains:games', 'contains:clothing', 'contains:fitness', 'contains:events',
	  'contains:health', 'contains:haircut', 'contains:gift', 'contains:gift-card',
	  'contains:party-supplies', 'contains:office-supplies', 'contains:public-transport',
	  'contains:parking', 'contains:fuel', 'contains:charging', 'contains:rideshare',
	  'contains:accommodation', 'contains:flight', 'contains:car-rental', 'contains:entry',
	  'venue:bottle-shop', 'venue:bakery', 'venue:cafe', 'venue:restaurant', 'venue:takeaway',
	  'venue:convenience-store', 'venue:supermarket', 'venue:butcher', 'venue:clothing',
	  'venue:sex-shop', 'venue:pub', 'venue:club', 'venue:cinema', 'venue:arcade',
	  'venue:attraction', 'venue:vending-machine', 'venue:sauna', 'venue:transport',
	  'venue:parking', 'venue:pharmacy'
	)
  );
--> statement-breakpoint

-- 4. The rules that assert it. A grocery rule reasoning "the food is consumed
-- at home" is the origin of the largest group above, and leaving it active
-- would re-tag the same rows on the next import. Both rule tables carry a tag
-- set of their own.
--
-- Keyed on the rule's OWN tags rather than on its pattern: a rule asserting
-- `venue:supermarket` + `occasion:home` is a grocery rule whatever merchant it
-- names, and matching merchant names here would mean maintaining a second list
-- of them.
--
-- No rule can be emptied by this, which is why there is no
-- deactivate-the-empty-rules statement here as there is in 0071: the strip only
-- touches a rule that carries a consumption signal, and that signal is one of
-- the rule's own tags, so the tag it keeps is the one that qualified it.
UPDATE `transaction_tag_rules`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_tag_rules`.`tags`) je
	 WHERE je.value <> 'occasion:home'
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'occasion:home'
  )
  AND EXISTS (
	SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value IN (
	  'contains:groceries', 'contains:food', 'contains:alcohol', 'contains:subscription',
	  'contains:streaming', 'contains:software', 'contains:games', 'contains:clothing',
	  'venue:supermarket', 'venue:bottle-shop', 'venue:convenience-store', 'venue:butcher',
	  'venue:bakery', 'venue:cafe', 'venue:restaurant', 'venue:takeaway', 'venue:pharmacy'
	)
  );
--> statement-breakpoint
UPDATE `transaction_corrections`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_corrections`.`tags`) je
	 WHERE je.value <> 'occasion:home'
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'occasion:home'
  )
  AND EXISTS (
	SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value IN (
	  'contains:groceries', 'contains:food', 'contains:alcohol', 'contains:subscription',
	  'contains:streaming', 'contains:software', 'contains:games', 'contains:clothing',
	  'venue:supermarket', 'venue:bottle-shop', 'venue:convenience-store', 'venue:butcher',
	  'venue:bakery', 'venue:cafe', 'venue:restaurant', 'venue:takeaway', 'venue:pharmacy'
	)
  );
