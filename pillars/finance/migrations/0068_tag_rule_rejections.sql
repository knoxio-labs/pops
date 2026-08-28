-- POPS-2598 stage 1. `POST /tag-rules/reject` used to answer with a
-- "follow-up proposal" rebuilt from the same signal — byte-identical to the
-- proposal just refused — while the feedback the user was required to write
-- went nowhere. The follow-up is gone; the feedback now lands here.
--
-- A rejection is signal even with no revision engine behind it: this table is
-- what a future proposer consults before re-proposing a pattern that was
-- already turned down, and what POPS-254 reads to see what was refused and
-- why. `description_pattern` / `match_type` are denormalized out of the
-- ChangeSet's `add` op and are NULL for a rejection of an edit/disable/remove
-- ChangeSet, which has no pattern of its own — `change_set` always holds the
-- verbatim refused ChangeSet.

CREATE TABLE `tag_rule_rejections` (
	`id` text PRIMARY KEY NOT NULL,
	`description_pattern` text,
	`match_type` text,
	`entity_id` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`feedback` text NOT NULL,
	`change_set` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tag_rule_rejections_pattern` ON `tag_rule_rejections` (`description_pattern`);
--> statement-breakpoint
CREATE INDEX `idx_tag_rule_rejections_created_at` ON `tag_rule_rejections` (`created_at`);
