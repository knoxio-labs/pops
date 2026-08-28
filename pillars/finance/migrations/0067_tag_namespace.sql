-- POPS-2611 (parent POPS-2594): port the 2026-08-28 tag namespace migration
-- into the journal. It was first executed as an ad-hoc Node script against the
-- live capivara database (`tmp/migrate-tags.cjs`, now deleted) and so existed
-- nowhere the code could reproduce it: every environment built from migrations
-- alone — a fresh volume, the pillar image smoke gate, a contributor's local DB
-- — came up with the old flat vocabulary. This file is that script, verbatim,
-- expressed as SQL.
--
-- What it does, in the script's own three parts:
--
--   1. Relabels every tag on `transactions` and `transaction_tag_rules` from the
--      flat vocabulary (`Bar`, `Eat Out`, `Toll`) to the namespaced one
--      (`venue:bar`, `occasion:out` + `contains:food`, `contains:tolls`). The
--      mapping is a pure relabel — each old tag maps only to what it already
--      asserted. The three `asset:car` additions (`Charging`, `Car maintenance`,
--      `Novated Lease`) are the sole inferences and are unambiguous.
--   2. Drops the four rollup tags (`Purchase`, `Shopping`, `Transport`,
--      `Entertainment`) and the two non-tags (`Income`, `Unknown`), which
--      asserted nothing a namespaced value does not.
--   3. Deactivates the whole existing vocabulary and seeds the 83 namespaced
--      values as the active set, so a database built from migrations carries the
--      vocabulary rather than deriving it from whatever rows happen to exist.
--
-- Overrides. Dropping the rollups would strip some rows to zero tags — on
-- capivara, 14 transactions and 6 rules. Each is given the value the rollup was
-- standing in for, matched on the merchant itself. The script matched with
-- case-insensitive regexes; the equivalent here is `LIKE`, which is
-- case-insensitive for ASCII in SQLite, with one row per regex alternative and
-- a shared `ord` so the first-rule-wins order is preserved. (`VAN HOUSEN` is
-- the spelling the script matched and the spelling on the statements — not the
-- brand's own `Van Heusen`.)
-- Every override yields exactly one tag, which is why the rescue below builds
-- its array with `json_array` of a single value.
--
-- Idempotency. There is no version guard: an already-namespaced value passes
-- through to itself (the `GLOB '[a-z]*:*'` arm of the remap), so a database that
-- has already been migrated — capivara — reaches exactly the state it is in and
-- nothing is written. Running this against migrated data is a no-op by
-- construction, not by bookkeeping, which is what makes the migration testable.
--
-- Safety. Both checks the script carried are hard failures here, each expressed
-- as an insert into a temp table whose CHECK constraint can never hold, so the
-- migration aborts inside the migrator's transaction and leaves the database
-- untouched:
--
--   * `tag_has_no_namespace_mapping` — a flat tag that is in neither the mapping
--     nor the dropped set. Aborting is right: silently keeping it would leave a
--     database half-migrated, and silently dropping it would lose data.
--   * `row_would_lose_every_tag` — a row whose tags all map to nothing and which
--     no override rescues. This fired during the real run; the overrides below
--     are its answer.
--
-- A third check, `tags_column_is_not_a_json_array`, runs first only so a
-- malformed `tags` value aborts with a named constraint rather than crashing
-- `json_each` further down.
CREATE TEMP TABLE _tag_ns_map (
	old_tag text NOT NULL,
	seq integer NOT NULL,
	new_tag text NOT NULL
);
--> statement-breakpoint
INSERT INTO _tag_ns_map (old_tag, seq, new_tag) VALUES
	('Online', 0, 'channel:online'),
	('Amazon', 0, 'enrich:amazon'),
	('Paylab', 0, 'enrich:paylab'),
	('PayPal', 0, 'enrich:paypal'),
	('Bunnings', 0, 'enrich:bunnings'),
	('IKEA', 0, 'enrich:ikea'),
	('Apple', 0, 'enrich:apple'),
	('Kmart', 0, 'enrich:kmart'),
	('BigW', 0, 'enrich:bigw'),
	('Good Guys', 0, 'enrich:good-guys'),
	('Bar', 0, 'venue:bar'),
	('Restaurant', 0, 'venue:restaurant'),
	('Convenience Store', 0, 'venue:convenience-store'),
	('Bottle Shop', 0, 'venue:bottle-shop'),
	('Pharmacy', 0, 'venue:pharmacy'),
	('Pub', 0, 'venue:pub'),
	('Club', 0, 'venue:club'),
	('Takeaway', 0, 'venue:takeaway'),
	('Cinema', 0, 'venue:cinema'),
	('Cafe', 0, 'venue:cafe'),
	('Bakery', 0, 'venue:bakery'),
	('Sauna', 0, 'venue:sauna'),
	('Arcade', 0, 'venue:arcade'),
	('Sex Shop', 0, 'venue:sex-shop'),
	('Vending Machine', 0, 'venue:vending-machine'),
	('Costco', 0, 'venue:supermarket'),
	('Go out', 0, 'occasion:out'),
	('Eat Out', 0, 'occasion:out'),
	('Eat Out', 1, 'contains:food'),
	('Date', 0, 'occasion:out'),
	('Home', 0, 'occasion:home'),
	('Travel', 0, 'occasion:travel'),
	('Work', 0, 'occasion:work'),
	('Transfer', 0, 'occasion:admin'),
	('Bank', 0, 'occasion:admin'),
	('Credit Card', 0, 'occasion:admin'),
	('Groceries', 0, 'contains:groceries'),
	('Alcohol', 0, 'contains:alcohol'),
	('Wine', 0, 'contains:alcohol'),
	('Food', 0, 'contains:food'),
	('Breakfast', 0, 'contains:food'),
	('Fast Food', 0, 'contains:fast-food'),
	('Subscriptions', 0, 'contains:subscription'),
	('Uber', 0, 'contains:rideshare'),
	('Gift Card', 0, 'contains:gift-card'),
	('Gifts', 0, 'contains:gift'),
	('Public Transport', 0, 'contains:public-transport'),
	('Toll', 0, 'contains:tolls'),
	('Tolls', 0, 'contains:tolls'),
	('Health', 0, 'contains:health'),
	('Parking', 0, 'contains:parking'),
	('Software', 0, 'contains:software'),
	('Coffee', 0, 'contains:coffee'),
	('Fee', 0, 'contains:fee'),
	('Fees', 0, 'contains:fee'),
	('Events', 0, 'contains:events'),
	('Eurovision', 0, 'contains:events'),
	('Ice Cream', 0, 'contains:ice-cream'),
	('BubbleTea', 0, 'contains:bubble-tea'),
	('Utilities', 0, 'contains:utilities'),
	('Games', 0, 'contains:games'),
	('Clothing', 0, 'contains:clothing'),
	('Mobile', 0, 'contains:mobile'),
	('Flight', 0, 'contains:flight'),
	('Hotel', 0, 'contains:accommodation'),
	('Fuel', 0, 'contains:fuel'),
	('Insurance', 0, 'contains:insurance'),
	('Poppers', 0, 'contains:party-supplies'),
	('PT', 0, 'contains:fitness'),
	('Fitness', 0, 'contains:fitness'),
	('EV', 0, 'asset:car'),
	('Charging', 0, 'contains:charging'),
	('Charging', 1, 'asset:car'),
	('Car maintenance', 0, 'contains:maintenance'),
	('Car maintenance', 1, 'asset:car'),
	('Novated Lease', 0, 'tax:novated-lease'),
	('Novated Lease', 1, 'asset:car'),
	('Homelab', 0, 'asset:homelab'),
	('AWS', 0, 'asset:homelab'),
	('Brewing', 0, 'hobby:brewing'),
	('Hunter Valley', 0, 'trip:hunter-valley-2026'),
	('Trouble', 0, 'flag:needs-review'),
	('Problem', 0, 'flag:needs-review'),
	('Deductible', 0, 'tax:deductible'),
	('Donations', 0, 'contains:donations'),
	('Education', 0, 'contains:education'),
	('Interest', 0, 'fee:interest'),
	('Internet', 0, 'contains:internet'),
	('Mortgage', 0, 'contains:mortgage'),
	('Rent', 0, 'contains:rent'),
	('Taxes', 0, 'contains:taxes');
--> statement-breakpoint
-- The flat tags that assert nothing a namespaced value does not: the four
-- rollups, plus `Income` and `Unknown`, which the transaction's own type and
-- the absence of a tag already say. They map to no value, which is why they
-- need naming separately — a tag in neither this set nor the mapping above is
-- an unmapped tag and aborts the run.
CREATE TEMP TABLE _tag_ns_dropped (old_tag text PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO _tag_ns_dropped (old_tag) VALUES
	('Purchase'),
	('Shopping'),
	('Transport'),
	('Entertainment'),
	('Income'),
	('Unknown');
--> statement-breakpoint
CREATE TEMP TABLE _tag_ns_override (
	ord integer NOT NULL,
	pattern text NOT NULL,
	new_tag text NOT NULL
);
--> statement-breakpoint
INSERT INTO _tag_ns_override (ord, pattern, new_tag) VALUES
	(0, '%TRANSPORTFORNSW%', 'contains:public-transport'),
	(1, '%SPOTLIGHT%', 'contains:household'),
	(2, '%VHO %', 'contains:clothing'),
	(2, '%VAN HOUSEN%', 'contains:clothing'),
	(2, '%YD PTY%', 'contains:clothing'),
	(2, 'YD', 'contains:clothing'),
	(2, '%PEPPER SEEDS%', 'contains:clothing'),
	(3, '%STRIKE AUSTRALIA%', 'venue:arcade'),
	(3, '%ARCHIE BROTHERS%', 'venue:arcade'),
	(4, '%GAYM%', 'contains:fitness'),
	(5, '%BROADWAYSHOPPINGCENT%', 'flag:needs-review'),
	(5, '%BROADWAY SHOPPING%', 'flag:needs-review');
--> statement-breakpoint
CREATE TEMP TABLE _tag_ns_abort_malformed (
	subject text NOT NULL,
	CONSTRAINT tags_column_is_not_a_json_array CHECK (subject IS NULL)
);
--> statement-breakpoint
INSERT INTO _tag_ns_abort_malformed (subject)
SELECT 'transactions.' || id FROM transactions
 WHERE CASE WHEN json_valid(tags) THEN json_type(tags) ELSE 'invalid' END <> 'array'
UNION ALL
SELECT 'transaction_tag_rules.' || id FROM transaction_tag_rules
 WHERE CASE WHEN json_valid(tags) THEN json_type(tags) ELSE 'invalid' END <> 'array';
--> statement-breakpoint
CREATE TEMP TABLE _tag_ns_abort_unmapped (
	tag text NOT NULL,
	CONSTRAINT tag_has_no_namespace_mapping CHECK (tag IS NULL)
);
--> statement-breakpoint
INSERT INTO _tag_ns_abort_unmapped (tag)
SELECT DISTINCT je.value FROM transactions r, json_each(r.tags) je
 WHERE je.value NOT GLOB '[a-z]*:*'
   AND je.value NOT IN (SELECT old_tag FROM _tag_ns_map)
   AND je.value NOT IN (SELECT old_tag FROM _tag_ns_dropped)
UNION
SELECT DISTINCT je.value FROM transaction_tag_rules r, json_each(r.tags) je
 WHERE je.value NOT GLOB '[a-z]*:*'
   AND je.value NOT IN (SELECT old_tag FROM _tag_ns_map)
   AND je.value NOT IN (SELECT old_tag FROM _tag_ns_dropped);
--> statement-breakpoint
CREATE TEMP TABLE _tag_ns_new_txn_tag (
	row_id text NOT NULL,
	ord integer NOT NULL,
	new_tag text NOT NULL
);
--> statement-breakpoint
INSERT INTO _tag_ns_new_txn_tag (row_id, ord, new_tag)
SELECT row_id, MIN(ord), new_tag FROM (
	SELECT r.id AS row_id, je.key * 100 + m.seq AS ord, m.new_tag AS new_tag
	  FROM transactions r, json_each(r.tags) je
	  JOIN _tag_ns_map m ON m.old_tag = je.value
	UNION ALL
	SELECT r.id AS row_id, je.key * 100 AS ord, je.value AS new_tag
	  FROM transactions r, json_each(r.tags) je
	 WHERE je.value GLOB '[a-z]*:*'
)
GROUP BY row_id, new_tag;
--> statement-breakpoint
CREATE TEMP TABLE _tag_ns_txn_remap (
	row_id text PRIMARY KEY NOT NULL,
	old_count integer NOT NULL,
	tags text NOT NULL
);
--> statement-breakpoint
INSERT INTO _tag_ns_txn_remap (row_id, old_count, tags)
SELECT r.id,
       json_array_length(r.tags),
       (SELECT json_group_array(n.new_tag ORDER BY n.ord)
          FROM _tag_ns_new_txn_tag n
         WHERE n.row_id = r.id)
  FROM transactions r;
--> statement-breakpoint
UPDATE _tag_ns_txn_remap
   SET tags = COALESCE(
       (SELECT json_array(o.new_tag)
          FROM _tag_ns_override o, transactions r
         WHERE r.id = _tag_ns_txn_remap.row_id
           AND r.description LIKE o.pattern
         ORDER BY o.ord
         LIMIT 1),
       tags)
 WHERE tags = '[]' AND old_count > 0;
--> statement-breakpoint
CREATE TEMP TABLE _tag_ns_new_rule_tag (
	row_id text NOT NULL,
	ord integer NOT NULL,
	new_tag text NOT NULL
);
--> statement-breakpoint
INSERT INTO _tag_ns_new_rule_tag (row_id, ord, new_tag)
SELECT row_id, MIN(ord), new_tag FROM (
	SELECT r.id AS row_id, je.key * 100 + m.seq AS ord, m.new_tag AS new_tag
	  FROM transaction_tag_rules r, json_each(r.tags) je
	  JOIN _tag_ns_map m ON m.old_tag = je.value
	UNION ALL
	SELECT r.id AS row_id, je.key * 100 AS ord, je.value AS new_tag
	  FROM transaction_tag_rules r, json_each(r.tags) je
	 WHERE je.value GLOB '[a-z]*:*'
)
GROUP BY row_id, new_tag;
--> statement-breakpoint
CREATE TEMP TABLE _tag_ns_rule_remap (
	row_id text PRIMARY KEY NOT NULL,
	old_count integer NOT NULL,
	tags text NOT NULL
);
--> statement-breakpoint
INSERT INTO _tag_ns_rule_remap (row_id, old_count, tags)
SELECT r.id,
       json_array_length(r.tags),
       (SELECT json_group_array(n.new_tag ORDER BY n.ord)
          FROM _tag_ns_new_rule_tag n
         WHERE n.row_id = r.id)
  FROM transaction_tag_rules r;
--> statement-breakpoint
UPDATE _tag_ns_rule_remap
   SET tags = COALESCE(
       (SELECT json_array(o.new_tag)
          FROM _tag_ns_override o, transaction_tag_rules r
         WHERE r.id = _tag_ns_rule_remap.row_id
           AND r.description_pattern LIKE o.pattern
         ORDER BY o.ord
         LIMIT 1),
       tags)
 WHERE tags = '[]' AND old_count > 0;
--> statement-breakpoint
CREATE TEMP TABLE _tag_ns_abort_emptied (
	row_id text NOT NULL,
	CONSTRAINT row_would_lose_every_tag CHECK (row_id IS NULL)
);
--> statement-breakpoint
INSERT INTO _tag_ns_abort_emptied (row_id)
SELECT 'transactions.' || row_id FROM _tag_ns_txn_remap WHERE tags = '[]' AND old_count > 0
UNION ALL
SELECT 'transaction_tag_rules.' || row_id FROM _tag_ns_rule_remap WHERE tags = '[]' AND old_count > 0;
--> statement-breakpoint
UPDATE transactions
   SET tags = (SELECT n.tags FROM _tag_ns_txn_remap n WHERE n.row_id = transactions.id)
 WHERE tags <> (SELECT n.tags FROM _tag_ns_txn_remap n WHERE n.row_id = transactions.id);
--> statement-breakpoint
UPDATE transaction_tag_rules
   SET tags = (SELECT n.tags FROM _tag_ns_rule_remap n WHERE n.row_id = transaction_tag_rules.id)
 WHERE tags <> (SELECT n.tags FROM _tag_ns_rule_remap n WHERE n.row_id = transaction_tag_rules.id);
--> statement-breakpoint
UPDATE tag_vocabulary SET is_active = 0;
--> statement-breakpoint
INSERT INTO tag_vocabulary (tag, source, is_active) VALUES
	('asset:car', 'seed', 1),
	('asset:homelab', 'seed', 1),
	('channel:in-person', 'seed', 1),
	('channel:online', 'seed', 1),
	('contains:accommodation', 'seed', 1),
	('contains:alcohol', 'seed', 1),
	('contains:bubble-tea', 'seed', 1),
	('contains:charging', 'seed', 1),
	('contains:clothing', 'seed', 1),
	('contains:coffee', 'seed', 1),
	('contains:donations', 'seed', 1),
	('contains:education', 'seed', 1),
	('contains:events', 'seed', 1),
	('contains:fast-food', 'seed', 1),
	('contains:fee', 'seed', 1),
	('contains:fitness', 'seed', 1),
	('contains:flight', 'seed', 1),
	('contains:food', 'seed', 1),
	('contains:fuel', 'seed', 1),
	('contains:games', 'seed', 1),
	('contains:gift', 'seed', 1),
	('contains:gift-card', 'seed', 1),
	('contains:groceries', 'seed', 1),
	('contains:health', 'seed', 1),
	('contains:household', 'seed', 1),
	('contains:ice-cream', 'seed', 1),
	('contains:insurance', 'seed', 1),
	('contains:internet', 'seed', 1),
	('contains:maintenance', 'seed', 1),
	('contains:mobile', 'seed', 1),
	('contains:mortgage', 'seed', 1),
	('contains:parking', 'seed', 1),
	('contains:party-supplies', 'seed', 1),
	('contains:public-transport', 'seed', 1),
	('contains:rent', 'seed', 1),
	('contains:rideshare', 'seed', 1),
	('contains:software', 'seed', 1),
	('contains:subscription', 'seed', 1),
	('contains:taxes', 'seed', 1),
	('contains:tolls', 'seed', 1),
	('contains:utilities', 'seed', 1),
	('enrich:amazon', 'seed', 1),
	('enrich:apple', 'seed', 1),
	('enrich:bigw', 'seed', 1),
	('enrich:bunnings', 'seed', 1),
	('enrich:good-guys', 'seed', 1),
	('enrich:ikea', 'seed', 1),
	('enrich:kmart', 'seed', 1),
	('enrich:paylab', 'seed', 1),
	('enrich:paypal', 'seed', 1),
	('fee:atm', 'seed', 1),
	('fee:conversion', 'seed', 1),
	('fee:interest', 'seed', 1),
	('fee:late', 'seed', 1),
	('fee:membership', 'seed', 1),
	('fee:surcharge', 'seed', 1),
	('flag:needs-review', 'seed', 1),
	('hobby:brewing', 'seed', 1),
	('occasion:admin', 'seed', 1),
	('occasion:home', 'seed', 1),
	('occasion:out', 'seed', 1),
	('occasion:travel', 'seed', 1),
	('occasion:work', 'seed', 1),
	('person:rosane', 'seed', 1),
	('tax:deductible', 'seed', 1),
	('tax:novated-lease', 'seed', 1),
	('trip:hunter-valley-2026', 'seed', 1),
	('venue:arcade', 'seed', 1),
	('venue:bakery', 'seed', 1),
	('venue:bar', 'seed', 1),
	('venue:bottle-shop', 'seed', 1),
	('venue:cafe', 'seed', 1),
	('venue:cinema', 'seed', 1),
	('venue:club', 'seed', 1),
	('venue:convenience-store', 'seed', 1),
	('venue:pharmacy', 'seed', 1),
	('venue:pub', 'seed', 1),
	('venue:restaurant', 'seed', 1),
	('venue:sauna', 'seed', 1),
	('venue:sex-shop', 'seed', 1),
	('venue:supermarket', 'seed', 1),
	('venue:takeaway', 'seed', 1),
	('venue:vending-machine', 'seed', 1)
ON CONFLICT(tag) DO UPDATE SET is_active = 1;
--> statement-breakpoint
DROP TABLE _tag_ns_map;--> statement-breakpoint
DROP TABLE _tag_ns_dropped;--> statement-breakpoint
DROP TABLE _tag_ns_override;--> statement-breakpoint
DROP TABLE _tag_ns_abort_malformed;--> statement-breakpoint
DROP TABLE _tag_ns_abort_unmapped;--> statement-breakpoint
DROP TABLE _tag_ns_abort_emptied;--> statement-breakpoint
DROP TABLE _tag_ns_new_txn_tag;--> statement-breakpoint
DROP TABLE _tag_ns_txn_remap;--> statement-breakpoint
DROP TABLE _tag_ns_new_rule_tag;--> statement-breakpoint
DROP TABLE _tag_ns_rule_remap;
