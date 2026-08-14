-- Media pillar baseline for the comparisons cluster (Theme-13 Wave-5 cascade
-- per PR #3191's MEDIA exit audit, closing the last unfinished per-table PR4
-- cluster after #3212's media_scores + rotation_* slice). Mirrors the shared
-- `pops.db` shape from the drizzle-migrations ancestry:
--   `0002_magical_kid_colt`      — comparison_dimensions + comparisons baseline,
--   `0009_red_quasimodo`         — ALTER comparison_dimensions ADD weight,
--   `0013_worthless_speed`       — ALTER comparisons ADD draw_tier,
--   `0016_certain_namor`         — comparison_skip_cooloffs baseline,
--   `0022_elo_deltas`            — ALTER comparisons ADD delta_a, delta_b,
--   `0023_kind_james_howlett`    — ALTER comparisons ADD source.
--
-- FK restoration: PR #3212 dropped the cross-pillar
-- `media_scores.dimension_id -> comparison_dimensions(id)` FK because the
-- dimensions table still lived on the shared `pops.db` and SQLite FKs cannot
-- cross ATTACH-ed databases. Both tables now live in media-db so the FK is
-- restored as an intra-pillar constraint via a `__new_media_scores` rebuild,
-- mirroring drizzle's standard ALTER TABLE pattern for SQLite.
--
-- By the time this migration runs, `media_scores` already lives in
-- media-db — the monolith and its shared-`pops.db` ATTACH bridge were
-- removed by the lake migration that collapsed the tRPC monolith into
-- per-pillar REST services, so there is no separate backfill step here.
--
-- `comparison_dimensions` is created empty by this same file, so any
-- database that already has `media_scores` rows has `dimension_id` values
-- with no matching `comparison_dimensions` row yet. Drizzle wraps a whole
-- migration file in one transaction, so `PRAGMA foreign_keys=OFF` here is a
-- no-op (SQLite ignores it once a transaction is open) and the FK-enforced
-- `INSERT INTO __new_media_scores ... SELECT ... FROM media_scores` below
-- would throw for every such row. Placeholder dimension rows are backfilled
-- for every distinct pre-existing `dimension_id` before that insert runs, so
-- the FK holds with enforcement on the whole time — the same ordering
-- discipline `0057_drop_entities_mirror.sql` (finance) uses to rebuild a
-- table correctly instead of relying on the pragma. There is no real name to
-- recover for these ids, so the placeholders are inserted inactive
-- (`active = 0`) with a synthetic `dimension-<id>` name — they exist only to
-- satisfy the FK on the orphaned score rows and must never be mistaken for
-- curated dimensions. `seedDefaultDimensions` (pillars/media/src/db/services/
-- comparisons/dimensions.ts) seeds the five real defaults by name, not by
-- row count, so an inactive placeholder here can never suppress that seed.

CREATE TABLE `comparison_dimensions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`active` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_comparison_dimensions_name` ON `comparison_dimensions` (`name`);--> statement-breakpoint
CREATE TABLE `comparisons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dimension_id` integer NOT NULL,
	`media_a_type` text NOT NULL,
	`media_a_id` integer NOT NULL,
	`media_b_type` text NOT NULL,
	`media_b_id` integer NOT NULL,
	`winner_type` text NOT NULL,
	`winner_id` integer NOT NULL,
	`draw_tier` text,
	`source` text,
	`delta_a` integer,
	`delta_b` integer,
	`compared_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`dimension_id`) REFERENCES `comparison_dimensions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_comparisons_dimension_id` ON `comparisons` (`dimension_id`);--> statement-breakpoint
CREATE INDEX `idx_comparisons_media_a` ON `comparisons` (`media_a_type`,`media_a_id`);--> statement-breakpoint
CREATE INDEX `idx_comparisons_media_b` ON `comparisons` (`media_b_type`,`media_b_id`);--> statement-breakpoint
CREATE TABLE `comparison_skip_cooloffs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dimension_id` integer NOT NULL,
	`media_a_type` text NOT NULL,
	`media_a_id` integer NOT NULL,
	`media_b_type` text NOT NULL,
	`media_b_id` integer NOT NULL,
	`skip_until` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`dimension_id`) REFERENCES `comparison_dimensions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_comparison_skip_cooloffs_pair` ON `comparison_skip_cooloffs` (`dimension_id`,`media_a_type`,`media_a_id`,`media_b_type`,`media_b_id`);--> statement-breakpoint
INSERT INTO `comparison_dimensions` (`id`, `name`, `active`) SELECT DISTINCT `dimension_id`, 'dimension-' || `dimension_id`, 0 FROM `media_scores`;--> statement-breakpoint
CREATE TABLE `__new_media_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_type` text NOT NULL,
	`media_id` integer NOT NULL,
	`dimension_id` integer NOT NULL,
	`score` real DEFAULT 1500 NOT NULL,
	`comparison_count` integer DEFAULT 0 NOT NULL,
	`excluded` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`dimension_id`) REFERENCES `comparison_dimensions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_media_scores`("id", "media_type", "media_id", "dimension_id", "score", "comparison_count", "excluded", "updated_at") SELECT "id", "media_type", "media_id", "dimension_id", "score", "comparison_count", "excluded", "updated_at" FROM `media_scores`;--> statement-breakpoint
DROP TABLE `media_scores`;--> statement-breakpoint
ALTER TABLE `__new_media_scores` RENAME TO `media_scores`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_media_scores_unique` ON `media_scores` (`media_type`,`media_id`,`dimension_id`);--> statement-breakpoint
CREATE INDEX `idx_media_scores_dimension` ON `media_scores` (`dimension_id`);
