-- POPS-3285: give a vocabulary value somewhere to say what it means.
--
-- `tag_vocabulary` held `tag / facet / kind / source / is_active / usage_count`
-- and nothing else, so no value in the taxonomy carried a definition anywhere
-- in the system. The categorizer prompt rendered the axis as a bare list —
-- `occasion: exactly one of [out, home, travel, work, health]` — and asked the
-- model to pick exactly one with no criteria at all. `home` is the word that
-- reads as the residual domestic bucket, so it collected everything that was
-- not obviously one of the other four: a chemist run came back
-- `venue:pharmacy + contains:health + occasion:home` while `occasion:health`
-- sat unused in the same list.
--
-- The column is NULLABLE, and that is the design rather than a concession.
-- `trip:cairns-2026` needs no gloss and requiring one would produce filler that
-- costs prompt tokens and teaches the model nothing. What needs a definition is
-- a value that is chosen *against* its siblings — the five `occasion:` values
-- above all, then the handful of `venue:`/`contains:` values whose boundaries
-- genuinely blur. Everything else is left null and renders as the bare value it
-- already was.
--
-- Three axes are described here as answering three different questions, because
-- conflating them is what produced the `occasion:home + venue:homewares +
-- contains:household` rows that say one thing three times:
--
--   occasion: — the social setting the money was spent in
--   venue:    — what kind of place it was spent at
--   contains: — what was actually bought
--
-- Idempotent: the column add is guarded by running once (drizzle's journal), and
-- every description is an UPDATE keyed on the tag, so a re-run rewrites the same
-- text and a value the vocabulary does not hold is silently skipped.
ALTER TABLE `tag_vocabulary` ADD COLUMN `description` text;
--> statement-breakpoint

-- occasion: the social setting the money was spent in.
--
-- Every value is described, because this axis is single-valued, is expected on
-- nearly every spend row, and is the one the model was guessing at. `home` gets
-- the longest gloss: it is the value that was wrong, and what makes it wrong is
-- a distinction the word itself does not carry — spend ON the dwelling versus
-- goods that merely end up in it.
UPDATE `tag_vocabulary` SET `description` = 'Spent while out: a bar, cafe, restaurant, cinema, club, an outing. The setting is being out, not what was bought.' WHERE `tag` = 'occasion:out';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Spent on the dwelling itself: rent, mortgage, utilities, furniture, repairs, a tradesperson. NOT goods that merely end up at home - a grocery run is routine provisioning and has no occasion at all.' WHERE `tag` = 'occasion:home';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Spent while away from the home city: a trip, a work flight, a weekend away.' WHERE `tag` = 'occasion:travel';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Spent for work: a work tool, a work subscription, a work trip.' WHERE `tag` = 'occasion:work';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Spent on health: a pharmacy, a doctor or dentist, medicines, supplements, treatment.' WHERE `tag` = 'occasion:health';
--> statement-breakpoint

-- venue: what kind of place the money was spent at.
--
-- Only the blurred ones. A `venue:bakery` needs no help; `homewares` does,
-- because it had been carrying hardware stores, and `convenience-store` does,
-- because its gloss is the reason the coverage metric excuses it from saying
-- what it contained.
UPDATE `tag_vocabulary` SET `description` = 'A shop selling furnishings, decor and kitchenware for the home. Not a hardware or building-supplies store.' WHERE `tag` = 'venue:homewares';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A corner shop or service-station kiosk, selling across every category from one counter.' WHERE `tag` = 'venue:convenience-store';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A chemist.' WHERE `tag` = 'venue:pharmacy';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A grocery store.' WHERE `tag` = 'venue:supermarket';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A transport operator, charging for a fare.' WHERE `tag` = 'venue:transport';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A garage, mechanic or car-parts shop.' WHERE `tag` = 'venue:auto';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'The centre itself - its car park or management - rather than a shop inside it.' WHERE `tag` = 'venue:shopping-centre';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Counter service, taken away rather than eaten on the premises.' WHERE `tag` = 'venue:takeaway';
--> statement-breakpoint

-- contains: what was actually bought.
--
-- `household` and `health` are described because they are the two that were
-- being read as restatements of an occasion rather than as contents.
UPDATE `tag_vocabulary` SET `description` = 'Cleaning supplies, laundry and kitchen consumables, bin liners, small furnishings: the consumable side of running a home.' WHERE `tag` = 'contains:household';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Medicines, first aid, personal care, supplements.' WHERE `tag` = 'contains:health';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Food and drink bought to prepare or consume later.' WHERE `tag` = 'contains:groceries';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A prepared meal, eaten as bought.' WHERE `tag` = 'contains:food';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Gym, classes, sports gear, or supplements bought for training.' WHERE `tag` = 'contains:fitness';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Repair or upkeep of something already owned.' WHERE `tag` = 'contains:maintenance';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Admission to a place or an event.' WHERE `tag` = 'contains:entry';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Electricity, gas or water supplied to a dwelling.' WHERE `tag` = 'contains:utilities';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Electricity for an electric vehicle.' WHERE `tag` = 'contains:charging';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Cash taken out.' WHERE `tag` = 'contains:withdrawal';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Money received for something sold, not a purchase.' WHERE `tag` = 'contains:sale';
--> statement-breakpoint

-- channel: how the purchase was made.
UPDATE `tag_vocabulary` SET `description` = 'Bought remotely, through a website or an app.' WHERE `tag` = 'channel:online';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Bought at a physical counter.' WHERE `tag` = 'channel:in-person';
--> statement-breakpoint

-- fee: which fee this is. Described where the name alone does not separate it
-- from its siblings.
UPDATE `tag_vocabulary` SET `description` = 'A merchant surcharge added to a purchase.' WHERE `tag` = 'fee:surcharge';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A foreign-currency conversion fee.' WHERE `tag` = 'fee:conversion';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Interest charged on a balance.' WHERE `tag` = 'fee:interest';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'An ATM operator or withdrawal fee.' WHERE `tag` = 'fee:atm';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A late-payment fee.' WHERE `tag` = 'fee:late';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A recurring membership or account-keeping fee.' WHERE `tag` = 'fee:membership';
