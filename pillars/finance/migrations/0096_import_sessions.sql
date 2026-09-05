-- POPS-2449: import sessions survive a pillar restart.
--
-- The processing session the wizard polls lived in a process-local Map with
-- a five-minute idle TTL, so a deploy, an OOM or a Watchtower roll mid-import
-- destroyed every in-flight session and the client fell back to re-posting
-- the whole batch and paying the entity-matching and AI passes a second time.
--
-- The session is transient data — a handle the wizard polls, never ledger
-- history — so it is a table with an explicit expiry and a sweep, not a
-- permanent record. `payload` is the whole progress object as JSON (the same
-- shape `GET /imports/progress` serves), because the pillar reads it back as
-- one unit and never queries inside it. `status` is duplicated out of the
-- payload so the boot pass can find sessions a restart interrupted without
-- parsing every row.

CREATE TABLE `import_sessions` (
  `session_id` text PRIMARY KEY NOT NULL,
  `status` text NOT NULL,
  `payload` text NOT NULL,
  `started_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_import_sessions_expires_at` ON `import_sessions` (`expires_at`);
