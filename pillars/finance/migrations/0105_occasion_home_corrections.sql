-- POPS-3285: correct the rows and rules `occasion:home` collected while it had
-- no definition, and separate hardware from homewares.
--
-- 0104 gives the vocabulary somewhere to say what a value means. This applies
-- the definitions it records to the data that was tagged before they existed.
--
-- Two corrections, both keyed on evidence already on the row rather than on a
-- list of ids:
--
-- 1. A pharmacy row is `occasion:health`, not `occasion:home`. The seeded rule
--    `PRICELINE PHARMACY -> occasion:home` justified itself as "household
--    provisioning, same reasoning as the grocery runs", and that reasoning is
--    about where goods end up, which 0104 states is not what `occasion:` asks.
--    Every affected row already carries `contains:health` and `venue:pharmacy`,
--    so the evidence for the correct value is on the row itself.
--
-- 2. Bunnings is a hardware store, and `venue:homewares` is defined as a shop
--    selling furnishings and decor. The axis needs the value it was missing
--    rather than a broader gloss on the one it had: widening `homewares` to
--    cover building supplies would put a timber run and a cushion in the same
--    bucket, and `venue:` exists to keep those apart.
--
-- `usage_count` is corrected alongside every move. The counter is what ranks the
-- categorizer prompt, so a move that leaves it stale would keep offering the
-- wrong value first - which is half of how `occasion:home` grew in the first
-- place. Each adjustment counts the rows it is about to change, so a re-run
-- counts zero.
--
-- Idempotent throughout: every statement re-derives its set from the current
-- tags, and each append is guarded by the value not already being present.
-- REQUIRED before running against a real database: take a snapshot first
-- (finance-audit remediation policy). Rollback = restore the snapshot.

-- 1. Both values this migration writes must exist in the vocabulary before it
-- writes them.
--
-- `venue:hardware` is new everywhere. `occasion:health` is subtler and is the
-- reason this statement is not just about hardware: it exists in the live
-- database, minted after the seed, but a database built from the migration
-- chain alone does not hold it. Appending it to a row without this would put a
-- tag on a transaction that the closed set does not contain — which is the
-- exact inconsistency POPS-2606 removed, and the value would then be dropped
-- from every prompt built afterwards. `OR IGNORE` so the live row, with its
-- real `usage_count`, is left exactly as it is.
INSERT OR IGNORE INTO `tag_vocabulary` (`tag`, `facet`, `kind`, `source`, `is_active`, `usage_count`, `description`)
VALUES ('venue:hardware', 'venue', 'closed', 'seed', 1, 0, 'A hardware, tool or building-supplies store.');
--> statement-breakpoint
INSERT OR IGNORE INTO `tag_vocabulary` (`tag`, `facet`, `kind`, `source`, `is_active`, `usage_count`, `description`)
VALUES ('occasion:health', 'occasion', 'closed', 'seed', 1, 0, 'Spent on health: a pharmacy, a doctor or dentist, medicines, supplements, treatment.');
--> statement-breakpoint

-- 2. Move the usage counts before the rows move, while the rows still say what
-- they are being counted from.
UPDATE `tag_vocabulary`
SET `usage_count` = `usage_count` + (
	SELECT COUNT(*) FROM `transactions` t
	 WHERE t.`description` LIKE 'BUNNINGS%'
	   AND EXISTS (SELECT 1 FROM json_each(t.`tags`) je WHERE je.value = 'venue:homewares')
)
WHERE `tag` = 'venue:hardware';
--> statement-breakpoint
UPDATE `tag_vocabulary`
SET `usage_count` = max(0, `usage_count` - (
	SELECT COUNT(*) FROM `transactions` t
	 WHERE t.`description` LIKE 'BUNNINGS%'
	   AND EXISTS (SELECT 1 FROM json_each(t.`tags`) je WHERE je.value = 'venue:homewares')
))
WHERE `tag` = 'venue:homewares';
--> statement-breakpoint
UPDATE `tag_vocabulary`
SET `usage_count` = `usage_count` + (
	SELECT COUNT(*) FROM `transactions` t
	 WHERE EXISTS (SELECT 1 FROM json_each(t.`tags`) je WHERE je.value = 'venue:pharmacy')
	   AND EXISTS (SELECT 1 FROM json_each(t.`tags`) je WHERE je.value = 'occasion:home')
)
WHERE `tag` = 'occasion:health';
--> statement-breakpoint
UPDATE `tag_vocabulary`
SET `usage_count` = max(0, `usage_count` - (
	SELECT COUNT(*) FROM `transactions` t
	 WHERE EXISTS (SELECT 1 FROM json_each(t.`tags`) je WHERE je.value = 'venue:pharmacy')
	   AND EXISTS (SELECT 1 FROM json_each(t.`tags`) je WHERE je.value = 'occasion:home')
))
WHERE `tag` = 'occasion:home';
--> statement-breakpoint

-- 3. A pharmacy row's occasion is health. Strip, then append - the two halves
-- are separate statements so the append can be guarded independently, which is
-- what makes a second run add nothing.
UPDATE `transactions`
SET `tags` = json_insert(`tags`, '$[#]', 'occasion:health')
WHERE EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'venue:pharmacy')
  AND EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'occasion:home')
  AND NOT EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'occasion:health');
--> statement-breakpoint
UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
	 WHERE je.value <> 'occasion:home'
)
WHERE EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'venue:pharmacy')
  AND EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'occasion:home');
--> statement-breakpoint

-- 4. The same correction on the rules that assert it, so the next import does
-- not put it straight back. Both rule tables carry a tag set of their own.
UPDATE `transaction_tag_rules`
SET `tags` = json_insert(`tags`, '$[#]', 'occasion:health')
WHERE `description_pattern` LIKE '%PHARMACY%'
  AND EXISTS (SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'occasion:home')
  AND NOT EXISTS (SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'occasion:health');
--> statement-breakpoint
UPDATE `transaction_tag_rules`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_tag_rules`.`tags`) je
	 WHERE je.value <> 'occasion:home'
)
WHERE `description_pattern` LIKE '%PHARMACY%'
  AND EXISTS (SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'occasion:home');
--> statement-breakpoint
UPDATE `transaction_corrections`
SET `tags` = json_insert(`tags`, '$[#]', 'occasion:health')
WHERE `description_pattern` LIKE '%PHARMACY%'
  AND EXISTS (SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'occasion:home')
  AND NOT EXISTS (SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'occasion:health');
--> statement-breakpoint
UPDATE `transaction_corrections`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_corrections`.`tags`) je
	 WHERE je.value <> 'occasion:home'
)
WHERE `description_pattern` LIKE '%PHARMACY%'
  AND EXISTS (SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'occasion:home');
--> statement-breakpoint

-- 5. Bunnings is hardware, not homewares - rows first, then both rule tables.
-- `transaction_corrections` carries a tag set of its own exactly as it does in
-- section 4, and leaving it out here would keep the reintroduction vector open
-- for this one merchant.
UPDATE `transactions`
SET `tags` = json_insert(`tags`, '$[#]', 'venue:hardware')
WHERE `description` LIKE 'BUNNINGS%'
  AND EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'venue:homewares')
  AND NOT EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'venue:hardware');
--> statement-breakpoint
UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
	 WHERE je.value <> 'venue:homewares'
)
WHERE `description` LIKE 'BUNNINGS%'
  AND EXISTS (SELECT 1 FROM json_each(`transactions`.`tags`) je WHERE je.value = 'venue:homewares');
--> statement-breakpoint
UPDATE `transaction_tag_rules`
SET `tags` = json_insert(`tags`, '$[#]', 'venue:hardware')
WHERE `description_pattern` LIKE 'BUNNINGS%'
  AND EXISTS (SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'venue:homewares')
  AND NOT EXISTS (SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'venue:hardware');
--> statement-breakpoint
UPDATE `transaction_tag_rules`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_tag_rules`.`tags`) je
	 WHERE je.value <> 'venue:homewares'
)
WHERE `description_pattern` LIKE 'BUNNINGS%'
  AND EXISTS (SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je WHERE je.value = 'venue:homewares');
--> statement-breakpoint
UPDATE `transaction_corrections`
SET `tags` = json_insert(`tags`, '$[#]', 'venue:hardware')
WHERE `description_pattern` LIKE 'BUNNINGS%'
  AND EXISTS (SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'venue:homewares')
  AND NOT EXISTS (SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'venue:hardware');
--> statement-breakpoint
UPDATE `transaction_corrections`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_corrections`.`tags`) je
	 WHERE je.value <> 'venue:homewares'
)
WHERE `description_pattern` LIKE 'BUNNINGS%'
  AND EXISTS (SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je WHERE je.value = 'venue:homewares');
