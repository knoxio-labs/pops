-- A decision in the reconcile queue used to leave no trace the matcher
-- could read. `purchase_match_rules` had no writer at all, so the table,
-- its indexes and `purchase_charge_links.match_rule_id` were unreachable
-- from the day they shipped. Three additions make a confirm and a reject
-- durable.
--
-- 1. The descriptor a link was proposed against.
--
-- A rule is keyed on a description pattern; a decision arrives as a charge
-- id and a transaction URI. Nothing joined the two, and the two ways to
-- close that without a column are both worse: asking finance during the
-- decision makes an accept fail whenever the peer is down, and taking the
-- descriptor from the request body trusts a caller with the value the rule
-- is keyed on. The sweep already holds it when it writes the link.
--
-- Nullable, and backfilling is deliberately not attempted. Every
-- unconfirmed link is torn down and rewritten by the next sweep, which
-- fills the column from the fetch it already makes; only links a human
-- confirmed before this migration keep NULL, and those have already had
-- their decision. Inventing a descriptor for them would be inventing the
-- evidence a rule is derived from.
ALTER TABLE `purchase_charge_links` ADD `transaction_description` text;--> statement-breakpoint

-- 2. What makes a decision idempotent.
--
-- The tenth order from a merchant confirms the pattern the first one
-- established. Without this constraint that writes a tenth identical rule,
-- and `timesApplied` — the column that exists to say how much a rule has
-- earned — counts to one, ten times over.
--
-- SQLite treats NULLs as distinct, so this constrains nothing for a rule
-- with no source. That is the intended reading rather than a hole: the
-- queue's writer always scopes a rule to the order's own source, and an
-- unscoped rule applying to every merchant at once is a deliberate human
-- act that must not collide with the learned ones. The table is empty by
-- construction here — nothing has ever written it — so the index cannot
-- fail on existing rows.
CREATE UNIQUE INDEX `uq_purchase_match_rules_pattern_source` ON `purchase_match_rules` (`description_pattern`,`source`);--> statement-breakpoint

-- 3. The pairings a human ruled out.
--
-- `unlink` deletes a link the next sweep re-derives, which is why the queue
-- shipped with no reject at all: a button that silently undoes itself is
-- worse than its absence. A row here is what the solver's blocking stage
-- consults, so a rejected pairing is never proposed again.
--
-- Not a negative rule row. The narrowest negative a descriptor-pattern
-- table can express is "descriptors like this never settle this source",
-- which is a claim about every future order from the merchant inferred
-- from one click — and when the engine merely picked the wrong one of a
-- merchant's two charges, that inference disables the merchant. The pair
-- is what the rejection actually establishes, so the pair is what is
-- stored.
--
-- Not a column on the link either: a rejected link is not a link, and
-- leaving the row would have every reader that sums linked money count
-- rejected money as matched unless it remembered not to.
--
-- The composite primary key is what makes rejecting the same pair twice a
-- no-op rather than a second row saying the same thing.
CREATE TABLE `purchase_link_rejections` (
	`charge_id` text NOT NULL,
	`transaction_uri` text NOT NULL,
	`rejected_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`charge_id`, `transaction_uri`),
	FOREIGN KEY (`charge_id`) REFERENCES `purchase_charges`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_link_rejections_charge` ON `purchase_link_rejections` (`charge_id`);
