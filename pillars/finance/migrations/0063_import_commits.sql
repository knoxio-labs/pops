-- Issues #3640/#3642 (finance-audit remediation, epic #3606): `commitImport`
-- accepts an optional client-generated `commitKey` scoped to a single
-- "Approve & Commit All" click. This table records the result of the first
-- call under a given key so a resubmit (client retry, double-click racing
-- the in-flight guard) replays the recorded result instead of re-applying
-- every ChangeSet/transaction in the payload a second time.

CREATE TABLE `import_commits` (
	`commit_key` text PRIMARY KEY NOT NULL,
	`result` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
