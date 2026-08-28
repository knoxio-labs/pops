-- POPS-2607: the last of the stored single-facet cardinality violations.
--
-- POPS-2606 made `venue`, `occasion` and `channel` single-valued on the write
-- path only, deliberately leaving the rows already stored for this ticket — a
-- migration-time constraint would have refused to open the database until they
-- were fixed. 0075 removed two of them by merging `venue:bar` into `venue:pub`.
-- These are the rest.
--
-- They are keyed on the descriptor, not on the tag combination, because the
-- combination does not decide them. `venue:takeaway` + `venue:restaurant` sits
-- on both `OZTURK JR` and `PHO MOM` and resolves the opposite way on each: one
-- is a counter you order a kebab at, the other is a place you sit down in that
-- also does takeaway. That is a fact about the merchant, so it is written down
-- per merchant rather than derived.
--
-- Each pattern is matched against the transaction descriptor AND the tag rule's
-- own pattern, since every one of these rows has a rule that produced it — leave
-- the rule and the next re-evaluation writes the second venue straight back.
--
-- The calls, and the reasoning POPS-2606 set out (the axis answers "how much at
-- bars and pubs versus restaurants", so a row in two buckets is double-counted,
-- and a meal at a gastropub is one venue plus a `contains:`):
--
--   FAT COW HUNTER VALLEY  drop `occasion:out`, keep `occasion:travel`
--       `trip:` is open, so travel cannot be derived from it and must stay
--       asserted; "eating out" survives as `venue:` + `contains:food`.
--   LUCKY CAT              drop `venue:pub`, keep `venue:restaurant`
--       (`venue:bar` before 0075). The bar half is already said by
--       `contains:alcohol` — the gastropub case verbatim.
--   PHO MOM                drop `venue:takeaway`, keep `venue:restaurant`
--   WWW.FISHBO*            drop `venue:restaurant`, keep `venue:takeaway`
--   OZTURK JR              drop `venue:restaurant`, keep `venue:takeaway`
--       ...and drop `contains:food`, which `contains:fast-food` already implies.
--
-- Idempotent: each statement deletes a value from a set, so a second run finds
-- nothing to delete. REQUIRED before running against a real database: take a
-- snapshot first (finance-audit remediation policy). Rollback = restore the
-- snapshot.

CREATE TEMP TABLE _venue_resolution (
	pattern text NOT NULL,
	drop_tag text NOT NULL
);
--> statement-breakpoint
INSERT INTO _venue_resolution (pattern, drop_tag) VALUES
	('FAT COW', 'occasion:out'),
	('LUCKY CAT', 'venue:pub'),
	('LUCKY CAT', 'venue:bar'),
	('PHO MOM', 'venue:takeaway'),
	('FISHBO', 'venue:restaurant'),
	('OZTURK', 'venue:restaurant'),
	('OZTURK', 'contains:food');
--> statement-breakpoint
UPDATE `transactions`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transactions`.`tags`) je
	 WHERE je.value NOT IN (
		SELECT r.drop_tag FROM _venue_resolution r
		 WHERE UPPER(`transactions`.`description`) LIKE '%' || r.pattern || '%'
	 )
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`transactions`.`tags`) je
	  JOIN _venue_resolution r ON r.drop_tag = je.value
	 WHERE UPPER(`transactions`.`description`) LIKE '%' || r.pattern || '%'
);
--> statement-breakpoint
UPDATE `transaction_tag_rules`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_tag_rules`.`tags`) je
	 WHERE je.value NOT IN (
		SELECT r.drop_tag FROM _venue_resolution r
		 WHERE UPPER(`transaction_tag_rules`.`description_pattern`) LIKE '%' || r.pattern || '%'
	 )
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`transaction_tag_rules`.`tags`) je
	  JOIN _venue_resolution r ON r.drop_tag = je.value
	 WHERE UPPER(`transaction_tag_rules`.`description_pattern`) LIKE '%' || r.pattern || '%'
);
--> statement-breakpoint
UPDATE `transaction_corrections`
SET `tags` = (
	SELECT json_group_array(je.value) FROM json_each(`transaction_corrections`.`tags`) je
	 WHERE je.value NOT IN (
		SELECT r.drop_tag FROM _venue_resolution r
		 WHERE UPPER(`transaction_corrections`.`description_pattern`) LIKE '%' || r.pattern || '%'
	 )
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`transaction_corrections`.`tags`) je
	  JOIN _venue_resolution r ON r.drop_tag = je.value
	 WHERE UPPER(`transaction_corrections`.`description_pattern`) LIKE '%' || r.pattern || '%'
);
--> statement-breakpoint
DROP TABLE _venue_resolution;
