-- POPS-3680: add fee:account-keeping to the closed vocabulary.
--
-- A bank's periodic account-keeping fee has no home in the closed `fee`
-- facet today. `fee:membership` reads as the obvious guess and is wrong:
-- that value names a card or subscription membership fee, not a bank
-- charging for not meeting a minimum-deposit condition on the account
-- itself.
--
-- `source` is `seed`, matching 0112's `venue:gym`: both values are minted by
-- the migration chain itself rather than carried forward from a real
-- transaction or a human decision on the live database, and 0106 already
-- settled what skipping either side costs — "a closed facet that only
-- exists in one database is not closed". Inserted on both the live database
-- and every database this migration chain builds.
--
-- REQUIRED before running against a real database: take a snapshot first
-- (finance-audit remediation policy). Rollback = restore the snapshot.
--
-- Idempotent: `OR IGNORE` on the `tag` primary key, so a second run inserts
-- nothing.

INSERT OR IGNORE INTO `tag_vocabulary` (`tag`, `facet`, `kind`, `source`, `is_active`, `usage_count`, `description`) VALUES
  ('fee:account-keeping', 'fee', 'closed', 'seed', 1, 0, 'A bank''s periodic account-keeping or servicing fee, e.g. for not meeting a minimum-deposit condition. Not fee:membership, a card or subscription membership fee.');
