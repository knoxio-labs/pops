-- Migration: 20260326120000_transactions_entity_fk.sql
-- Domain: core
-- Description: Add ON DELETE SET NULL foreign key constraint on
--   transactions.entity_id → entities(id). SQLite cannot add FK
--   constraints to existing columns, so this uses the rename-and-copy
--   pattern.
--
-- What it changes:
--   - Recreates transactions table with FK constraint on entity_id
--   - Nullifies any orphaned entity_id references before applying
--
-- Rollback (manual):
--   -- Recreate transactions without FK constraint using the same
--   -- rename-and-copy pattern.

-- Null out orphaned references so the FK constraint won't fail
UPDATE transactions SET entity_id = NULL
  WHERE entity_id IS NOT NULL
    AND entity_id NOT IN (SELECT id FROM entities);

-- Rename existing table
ALTER TABLE transactions RENAME TO _transactions_old;

-- Create new table with FK constraint
CREATE TABLE transactions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  notion_id TEXT UNIQUE,
  description TEXT NOT NULL,
  account TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
  entity_name TEXT,
  location TEXT,
  country TEXT,
  related_transaction_id TEXT,
  notes TEXT,
  checksum TEXT,
  raw_row TEXT,
  last_edited_time TEXT NOT NULL
);

-- Copy data
INSERT INTO transactions
  SELECT * FROM _transactions_old;

-- Drop old table
DROP TABLE _transactions_old;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account);
CREATE INDEX IF NOT EXISTS idx_transactions_entity ON transactions(entity_id);
CREATE INDEX IF NOT EXISTS idx_transactions_last_edited ON transactions(last_edited_time);
CREATE INDEX IF NOT EXISTS idx_transactions_notion_id ON transactions(notion_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_checksum ON transactions(checksum);
