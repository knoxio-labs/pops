/**
 * The descriptions as the real migration chain leaves them.
 *
 * The 0104 unit test seeds its own pre-migration rows, so it proves the SQL
 * works against a database it constructed. This proves it worked against the
 * one the journal actually builds: an UPDATE keyed on a tag the seed spells
 * differently would pass there and leave the value undescribed here, which is
 * the same silent bare-list prompt POPS-3285 exists to remove.
 */
import { describe, expect, it } from 'vitest';

import {
  listClassifiedVocabulary,
  listVocabularyDescriptions,
} from '../services/tag-vocabulary.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

describe('seeded tag descriptions', () => {
  it('describes every active occasion value the migrated vocabulary holds', () => {
    const { db, raw } = freshMigratedFinanceDb();
    const descriptions = listVocabularyDescriptions(db);
    const active = raw
      .prepare("SELECT tag FROM tag_vocabulary WHERE facet = 'occasion' AND is_active = 1")
      .all() as { tag: string }[];

    expect(active.length).toBeGreaterThan(0);
    for (const { tag } of active) {
      expect(descriptions.get(tag), `${tag} has no description`).toEqual(expect.any(String));
    }
  });

  it('holds every value 0105 writes onto a row, correctly described', () => {
    const { raw } = freshMigratedFinanceDb();
    const written = raw
      .prepare(
        "SELECT tag, kind, description FROM tag_vocabulary WHERE tag IN ('venue:hardware', 'occasion:health')"
      )
      .all() as { tag: string; kind: string; description: string | null }[];

    expect(written.toSorted((a, b) => a.tag.localeCompare(b.tag))).toEqual([
      {
        tag: 'occasion:health',
        kind: 'open',
        description:
          'Spent on health: a pharmacy, a doctor or dentist, medicines, supplements, treatment.',
      },
      {
        tag: 'venue:hardware',
        kind: 'open',
        description: 'A hardware, tool or building-supplies store.',
      },
    ]);
  });

  it('leaves values it does not name undescribed, so the column stays optional', () => {
    const { db, raw } = freshMigratedFinanceDb();
    const descriptions = listVocabularyDescriptions(db);
    const active = raw
      .prepare('SELECT COUNT(*) AS n FROM tag_vocabulary WHERE is_active = 1')
      .get() as { n: number };

    expect(descriptions.size).toBeGreaterThan(0);
    expect(descriptions.size).toBeLessThan(active.n);
  });
});

/**
 * The classified vocabulary the migration chain produces, pinned.
 *
 * Not a restatement of the migrations for its own sake. Before POPS-3301 the
 * live database held eighteen classified values this chain did not, so a
 * value was seeded in the schema and missing in practice depending on which
 * copy you opened. Pinning the list makes adding one an edit somebody has to
 * make on purpose, in the same change as the migration that seeds it. `venue`
 * and `occasion` became `open` facets in POPS-3951, so this list — every
 * seeded value, whatever its kind — is unaffected by that change; only the
 * kind assertion below is.
 */
describe('the seeded classified vocabulary', () => {
  const EXPECTED = [
    'channel:in-person',
    'channel:online',
    'contains:accommodation',
    'contains:alcohol',
    'contains:bubble-tea',
    'contains:car-rental',
    'contains:charging',
    'contains:clothing',
    'contains:coffee',
    'contains:donations',
    'contains:education',
    'contains:entry',
    'contains:events',
    'contains:fast-food',
    'contains:fitness',
    'contains:flight',
    'contains:food',
    'contains:fuel',
    'contains:games',
    'contains:gift',
    'contains:gift-card',
    'contains:groceries',
    'contains:haircut',
    'contains:health',
    'contains:household',
    'contains:ice-cream',
    'contains:insurance',
    'contains:internet',
    'contains:maintenance',
    'contains:mobile',
    'contains:mortgage',
    'contains:office-supplies',
    'contains:parking',
    'contains:party-supplies',
    'contains:public-transport',
    'contains:rent',
    'contains:rideshare',
    'contains:salary',
    'contains:sale',
    'contains:software',
    'contains:streaming',
    'contains:subscription',
    'contains:taxes',
    'contains:tolls',
    'contains:utilities',
    'contains:withdrawal',
    'fee:account-keeping',
    'fee:atm',
    'fee:conversion',
    'fee:interest',
    'fee:late',
    'fee:membership',
    'fee:surcharge',
    'hobby:brewing',
    'occasion:health',
    'occasion:home',
    'occasion:out',
    'occasion:travel',
    'occasion:work',
    'tax:deductible',
    'tax:novated-lease',
    'venue:arcade',
    'venue:attraction',
    'venue:bakery',
    'venue:bottle-shop',
    'venue:butcher',
    'venue:cafe',
    'venue:cinema',
    'venue:clothing',
    'venue:club',
    'venue:convenience-store',
    'venue:electronics',
    'venue:gift-shop',
    'venue:gym',
    'venue:hardware',
    'venue:homewares',
    'venue:mechanic',
    'venue:parking',
    'venue:pharmacy',
    'venue:pub',
    'venue:restaurant',
    'venue:sauna',
    'venue:service-station',
    'venue:sex-shop',
    'venue:shopping-centre',
    'venue:supermarket',
    'venue:takeaway',
    'venue:transport',
    'venue:vending-machine',
  ];

  it('holds exactly the values the chain is meant to seed', () => {
    const { db } = freshMigratedFinanceDb();

    expect(listClassifiedVocabulary(db).toSorted()).toEqual(EXPECTED);
    expect(EXPECTED).toHaveLength(89);
  });

  it('gives every closed-facet value the closed kind', () => {
    const { raw } = freshMigratedFinanceDb();
    const wrong = raw
      .prepare(
        "SELECT tag, kind FROM tag_vocabulary WHERE facet IN ('channel','fee') AND kind <> 'closed'"
      )
      .all();

    expect(wrong).toEqual([]);
  });

  it('gives every open-facet value the open kind (POPS-3951)', () => {
    const { raw } = freshMigratedFinanceDb();
    const wrong = raw
      .prepare(
        "SELECT tag, kind FROM tag_vocabulary WHERE facet IN ('venue','occasion') AND kind <> 'open'"
      )
      .all();

    expect(wrong).toEqual([]);
  });

  it('pins the active unclassified values too, so a personal one cannot be added quietly', () => {
    const { raw } = freshMigratedFinanceDb();
    const unclassified = (
      raw
        .prepare(
          "SELECT tag FROM tag_vocabulary WHERE facet NOT IN ('venue','occasion','contains','channel','fee','hobby','tax') AND is_active = 1 ORDER BY tag"
        )
        .all() as { tag: string }[]
    ).map((row) => row.tag);

    // Pinning the active list is what stops a future migration from adding a
    // personal value back in without somebody deciding to.
    expect(unclassified).toEqual([
      'enrich:amazon',
      'enrich:apple',
      'enrich:bigw',
      'enrich:bunnings',
      'enrich:good-guys',
      'enrich:ikea',
      'enrich:kmart',
      'enrich:paylab',
      'enrich:paypal',
      'flag:needs-review',
    ]);
  });
});

/**
 * `trip` and `person` are open/marker facets a human mints at runtime — a
 * specific trip or a specific person's name is never something a checked-in
 * migration should offer as active vocabulary. Unlike `asset`, `hobby` and
 * `tax`, which can legitimately carry a generic value (`tax:deductible`),
 * nothing on either of these two facets is meant to be active out of the box.
 */
describe('the seed carries no active personal-facet rows', () => {
  it('seeds no active trip or person value', () => {
    const { raw } = freshMigratedFinanceDb();
    const rows = raw
      .prepare("SELECT tag FROM tag_vocabulary WHERE facet IN ('trip', 'person') AND is_active = 1")
      .all() as { tag: string }[];

    expect(rows).toEqual([]);
  });
});
