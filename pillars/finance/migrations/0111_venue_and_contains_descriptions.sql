-- POPS-3672: describe the venue values and the contested contains values.
--
-- 0104 described the values chosen against their siblings, occasion above all,
-- and left most of venue and contains bare. A value offered with no definition
-- is one the model guesses at by its word alone, which is how occasion:home
-- collected every row that was not obviously something else before 0104
-- described it. venue and contains are most of what the categorizer is offered.
--
-- Every definition here is written against how the ledger actually uses the
-- value, from a full scan of 1,320 transactions (method recorded on POPS-3672):
-- the rows carrying it, the merchants behind them, and the values it is
-- confused with. Correction rules could not be used as evidence: all 270 carry
-- an empty tag list. Where a sibling is the usual wrong answer, the definition
-- says so, because that half is what separates two values the words alone do
-- not.
--
-- Not described, deliberately:
--   venue:parking, venue:hardware      already defined, by 0106 and 0105; their
--                                      boundaries are drawn from the other side
--                                      too (0106 parking points at contains:parking,
--                                      0104 homewares excludes hardware stores)
--   venue:gift-shop                    zero rows; whether to keep it is POPS-3689
--                                      (venue:attraction also has zero rows, but
--                                      0106 seeded it with a definition already)
--   contains values with 0-1 rows      nothing is being confused with them
--   contains values with no boundary   checked and found clean (parking vs
--                                      tolls, transport vs rideshare, service
--                                      vs maintenance, gift vs gift-card)
--
-- Idempotent in the same way as 0104: every statement is an UPDATE keyed on the
-- tag, so a re-run rewrites the same text and a value the vocabulary does not
-- hold is skipped.

-- venue: what kind of place the money was spent at.
UPDATE `tag_vocabulary` SET `description` = 'A pub or hotel bar, for drinks and pub meals. Not a nightclub: a late-night dance venue is venue:club, even when the pub has a late licence.' WHERE `tag` = 'venue:pub';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A sit-down restaurant where the meal is eaten on the premises. Not counter service taken away, which is venue:takeaway; a row is one or the other, never both.' WHERE `tag` = 'venue:restaurant';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A nightclub or late-night dance and entertainment venue. Not a pub, and not a gym or fitness club, whatever the business calls itself.' WHERE `tag` = 'venue:club';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A liquor retailer selling alcohol to take away. Not a pub or bar, where it is drunk on the premises.' WHERE `tag` = 'venue:bottle-shop';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A coffee shop, eaten in or taken away. Not a restaurant: a cafe whose main trade is coffee stays a cafe when it also sells food.' WHERE `tag` = 'venue:cafe';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A cinema, paying for film tickets or its candy bar.' WHERE `tag` = 'venue:cinema';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'An arcade or games-entertainment venue.' WHERE `tag` = 'venue:arcade';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A specialty meat shop. What it sells is groceries, so it carries contains:groceries.' WHERE `tag` = 'venue:butcher';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A sauna, bathhouse or wellness venue paid for entry. Not a gym.' WHERE `tag` = 'venue:sauna';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A bakery. Bread bought to take home is contains:groceries; something eaten while out is contains:food.' WHERE `tag` = 'venue:bakery';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A clothing or costume shop, new or second-hand.' WHERE `tag` = 'venue:clothing';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'An electronics or computer-hardware retailer.' WHERE `tag` = 'venue:electronics';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'An adult store.' WHERE `tag` = 'venue:sex-shop';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A vending machine.' WHERE `tag` = 'venue:vending-machine';
--> statement-breakpoint

-- contains: what was actually bought. Only the values whose boundary the
-- ledger shows being drawn inconsistently.
UPDATE `tag_vocabulary` SET `description` = 'A meal from a fast-food chain. It is food, so it also carries contains:food; this value says which kind.' WHERE `tag` = 'contains:fast-food';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Coffee or tea bought to drink. Add contains:food only when food was bought as well, not because coffee is consumed.' WHERE `tag` = 'contains:coffee';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Bubble tea. Add contains:food only when food was bought as well.' WHERE `tag` = 'contains:bubble-tea';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Ice cream or gelato. Add contains:food only when other food was bought as well.' WHERE `tag` = 'contains:ice-cream';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A video or audio streaming service. A recurring charge also carries contains:subscription; every charge from the same service carries both.' WHERE `tag` = 'contains:streaming';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'Parking paid for, whether that is the whole charge or one line on a hotel or airport bill.' WHERE `tag` = 'contains:parking';
--> statement-breakpoint
UPDATE `tag_vocabulary` SET `description` = 'A haircut or barber. It is personal care, so it also carries contains:health on every visit.' WHERE `tag` = 'contains:haircut';
