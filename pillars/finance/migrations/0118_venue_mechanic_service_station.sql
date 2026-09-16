-- POPS-3744: `venue:auto` becomes `venue:mechanic`, and a service station gets a venue of its own.
--
-- The categorizer offered `venue:auto` (chip "Auto") for a petrol station. The
-- facet had no value for one, and "auto" reads as anything to do with a car.
-- Its two prod uses were both car-hire firms, which are not a garage either.
-- The name, not only the description, invited the guess, so the value is
-- renamed to say what it is and the missing bucket is added beside it.
--
-- Rows, tag rules and correction rules:
--   1. `venue:auto` is removed wherever the same tag set carries
--      `contains:car-rental`. A car-hire firm has no venue value, and an axis
--      may be left empty since POPS-3667. Every other tag keeps its place.
--   2. Any `venue:auto` left is replaced by `venue:mechanic` in place. A set
--      already holding `venue:mechanic` keeps only its first occurrence, so the
--      single-valued venue facet is not given two values by the rename.
-- `tag_rule_rejections` and `ai_tag_suggestion_outcomes` are left as written:
-- they record what was proposed or suggested at the time, and 0075's merge
-- and 0112's move left them alone for the same reason.
--
-- Vocabulary: `venue:auto` is deactivated rather than deleted, as 0075 retired
-- `venue:bar`: nothing references a vocabulary row by key, but deactivation is
-- how this table models retirement and it makes the closed-facet gate refuse
-- the old value. `usage_count` of the three venue values is recounted from the
-- rows, never adjusted by a delta.
--
-- Idempotent: row statements are gated on `venue:auto` still being present,
-- inserts are `OR IGNORE`, and descriptions and counts are assigned outright,
-- so a second run changes nothing.
-- REQUIRED before running against a real database: take a snapshot first
-- (finance-audit remediation policy). Rollback = restore the snapshot.

UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
	 WHERE je.value != 'venue:auto'
)
WHERE EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'venue:auto')
  AND EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'contains:car-rental');
--> statement-breakpoint
UPDATE `transaction_tag_rules`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_tag_rules`.`tags`) je
	 WHERE je.value != 'venue:auto'
)
WHERE EXISTS (SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'venue:auto')
  AND EXISTS (SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'contains:car-rental');
--> statement-breakpoint
UPDATE `transaction_corrections`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_corrections`.`tags`) je
	 WHERE je.value != 'venue:auto'
)
WHERE EXISTS (SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'venue:auto')
  AND EXISTS (SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'contains:car-rental');
--> statement-breakpoint
UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(m.mapped) FROM (
		SELECT je.key AS k, CASE je.value WHEN 'venue:auto' THEN 'venue:mechanic' ELSE je.value END AS mapped
		  FROM json_each(`transactions`.`tags`) je ORDER BY je.key
	) m
	 WHERE m.mapped != 'venue:mechanic'
	    OR NOT EXISTS (
		SELECT 1 FROM json_each(`transactions`.`tags`) prior
		 WHERE prior.key < m.k AND prior.value IN ('venue:auto', 'venue:mechanic')
	    )
)
WHERE EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'venue:auto');
--> statement-breakpoint
UPDATE `transaction_tag_rules`
SET `tags` = (
	SELECT json_group_array(m.mapped) FROM (
		SELECT je.key AS k, CASE je.value WHEN 'venue:auto' THEN 'venue:mechanic' ELSE je.value END AS mapped
		  FROM json_each(`transaction_tag_rules`.`tags`) je ORDER BY je.key
	) m
	 WHERE m.mapped != 'venue:mechanic'
	    OR NOT EXISTS (
		SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) prior
		 WHERE prior.key < m.k AND prior.value IN ('venue:auto', 'venue:mechanic')
	    )
)
WHERE EXISTS (SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'venue:auto');
--> statement-breakpoint
UPDATE `transaction_corrections`
SET `tags` = (
	SELECT json_group_array(m.mapped) FROM (
		SELECT je.key AS k, CASE je.value WHEN 'venue:auto' THEN 'venue:mechanic' ELSE je.value END AS mapped
		  FROM json_each(`transaction_corrections`.`tags`) je ORDER BY je.key
	) m
	 WHERE m.mapped != 'venue:mechanic'
	    OR NOT EXISTS (
		SELECT 1 FROM json_each(`transaction_corrections`.`tags`) prior
		 WHERE prior.key < m.k AND prior.value IN ('venue:auto', 'venue:mechanic')
	    )
)
WHERE EXISTS (SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'venue:auto');
--> statement-breakpoint
INSERT OR IGNORE INTO `tag_vocabulary` (`tag`, `facet`, `kind`, `source`, `is_active`, `usage_count`, `description`) VALUES
  ('venue:mechanic', 'venue', 'closed', 'seed', 1, 0, 'A garage, mechanic or car-parts shop, where a vehicle is serviced, repaired or its parts bought. Not a petrol station (venue:service-station) or a car-hire firm.'),
  ('venue:service-station', 'venue', 'closed', 'seed', 1, 0, 'A petrol or service station, where fuel or EV charging is bought, including its shop. Not a mechanic (venue:mechanic).');
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `is_active` = 0 WHERE `tag` = 'venue:auto';
--> statement-breakpoint
UPDATE `tag_vocabulary`
SET `description` = 'Spend on a car the user owns or leases: charging, fuel, servicing, registration, the lease itself. Not a hire car.'
WHERE `tag` = 'asset:car';
--> statement-breakpoint
UPDATE `tag_vocabulary`
SET `description` = 'Petrol or diesel bought for a vehicle. Not EV charging (contains:charging).'
WHERE `tag` = 'contains:fuel';
--> statement-breakpoint
UPDATE `tag_vocabulary`
SET `description` = 'Road or bridge tolls.'
WHERE `tag` = 'contains:tolls';
--> statement-breakpoint
UPDATE `tag_vocabulary`
SET `description` = 'A hire car, paid to a car-hire firm.'
WHERE `tag` = 'contains:car-rental';
--> statement-breakpoint
UPDATE `tag_vocabulary`
SET `usage_count` = (
	SELECT COUNT(DISTINCT r.id) FROM `transactions` r, json_each(r.`tags`) je
	 WHERE je.value = `tag_vocabulary`.`tag`
)
WHERE `tag` IN ('venue:auto', 'venue:mechanic', 'venue:service-station');
