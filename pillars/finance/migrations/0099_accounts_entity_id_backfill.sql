-- POPS-3063. Retarget `accounts.institutionId` reads/writes onto
-- `accounts.entityId`. Two things land in this one migration, in this
-- order, because the second is unsafe without the first:
--
-- 1. `idx_accounts_entity_currency` (0085) was a blanket UNIQUE index on
--    (entity_id, currency) — correct while `entity_id` was `person`-account
--    only (one receivable/payable ledger per contact per currency). Now that
--    `entity_id` also carries a `bank`-typed issuer for ordinary accounts,
--    a blanket unique index would reject two ordinary accounts that share an
--    issuer and currency (an AUD checking and an AUD savings account both at
--    the same migrated bank) — completely normal, and exactly what the
--    backfill below would hit on the first institution with more than one
--    account in the same currency. Repointed to a partial index scoped to
--    `kind = 'person'` so it enforces exactly what it always meant to and
--    nothing more (see `db/schema/accounts.ts`).
-- 2. Backfill: for every account whose institution has already been
--    migrated to a contacts Entity (POPS-3062's `institutions.migratedEntityId`),
--    point its own `entity_id` at that Entity directly so future reads go
--    through `entity_id` without the institution-lookup indirection. An
--    account whose institution has NOT migrated yet (POPS-3099) is left
--    with `entity_id = NULL` and keeps resolving through the
--    `institution_id` fallback at read time (`account-entity-display.ts`)
--    until that migration runs. Idempotent: re-running only ever touches
--    rows still `entity_id IS NULL`.

DROP INDEX `idx_accounts_entity_currency`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_accounts_entity_currency` ON `accounts` (`entity_id`, `currency`) WHERE `kind` = 'person';
--> statement-breakpoint
UPDATE `accounts`
SET `entity_id` = (
  SELECT `migrated_entity_id` FROM `institutions` WHERE `institutions`.`id` = `accounts`.`institution_id`
)
WHERE `accounts`.`entity_id` IS NULL
  AND `accounts`.`institution_id` IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM `institutions`
    WHERE `institutions`.`id` = `accounts`.`institution_id`
    AND `institutions`.`migrated_entity_id` IS NOT NULL
  );
