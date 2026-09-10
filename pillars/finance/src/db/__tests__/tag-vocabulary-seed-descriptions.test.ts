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

import { listVocabularyDescriptions } from '../services/tag-vocabulary.js';
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

  it('holds every value 0105 writes onto a row, so none lands outside the closed set', () => {
    const { raw } = freshMigratedFinanceDb();
    const written = raw
      .prepare(
        "SELECT tag, kind, description FROM tag_vocabulary WHERE tag IN ('venue:hardware', 'occasion:health')"
      )
      .all() as { tag: string; kind: string; description: string | null }[];

    expect(written.toSorted((a, b) => a.tag.localeCompare(b.tag))).toEqual([
      {
        tag: 'occasion:health',
        kind: 'closed',
        description:
          'Spent on health: a pharmacy, a doctor or dentist, medicines, supplements, treatment.',
      },
      {
        tag: 'venue:hardware',
        kind: 'closed',
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
