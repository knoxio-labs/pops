ALTER TABLE `catalogue_revisions` ADD COLUMN `draft_version` integer DEFAULT 1 NOT NULL CONSTRAINT `ck_catalogue_revisions_draft_version` CHECK(`draft_version` >= 1);
