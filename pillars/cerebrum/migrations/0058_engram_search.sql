CREATE TABLE `engram_search_docs` (
	`docid` integer PRIMARY KEY NOT NULL,
	`engram_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`body_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_engram_search_docs_engram_id` ON `engram_search_docs` (`engram_id`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `engram_fts` USING fts5(
	title,
	body,
	content='engram_search_docs',
	content_rowid='docid',
	tokenize='porter unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `engram_search_docs_ai` AFTER INSERT ON `engram_search_docs` BEGIN
	INSERT INTO engram_fts(rowid, title, body) VALUES (new.docid, new.title, new.body);
END;
--> statement-breakpoint
CREATE TRIGGER `engram_search_docs_ad` AFTER DELETE ON `engram_search_docs` BEGIN
	INSERT INTO engram_fts(engram_fts, rowid, title, body) VALUES ('delete', old.docid, old.title, old.body);
END;
--> statement-breakpoint
CREATE TRIGGER `engram_search_docs_au` AFTER UPDATE ON `engram_search_docs` BEGIN
	INSERT INTO engram_fts(engram_fts, rowid, title, body) VALUES ('delete', old.docid, old.title, old.body);
	INSERT INTO engram_fts(rowid, title, body) VALUES (new.docid, new.title, new.body);
END;
