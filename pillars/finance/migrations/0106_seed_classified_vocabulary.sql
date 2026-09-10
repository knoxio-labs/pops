-- POPS-3301: seed the classified vocabulary the live database already holds.
--
-- A database built from this migration chain carried 65 values on the five
-- classified facets. The live one carried 82 when this was measured. The 18
-- below were minted after the seed and existed in exactly one place, which has
-- two consequences and both are defects rather than tolerable drift.
--
-- The two counts do not differ by 18, and the missing one is not an error:
-- 65 + 18 = 83, and the live database reaches 83 as well, because the 65
-- already includes `venue:hardware`, which 0105 inserts into both sides and
-- which the live database did not hold at the time it was counted. After this
-- migration both hold the same 83 values, which is the point.
--
-- **A closed facet that only exists in one database is not closed.** `venue`,
-- `occasion`, `channel` and `fee` are `closed` in `TAG_FACET_KINDS` — nobody
-- may mint a value, and a value outside the set is a validation error rather
-- than a suggestion. Ten of the eighteen are `venue:` values. Calling that axis
-- closed while its membership depends on which copy of the database you opened
-- is a claim the schema makes and the data does not support.
--
-- **The two databases classify against different taxonomies.** The categorizer
-- prompt is built from `tag_vocabulary`, so a rebuilt database offered the
-- model a materially smaller closed set. Anything reasoning about
-- classification behaviour from a fresh database was reasoning about a
-- different system, and the difference was invisible: a smaller list is a
-- perfectly well-formed prompt.
--
-- POPS-3285's 0105 hit the sharp end of this. It appends `occasion:health` to
-- pharmacy rows; that value exists live and did not exist here, so without an
-- explicit insert the migration would have put a tag on a transaction that the
-- closed set did not contain — the inconsistency POPS-2606 removed — and the
-- value would then have been dropped from every prompt built afterwards. A test
-- caught it. Nothing structural did, which is what
-- `migration-tag-literals.test.ts` now covers.
--
-- The eight `contains:` values are seeded despite that facet being `open`.
-- Open governs who may *mint* a value, not whether the seed should hold one,
-- and `contains` is classified: leaving these out would keep the prompt
-- divergence for the axis that carries the most values. They are also all
-- generic — `streaming`, `haircut`, `office-supplies`. Nothing personal is
-- seeded, and the values that genuinely are (`trip:cairns-2026`,
-- `person:rosane`, `hobby:brewing`) sit on unclassified facets and stay out.
--
-- Descriptions are carried on the insert rather than left to 0104. 0104's
-- UPDATEs are keyed on the tag, so on a database that did not hold the row they
-- matched nothing — `venue:homewares` would have been seeded here undescribed
-- while the live row had its definition. Where 0104 describes a value, the same
-- text appears below verbatim.
--
-- `usage_count` starts at 0 and `OR IGNORE` leaves the live rows untouched,
-- with their real counts, provenance and descriptions. Idempotent by
-- construction; re-running inserts nothing.

-- venue: closed. Ten values, which is the bulk of the divergence.
INSERT OR IGNORE INTO `tag_vocabulary` (`tag`, `facet`, `kind`, `source`, `is_active`, `usage_count`, `description`) VALUES
  ('venue:attraction', 'venue', 'closed', 'seed', 1, 0, 'A paid attraction: a museum, gallery, zoo, tour.'),
  ('venue:auto', 'venue', 'closed', 'seed', 1, 0, 'A garage, mechanic or car-parts shop.'),
  ('venue:butcher', 'venue', 'closed', 'seed', 1, 0, NULL),
  ('venue:clothing', 'venue', 'closed', 'seed', 1, 0, NULL),
  ('venue:electronics', 'venue', 'closed', 'seed', 1, 0, NULL),
  ('venue:gift-shop', 'venue', 'closed', 'seed', 1, 0, NULL),
  ('venue:homewares', 'venue', 'closed', 'seed', 1, 0, 'A shop selling furnishings, decor and kitchenware for the home. Not a hardware or building-supplies store.'),
  ('venue:parking', 'venue', 'closed', 'seed', 1, 0, 'A car park or parking operator. What was bought there is contains:parking.'),
  ('venue:shopping-centre', 'venue', 'closed', 'seed', 1, 0, 'The centre itself - its car park or management - rather than a shop inside it.'),
  ('venue:transport', 'venue', 'closed', 'seed', 1, 0, 'A transport operator, charging for a fare.');
--> statement-breakpoint

-- contains: open facet, classified axis. Seeded for the prompt, not to close it.
INSERT OR IGNORE INTO `tag_vocabulary` (`tag`, `facet`, `kind`, `source`, `is_active`, `usage_count`, `description`) VALUES
  ('contains:car-rental', 'contains', 'open', 'seed', 1, 0, NULL),
  ('contains:entry', 'contains', 'open', 'seed', 1, 0, 'Admission to a place or an event.'),
  ('contains:haircut', 'contains', 'open', 'seed', 1, 0, NULL),
  ('contains:office-supplies', 'contains', 'open', 'seed', 1, 0, NULL),
  ('contains:salary', 'contains', 'open', 'seed', 1, 0, 'Wages received. On an income row, not a purchase.'),
  ('contains:sale', 'contains', 'open', 'seed', 1, 0, 'Money received for something sold, not a purchase.'),
  ('contains:streaming', 'contains', 'open', 'seed', 1, 0, NULL),
  ('contains:withdrawal', 'contains', 'open', 'seed', 1, 0, 'Cash taken out.');
