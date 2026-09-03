-- POPS-2803. Design review on POPS-2765 rejected `accounts.institution` as
-- nullable free text: the account chip decided on POPS-2766 identifies an
-- account by its institution's logo, falling back to initials on the
-- institution's brand colour, and neither works against a free-text column —
-- "ANZ", "anz" and "A.N.Z." would be three institutions with three different
-- marks.
--
-- `institutions` is the picked-with-create replacement — `accounts.institution`
-- becomes a nullable `institution_id` FK onto this table in POPS-2767, not a
-- checked string. `name` is unique case-insensitively (`COLLATE NOCASE`, same
-- device contacts' `entities.name` index uses) so the DB itself rejects a
-- case-variant duplicate. `colour` is required — it is the hex used for the
-- initials fallback when there is no logo, unlike `logo_asset_id`, which is
-- genuinely optional: the upload flow that populates it is POPS-2804, not yet
-- built.
--
-- No rows are seeded here. The two live account strings ("Amex", "ANZ") are
-- backfilled into this table by POPS-2767, once `accounts` exists for that
-- migration to link the FK against.

CREATE TABLE `institutions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`colour` text NOT NULL,
	`logo_asset_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_institutions_name_nocase` ON `institutions` (`name` COLLATE NOCASE);
