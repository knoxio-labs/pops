INSERT INTO `ai_model_pricing` (`provider_id`, `model_id`, `display_name`, `input_cost_per_mtok`, `output_cost_per_mtok`, `is_default`, `created_at`, `updated_at`)
VALUES
	('anthropic', 'claude-haiku-4-5', 'Claude Haiku 4.5', 1, 5, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	('anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5 (2025-10-01)', 1, 5, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	('anthropic', 'claude-sonnet-4-6', 'Claude Sonnet 4.6', 3, 15, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	('anthropic', 'claude-sonnet-5', 'Claude Sonnet 5', 2, 10, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	('anthropic', 'claude-sonnet-5-5', 'Claude Sonnet 5.5', 2, 10, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	('anthropic', 'claude-opus-4-8', 'Claude Opus 4.8', 5, 25, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	('anthropic', 'claude-opus-5-5', 'Claude Opus 5.5', 4, 20, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(`provider_id`, `model_id`) DO NOTHING;
