-- POPS-2690: separate a dead-letter that a redeploy can fix from one it cannot.
--
-- The reconciler now requeues dead-lettered rows at boot, on the reasoning that
-- a restart IS the operator attention a dead-letter asks for. That is true of
-- the failures that produced the 44 dead rows in production (a missing
-- service-account key, a contacts outage) and false of a `ContactsPermanentError`
-- — a 400, a contract mismatch, a refusal — which retrying has never fixed and
-- never will. Without this column the boot requeue would re-attempt such a row
-- `maxAttempts` times on every deploy, forever.
--
-- The reason is recorded rather than inferred: `last_error` holds prose, and
-- branching on prose is how a message reword silently changes behaviour.
--
-- Existing rows default to 0 (requeueable), which is correct for the only rows
-- that exist: all 44 dead-lettered with `no-credential`.

ALTER TABLE `entity_precreate_outbox` ADD COLUMN `permanent_failure` integer NOT NULL DEFAULT 0;
