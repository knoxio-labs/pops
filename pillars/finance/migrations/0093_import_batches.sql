-- POPS-2916 / ADR-052. Imports are recorded per account.
--
-- Two tables and one column. Before this migration the only provenance an
-- import left behind was `import_commits.commit_key`, which names a click,
-- not an account, and the only "when was this account last fed" the pillar
-- could answer was a ledger-wide `MAX(transactions.last_edited_time)` on
-- `GET /health`. Neither can say that ANZ is a month behind while Amex is
-- current, which is the question this epic exists for.
--
-- `account_import_config` is one row per account saying HOW it is fed: a CSV
-- dialect, a statement parser, or an API provider with the provider's own
-- account id and the NAME of the secret holding its token. It is a separate
-- table, not columns on `accounts`, because ADR-050 made `kind` a
-- discriminator and nothing more; how transactions reach an account changes
-- for different reasons than what the account is. The token itself never
-- lands here — it is read from `<secret_ref>_FILE` or the environment at sync
-- time, exactly as `UP_WEBHOOK_SECRET_FILE` already is.
--
-- `import_batches` is one row per (account, commit): what was read, from
-- where, how many rows landed and the dates they span. The grain is the
-- account, not the commit, because a commit spans accounts once a row is
-- retargeted in review. Rows are append-only. `row_count` may be zero — an
-- API sync that found nothing is still a fact about the account having been
-- checked. `commit_key` is deliberately NOT a foreign key onto
-- `import_commits`: that row is recorded last in the commit transaction, after
-- every batch, so a constraint here would fire on every commit. Nor is
-- (account_id, commit_key) unique: a commit that spanned two accounts later
-- merged into one leaves the survivor two batches under one key, and that is
-- the truth of what happened. The commit's own replay guard is what stops a
-- repeated key writing a second batch.
--
-- There is NO backfill from `import_commits`. Nothing links a pre-existing
-- transaction to the commit that wrote it, so a batch minted from that table
-- would have to invent an account and a span. History imported before this
-- migration has no batch, and readers say so rather than guess.
--
-- `transactions.import_batch_id` is the forward link a statement document
-- (POPS-2752) will need to trace a row to the file it came from. Nullable and
-- unindexed-by-value for existing rows; set by the commit for every row it
-- writes from here on. `ALTER TABLE ... ADD COLUMN` is enough — no rebuild —
-- because SQLite admits a nullable column with no default in place.
--
-- Both `account_id` foreign keys cascade on delete, like `account_checkpoints`
-- and for the same reason: the merge path repoints these rows before it
-- deletes the source account, and the cascade is the backstop for a delete
-- arriving any other way.

CREATE TABLE `account_import_config` (
	`account_id` text PRIMARY KEY NOT NULL,
	`source_kind` text NOT NULL,
	`dialect_id` text,
	`parser_id` text,
	`provider` text,
	`external_account_ref` text,
	`expected_cadence_days` integer,
	`secret_ref` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_ref` text,
	`parser_version` text,
	`commit_key` text,
	`row_count` integer NOT NULL,
	`date_from` text,
	`date_to` text,
	`checkpoint_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`checkpoint_id`) REFERENCES `account_checkpoints`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
-- Every read is "this account's batches, newest first".
CREATE INDEX `idx_import_batches_account_created` ON `import_batches` (`account_id`,`created_at`);
--> statement-breakpoint
-- "Which batches did this click write" — the join back from a commit that
-- the statement epic (POPS-2752) will make.
CREATE INDEX `idx_import_batches_commit_key` ON `import_batches` (`commit_key`);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `import_batch_id` text REFERENCES import_batches(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX `idx_transactions_import_batch` ON `transactions` (`import_batch_id`);
