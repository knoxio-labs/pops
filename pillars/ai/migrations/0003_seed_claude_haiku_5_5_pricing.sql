INSERT INTO `ai_model_pricing` (`provider_id`, `model_id`, `display_name`, `input_cost_per_mtok`, `output_cost_per_mtok`, `is_default`, `created_at`, `updated_at`)
VALUES
	('anthropic', 'claude-haiku-5-5', 'Claude Haiku 5.5', 0.1, 0.5, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(`provider_id`, `model_id`) DO NOTHING;
