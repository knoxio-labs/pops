-- POPS-2771. Enforces "one `person` account per contact per currency" at the
-- database level.
--
-- A plain UNIQUE index, not a partial one: SQLite's UNIQUE constraint treats
-- every NULL as distinct from every other NULL, so this index never rejects
-- two non-`person` accounts (which always carry `entity_id = null`) nor two
-- different `person` accounts that are both transiently `entity_id = null`
-- while pending resolution in `entity_precreate_outbox` (see
-- `db/services/entity-precreate-outbox.ts` and
-- `api/cron/reconcile-contacts-outbox.ts`). It only ever fires once both
-- sides of a pending pair resolve to the SAME real contact + currency, which
-- is exactly the case the ticket wants rejected — a second person account
-- for a contact already tracked in that currency.
--
-- Adds `entity_precreate_outbox.account_id`, the second thing an outbox row
-- can be waiting on. A `transactions`/`transaction_corrections`/
-- `transaction_tag_rules` row is discriminated by matching its `entity_id`
-- against a `pending:contact:{uuid}` placeholder written by
-- `preCreatePendingContacts`; a `person` account instead keeps `entity_id`
-- genuinely NULL while pending (so the uniqueness reasoning above holds), so
-- the outbox row itself carries the account id to fill in once contacts
-- resolves the name.

CREATE UNIQUE INDEX `idx_accounts_entity_currency` ON `accounts` (`entity_id`, `currency`);
--> statement-breakpoint
ALTER TABLE `entity_precreate_outbox` ADD COLUMN `account_id` text;
