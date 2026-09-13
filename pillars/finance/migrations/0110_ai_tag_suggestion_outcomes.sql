-- POPS-3677: record what the model suggested beside what was committed.
--
-- `@pops/ai-telemetry` stamps every categorizer call with a `promptVersion`, but
-- nothing recorded what a call's tags turned into. A version that cannot be
-- joined to an outcome measures spend, not quality, so a prompt revision had no
-- way to show it helped.
--
-- One row per committed transaction that carried at least one AI suggestion.
-- Both sides are stored as JSON arrays in `facet:value` form: the suggestion as
-- the AI passes produced it, the committed set as the person accepted it.
CREATE TABLE `ai_tag_suggestion_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL REFERENCES `transactions`(`id`) ON DELETE CASCADE,
	`prompt_version` text NOT NULL,
	`suggested_tags` text NOT NULL,
	`committed_tags` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_tag_suggestion_outcomes_prompt_version` ON `ai_tag_suggestion_outcomes` (`prompt_version`);
--> statement-breakpoint
CREATE INDEX `idx_ai_tag_suggestion_outcomes_transaction` ON `ai_tag_suggestion_outcomes` (`transaction_id`);
