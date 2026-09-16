/**
 * Standing invariant: on a database the migration chain builds, every
 * vocabulary row on a recognised facet has the kind `TAG_FACET_KINDS` gives
 * that facet (POPS-3744).
 *
 * `kind` is stored per row but is policy per facet, so the two can drift: a
 * migration that moves a facet's kind but misses rows, or a seed whose
 * `INSERT OR IGNORE` skips a row that already exists. A row on a facet the map
 * does not know, or with no facet, is not covered: nothing defines its kind.
 */
import { isNotNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { tagVocabulary } from '../schema.js';
import { TAG_FACETS } from '../tag-facets.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

const EXPECTED_KIND = new Map(TAG_FACETS.map(({ facet, kind }) => [facet, kind]));

describe('tag_vocabulary kind invariant', () => {
  it('gives every row on a recognised facet the kind TAG_FACET_KINDS names', () => {
    const { db } = freshMigratedFinanceDb();
    const rows = db
      .select({ tag: tagVocabulary.tag, facet: tagVocabulary.facet, kind: tagVocabulary.kind })
      .from(tagVocabulary)
      .where(isNotNull(tagVocabulary.facet))
      .all();

    const checked = rows.filter((row) => row.facet !== null && EXPECTED_KIND.has(row.facet));
    const offending = checked
      .filter((row) => row.facet !== null && EXPECTED_KIND.get(row.facet) !== row.kind)
      .map((row) => `${row.tag} is ${row.kind}, expected ${EXPECTED_KIND.get(row.facet ?? '')}`);

    expect(checked.length).toBeGreaterThan(0);
    expect(offending).toEqual([]);
  });
});
