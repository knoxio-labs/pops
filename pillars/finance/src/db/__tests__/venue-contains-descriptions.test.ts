/**
 * The definitions 0111 writes, as the real migration chain leaves them
 * (POPS-3672).
 *
 * An UPDATE keyed on a tag the vocabulary spells differently succeeds and
 * changes nothing, which would leave the value exactly as undescribed as
 * before — the bare-list prompt this migration exists to remove, with a passing
 * migration run on top of it. So this reads the descriptions back from a
 * database built by the journal rather than trusting the SQL.
 */
import { describe, expect, it } from 'vitest';

import { listVocabularyDescriptions } from '../services/tag-vocabulary.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

/** Every venue the ledger uses. gift-shop has no rows and is POPS-3689's; attraction has none either, but 0106 described it. */
const DESCRIBED_VENUES = [
  'venue:arcade',
  'venue:auto',
  'venue:bakery',
  'venue:bottle-shop',
  'venue:butcher',
  'venue:cafe',
  'venue:cinema',
  'venue:club',
  'venue:clothing',
  'venue:convenience-store',
  'venue:electronics',
  'venue:hardware',
  'venue:homewares',
  'venue:parking',
  'venue:pharmacy',
  'venue:pub',
  'venue:restaurant',
  'venue:sauna',
  'venue:sex-shop',
  'venue:shopping-centre',
  'venue:supermarket',
  'venue:takeaway',
  'venue:transport',
  'venue:vending-machine',
];

/** The contains values the ledger draws inconsistently. */
const CONTESTED_CONTAINS = [
  'contains:bubble-tea',
  'contains:coffee',
  'contains:fast-food',
  'contains:haircut',
  'contains:ice-cream',
  'contains:parking',
  'contains:streaming',
];

describe('0111 venue and contains descriptions', () => {
  it('leaves every venue the ledger uses described', () => {
    const descriptions = listVocabularyDescriptions(freshMigratedFinanceDb().db);

    for (const tag of DESCRIBED_VENUES) {
      expect(descriptions.get(tag), `${tag} has no description`).toEqual(expect.any(String));
    }
  });

  it('describes every venue the vocabulary holds except gift-shop, which no row has ever used', () => {
    const { db, raw } = freshMigratedFinanceDb();
    const descriptions = listVocabularyDescriptions(db);
    const undescribed = (
      raw
        .prepare(
          "SELECT tag FROM tag_vocabulary WHERE facet = 'venue' AND is_active = 1 ORDER BY tag"
        )
        .all() as { tag: string }[]
    )
      .map((row) => row.tag)
      .filter((tag) => !descriptions.has(tag));

    expect(undescribed).toEqual(['venue:gift-shop']);
  });

  it('leaves every contested contains value described', () => {
    const descriptions = listVocabularyDescriptions(freshMigratedFinanceDb().db);

    for (const tag of CONTESTED_CONTAINS) {
      expect(descriptions.get(tag), `${tag} has no description`).toEqual(expect.any(String));
    }
  });

  it('separates the two venues the ledger most often confuses, in both directions', () => {
    const descriptions = listVocabularyDescriptions(freshMigratedFinanceDb().db);

    expect(descriptions.get('venue:pub')).toMatch(/Not a nightclub/);
    expect(descriptions.get('venue:club')).toMatch(/Not a pub/);
  });

  it('tells a gym apart from a club and a sauna, pending a gym value (POPS-3689)', () => {
    const descriptions = listVocabularyDescriptions(freshMigratedFinanceDb().db);

    expect(descriptions.get('venue:club')).toMatch(/gym/);
    expect(descriptions.get('venue:sauna')).toMatch(/Not a gym/);
  });

  it('makes restaurant and takeaway mutually exclusive, which single-valued venue requires', () => {
    expect(listVocabularyDescriptions(freshMigratedFinanceDb().db).get('venue:restaurant')).toMatch(
      /never both/
    );
  });

  it('keeps every description within the prompt field cap, so none is truncated mid-sentence', () => {
    const descriptions = listVocabularyDescriptions(freshMigratedFinanceDb().db);

    for (const tag of [...DESCRIBED_VENUES, ...CONTESTED_CONTAINS]) {
      expect((descriptions.get(tag) ?? '').length, `${tag} exceeds 200 chars`).toBeLessThanOrEqual(
        200
      );
    }
  });
});
