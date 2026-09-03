-- POPS-2772. Introduces `account_gift_card_details` (a recoverable encrypted
-- number/PIN extension row for `gift-card`-kind accounts, POPS-2767) and
-- `gift_card_secret_reveals` (an audit trail of one-shot plaintext reveals).
--
-- `account_gift_card_details.account_id` is the table's own PRIMARY KEY
-- rather than a synthetic id: a gift card has exactly one number/PIN pair,
-- so there is nothing a separate id would disambiguate, and it doubles as
-- the FK onto `accounts.id`. There is no SQL CHECK constraining
-- `accounts.kind = 'gift-card'` for a referencing row — SQLite has no way to
-- express a cross-table check against another row's column — so that
-- invariant is enforced at the service layer
-- (`src/db/services/gift-card-details.ts`) instead, the same split
-- `accounts.kind` itself already uses against `ACCOUNT_KINDS` (see 0083's
-- header).
--
-- `last_four` is plaintext (not secret) so a masked read never needs to
-- touch `secret_ref`, which holds the AES-256-GCM-encrypted
-- `{ number, pin }` blob — see `src/db/services/gift-card-crypto.ts` for the
-- exact layout and ADR-050's addendum for why the two fields share one
-- ciphertext.
--
-- `gift_card_secret_reveals` has no FK-enforced link to who revealed a
-- secret — see `src/db/schema/gift-card-secret-reveals.ts` for why this
-- pillar's REST layer has nothing to record there.

CREATE TABLE `account_gift_card_details` (
	`account_id` text PRIMARY KEY NOT NULL,
	`last_four` text NOT NULL,
	`expires_on` text,
	`issuer_entity_id` text,
	`secret_ref` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `gift_card_secret_reveals` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`revealed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_gift_card_secret_reveals_account` ON `gift_card_secret_reveals` (`account_id`);
