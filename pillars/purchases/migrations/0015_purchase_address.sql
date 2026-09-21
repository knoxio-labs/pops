-- The branch a purchase was made at, referencing a contacts address by id
-- (ADR-053). Mirrors `merchant_entity_id`/`merchant_entity_name`: the id is
-- operative, the name is the printed wording kept verbatim beside it. No FK
-- — purchases never depends on contacts' schema directly, the same posture
-- `merchant_entity_id` already takes.
ALTER TABLE `purchases` ADD `merchant_address_id` text;--> statement-breakpoint
ALTER TABLE `purchases` ADD `merchant_address_name` text;
