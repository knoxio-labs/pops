-- Add claude-sonnet-4-6 pricing entry for existing databases (issue #2440).
-- Uses INSERT OR IGNORE so it is safe to run against databases that already
-- have the entry (e.g. freshly initialised databases seeded from schema.ts).
INSERT OR IGNORE INTO `ai_model_pricing`
  (`provider_id`, `model_id`, `display_name`, `input_cost_per_mtok`, `output_cost_per_mtok`, `context_window`, `is_default`, `created_at`, `updated_at`)
VALUES
  ('claude', 'claude-sonnet-4-6', 'Claude Sonnet 4.6', 3.0, 15.0, 200000, 0, datetime('now'), datetime('now'));
