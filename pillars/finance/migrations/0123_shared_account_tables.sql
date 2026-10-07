-- POPS-5863 (epic POPS-5827). The three tables shared accounts write to.
-- Schema only: no row is written here, so no existing account gains a grant.
--
-- `account_grants`: one row gives one email `view` or `edit` on one account.
-- `email` is stored lower-cased and the CHECK refuses anything else, so the
-- unique index cannot hold two spellings of one address. The cascade is
-- deliberate: merging accounts deletes the source row and its grants go with
-- it, because access to the surviving account needs a grant of its own.
CREATE TABLE `account_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`account_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `account_grants_role_check` CHECK (`role` IN ('view', 'edit')),
	CONSTRAINT `account_grants_email_lowercase_check` CHECK (`email` = lower(`email`))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_grants_email_account` ON `account_grants` (`email`,`account_id`);
--> statement-breakpoint
-- `transaction_events`: the audit log. Neither `transaction_id` nor
-- `account_id` is a foreign key, because an event has to outlive the row it
-- describes: a deleted transaction is restored from its `before` snapshot,
-- and a merged-away account still has a history.
CREATE TABLE `transaction_events` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`account_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_email` text,
	`at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`before` text,
	`after` text,
	CONSTRAINT `transaction_events_action_check` CHECK (`action` IN ('create', 'update', 'delete', 'restore', 'attach', 'detach')),
	CONSTRAINT `transaction_events_actor_kind_check` CHECK (`actor_kind` IN ('operator', 'guest', 'service', 'system'))
);
--> statement-breakpoint
CREATE INDEX `idx_transaction_events_transaction_at` ON `transaction_events` (`transaction_id`,`at`);
--> statement-breakpoint
CREATE INDEX `idx_transaction_events_account_at` ON `transaction_events` (`account_id`,`at`);
--> statement-breakpoint
-- `transaction_attachments`: a link from a transaction to a file held by the
-- purchases receipt store. Finance holds the reference, never the bytes, so a
-- link whose transaction is gone has nothing left to describe and cascades.
CREATE TABLE `transaction_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`document_uri` text NOT NULL,
	`media_type` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transaction_attachments_transaction_document` ON `transaction_attachments` (`transaction_id`,`document_uri`);
