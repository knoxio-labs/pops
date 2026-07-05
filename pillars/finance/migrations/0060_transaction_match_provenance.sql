-- CF057 (#3658): persist match provenance on committed transactions so a
-- row's entity assignment can be audited after the fact — which of the
-- entity-matcher's stages (alias/exact/prefix/contains), a learned
-- correction rule, the AI fallback, a manual reassignment, or none (e.g. a
-- transfer) produced it, at what confidence, and (for a learned-correction
-- match) which rule won.
--
-- All three columns are nullable: historical rows committed before this
-- change carry no provenance, and only `learned`/`ai` matches ever populate
-- `match_confidence`, and only `learned` matches populate `match_rule_id`.

ALTER TABLE `transactions` ADD COLUMN `match_type` text;
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `match_rule_id` text;
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `match_confidence` real;
