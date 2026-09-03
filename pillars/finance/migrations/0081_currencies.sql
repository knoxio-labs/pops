-- POPS-2802. Design review on POPS-2765 rejected `accounts.currency` as a
-- closed ISO 4217 enum: the reviewer wants rewards points ("Qantas Points",
-- "Membership Rewards") modelled as accounts too, and a points balance is
-- denominated in something that is not a currency and has no ISO code.
--
-- `currencies` is the growable replacement — a table `accounts.currency` will
-- foreign-key onto in POPS-2767, not a checked string. `symbol` is nullable
-- because points have none; `decimals` is 0 for points and whatever a fiat
-- currency actually uses (not hardcoded to 2 — three- and zero-decimal ISO
-- currencies exist) so the formatting helper never guesses. `kind` separates
-- the two so a balance can be rendered without inspecting `symbol`/`decimals`
-- for absence.
--
-- Seeded with the fiat codes finance's importers already produce (AUD is the
-- book currency everything is stored in; USD/EUR/GBP appear as
-- `foreign_currency` on Amex foreign-charge rows) plus the two points
-- programs POPS-2765's review named by example.

CREATE TABLE `currencies` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`symbol` text,
	`decimals` integer NOT NULL,
	`kind` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_currencies_kind` ON `currencies` (`kind`);
--> statement-breakpoint
INSERT INTO `currencies` (`code`, `name`, `symbol`, `decimals`, `kind`) VALUES
	('AUD', 'Australian Dollar', '$', 2, 'fiat'),
	('USD', 'US Dollar', '$', 2, 'fiat'),
	('EUR', 'Euro', '€', 2, 'fiat'),
	('GBP', 'British Pound', '£', 2, 'fiat'),
	('QFF', 'Qantas Points', NULL, 0, 'points'),
	('AMEX_MR', 'Membership Rewards', NULL, 0, 'points');
