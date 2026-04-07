ALTER TABLE `comparisons` ADD `delta_a` integer;--> statement-breakpoint
ALTER TABLE `comparisons` ADD `delta_b` integer;--> statement-breakpoint
ALTER TABLE `transaction_corrections` ADD `is_active` integer DEFAULT true NOT NULL;