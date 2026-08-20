ALTER TABLE `devices` ADD `capabilities` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `devices` SET `capabilities` = '["session.read","finance.transactions.read","purchases.receipts.write"]';
