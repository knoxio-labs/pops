INSERT INTO ai_model_pricing
  (provider_id, model_id, input_cost_per_mtok, output_cost_per_mtok, created_at, updated_at)
VALUES
  ('anthropic', 'claude-haiku-4-5', 1, 5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('anthropic', 'claude-haiku-4-5-20251001', 1, 5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('anthropic', 'claude-sonnet-4-6', 3, 15, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('anthropic', 'claude-sonnet-5', 2, 10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('anthropic', 'claude-sonnet-5-5', 2, 10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('anthropic', 'claude-opus-4-8', 5, 25, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('anthropic', 'claude-opus-5-5', 4, 20, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT (provider_id, model_id) DO NOTHING;
