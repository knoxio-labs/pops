-- Issue #3683 (ADR-039 pillar isolation, workstream 4): the import commit's
-- entity pre-create write path used to hard-fail the whole commit when the
-- contacts pillar was briefly unavailable — asymmetric with the read side,
-- which already degrades gracefully. `entity_precreate_outbox` lets the
-- commit persist a `pending:contact:{uuid}` placeholder in `entity_id`
-- columns instead, and a background reconciler resolves each row against
-- contacts once it recovers, rewriting the placeholder to the real contact id
-- everywhere it was written.

CREATE TABLE `entity_precreate_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` text,
	`last_error` text,
	`resolved_entity_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_entity_precreate_outbox_status` ON `entity_precreate_outbox` (`status`);
