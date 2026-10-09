CREATE TABLE `purchase_charge_reviews` (
	`charge_id` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`candidate_uris` text NOT NULL,
	CONSTRAINT `ck_purchase_charge_reviews_reason` CHECK(`reason` IN ('ambiguous','too-many-candidates','no-candidate','ambiguous-partial')),
	CONSTRAINT `ck_purchase_charge_reviews_candidate_uris` CHECK(json_valid(`candidate_uris`) AND json_type(`candidate_uris`) = 'array'),
	FOREIGN KEY (`charge_id`) REFERENCES `purchase_charges`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
