-- POPS-3952: a fast-food meal is contains:fast-food instead of contains:food,
-- and a meal with nothing to show counter service is venue:restaurant.
--
-- 0111 defined contains:fast-food as also carrying contains:food, which 0076
-- had already ruled the other way for OZTURK. The model followed 0111, so
-- every food-shaped row came back fast-food + food, and with venue:takeaway
-- defined by a service style a bank line almost never shows, takeaway beat
-- restaurant by default. The user ruled (2026-09-14): one of the two contains
-- values, never both; restaurant is the default venue for a meal.
--
-- Rows: contains:food is removed from every transaction, tag rule and
-- correction that also carries contains:fast-food; every other tag keeps its
-- place. usage_count of contains:food is recounted from the rows left.
--
-- Idempotent: descriptions are UPDATEs keyed on the tag, the row updates are
-- gated on both values being present, and the count is recomputed outright.
-- REQUIRED before running against a real database: take a snapshot first
-- (finance-audit remediation policy). Rollback = restore the snapshot.

UPDATE `tag_vocabulary` SET `description` = 'A meal from a fast-food chain. It replaces contains:food rather than joining it: a row carries one or the other, never both.' WHERE `tag` = 'contains:fast-food';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A prepared meal, eaten as bought. Not a meal from a fast-food chain, which is contains:fast-food instead; a row carries one or the other, never both.' WHERE `tag` = 'contains:food';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A place that serves meals, and the venue for a meal whenever the row does not show counter service. Not venue:takeaway; a row is one or the other, never both.' WHERE `tag` = 'venue:restaurant';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Counter service, taken away: only a fast-food chain or a merchant whose name says takeaway. A meal with nothing showing which is venue:restaurant, not this.' WHERE `tag` = 'venue:takeaway';
--> statement-breakpoint
UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
	 WHERE je.value != 'contains:food'
)
WHERE EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'contains:food')
  AND EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'contains:fast-food');
--> statement-breakpoint
UPDATE `transaction_tag_rules`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_tag_rules`.`tags`) je
	 WHERE je.value != 'contains:food'
)
WHERE EXISTS (SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'contains:food')
  AND EXISTS (SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'contains:fast-food');
--> statement-breakpoint
UPDATE `transaction_corrections`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_corrections`.`tags`) je
	 WHERE je.value != 'contains:food'
)
WHERE EXISTS (SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'contains:food')
  AND EXISTS (SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'contains:fast-food');
--> statement-breakpoint
UPDATE `tag_vocabulary`
SET `usage_count` = (
	SELECT COUNT(DISTINCT r.id) FROM `transactions` r, json_each(r.`tags`) je
	 WHERE je.value = `tag_vocabulary`.`tag`
)
WHERE `tag` = 'contains:food';
