/**
 * Measures how *complete* the ledger's tags are, as opposed to how correct
 * (POPS-2607).
 *
 * The 2026-08-28 namespace migration made every stored tag valid; it could not
 * make it present. The old flat vocabulary never asserted most facets, so the
 * relabel had nothing to relabel and 68% of the ledger came out of it with no
 * `occasion:` at all. A missing facet and a negative one are indistinguishable
 * in a query — "spend where `occasion:out`" silently drops every row that never
 * asserted an occasion — so the gap has to be measured before it can be closed,
 * and re-measured after every future import.
 *
 * Applicability is read off `type`, never off a tag. `venue:`, `occasion:` and
 * `contains:` describe money spent ON something, so they apply exactly to the
 * spend types and to nothing else — a transfer was not spent on anything, and a
 * fee was a cost of the account rather than of a category (POPS-2610). The
 * alternative was an `occasion:admin` tag restating what `type` already says,
 * which was rejected: `type` is set by the importer from the descriptor on every
 * future import with nobody in the loop, whereas a tag needs a human to remember
 * forever — and it was already failing on 21 of the 38 non-spend rows it was
 * supposed to cover. So on a spend row a missing facet always means "not yet
 * decided", and on a non-spend row the facet simply does not apply.
 *
 * This module only counts. It writes nothing and decides nothing.
 */
import { isSpendType } from '../../contract/corrections-constants.js';
import { transactions } from '../schema.js';
import {
  CLOSED_TAG_FACETS,
  parseStoredTags,
  TAG_FACET_SEPARATOR,
  type ClosedTagFacet,
} from '../tag-facets.js';

import type { FinanceDb } from './internal.js';

/** Marks a row whose contents the merchant does not determine (Amazon, IKEA). */
const ENRICH_PREFIX = `enrich${TAG_FACET_SEPARATOR}`;

/**
 * Which rows a facet is expected on.
 *
 * `enrich:` excludes everywhere: the row is explicitly waiting on an enrichment
 * provider to say what it contains, and asserting a facet over it now would be
 * a guess recorded as a fact.
 *
 * `spendOnly` carries the applicability rule above. It is true for the three
 * facets POPS-2607 requires and false for `channel:`/`fee:`, which are measured
 * over the whole ledger because a fee's kind is precisely what a non-spend row
 * has to say.
 */
interface FacetExpectation {
  facet: ClosedTagFacet;
  /** Whether POPS-2607's acceptance criteria require this facet to be present. */
  required: boolean;
  /** Whether the facet applies only to rows whose `type` counts as spend. */
  spendOnly: boolean;
}

const REQUIRED_FACETS = new Set<string>(['venue', 'occasion', 'contains']);

const FACET_EXPECTATIONS: readonly FacetExpectation[] = CLOSED_TAG_FACETS.map((closed) => ({
  facet: closed.facet,
  required: REQUIRED_FACETS.has(closed.facet),
  spendOnly: REQUIRED_FACETS.has(closed.facet),
}));

/** Coverage of one closed facet across the ledger. */
export interface FacetCoverage {
  facet: ClosedTagFacet;
  /** True when POPS-2607's acceptance criteria require this facet. */
  required: boolean;
  /** Rows the facet is expected on, after the exclusions below. */
  addressable: number;
  /** Addressable rows carrying at least one value on the facet. */
  covered: number;
  /** Addressable rows carrying none — the work remaining. */
  missing: number;
  /** Rows excluded because they carry an `enrich:` marker. */
  enrichExcluded: number;
  /** Rows excluded because their `type` is not spend — the facet cannot apply. */
  nonSpendExcluded: number;
  /**
   * Addressable rows carrying more than one value on a single-valued facet.
   *
   * Cardinality binds the write path only, so these are stored rows that
   * predate the constraint (POPS-2606) and are this ticket's cleanup. Always
   * zero on a multi-valued facet.
   */
  cardinalityViolations: number;
}

/** A repeated descriptor with a gap — one tag rule, not one decision each. */
export interface DescriptorGap {
  description: string;
  /** How many transactions share this descriptor. */
  transactions: number;
  /** Required facets absent from at least one of those transactions. */
  missingFacets: ClosedTagFacet[];
}

/** A stored tag that is not an active vocabulary row. */
export interface UnknownTagUsage {
  tag: string;
  transactions: number;
}

/** The whole picture, for a before/after record on the ticket. */
export interface TagCoverage {
  /** Rows scanned. */
  transactions: number;
  facets: FacetCoverage[];
  /** `tags` → how many transactions carry exactly that many. Ascending, dense. */
  tagCountHistogram: { tags: number; transactions: number }[];
  /** Tags stored on a transaction but absent from the active vocabulary. */
  outsideVocabulary: UnknownTagUsage[];
  /** Descriptors with a gap, most frequent first — the rule-writing worklist. */
  gaps: DescriptorGap[];
}

interface ScannedRow {
  description: string;
  type: string;
  tags: string[];
}

function valuesOnFacet(tags: string[], facet: string): number {
  const prefix = `${facet}${TAG_FACET_SEPARATOR}`;
  return tags.filter((tag) => tag.startsWith(prefix)).length;
}

function isEnrichBlocked(tags: string[]): boolean {
  return tags.some((tag) => tag.startsWith(ENRICH_PREFIX));
}

/** Is `facet` expected on this row, or outside its addressable set? */
function isAddressable(expectation: FacetExpectation, row: ScannedRow): boolean {
  if (isEnrichBlocked(row.tags)) return false;
  return !(expectation.spendOnly && !isSpendType(row.type));
}

function measureFacet(
  expectation: FacetExpectation,
  rows: ScannedRow[],
  single: boolean
): FacetCoverage {
  const coverage: FacetCoverage = {
    facet: expectation.facet,
    required: expectation.required,
    addressable: 0,
    covered: 0,
    missing: 0,
    enrichExcluded: 0,
    nonSpendExcluded: 0,
    cardinalityViolations: 0,
  };

  for (const row of rows) {
    const { tags } = row;
    if (isEnrichBlocked(tags)) {
      coverage.enrichExcluded += 1;
      continue;
    }
    if (expectation.spendOnly && !isSpendType(row.type)) {
      coverage.nonSpendExcluded += 1;
      continue;
    }
    coverage.addressable += 1;
    const values = valuesOnFacet(tags, expectation.facet);
    if (values === 0) coverage.missing += 1;
    else coverage.covered += 1;
    if (single && values > 1) coverage.cardinalityViolations += 1;
  }

  return coverage;
}

function buildHistogram(rows: ScannedRow[]): { tags: number; transactions: number }[] {
  const counts = new Map<number, number>();
  for (const row of rows) counts.set(row.tags.length, (counts.get(row.tags.length) ?? 0) + 1);
  const highest = Math.max(-1, ...counts.keys());
  const histogram: { tags: number; transactions: number }[] = [];
  for (let tags = 0; tags <= highest; tags += 1) {
    histogram.push({ tags, transactions: counts.get(tags) ?? 0 });
  }
  return histogram;
}

function buildUnknownTagUsage(rows: ScannedRow[], vocabulary: Set<string>): UnknownTagUsage[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of new Set(row.tags)) {
      if (vocabulary.has(tag)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, transactions: count }))
    .toSorted((a, b) => b.transactions - a.transactions || a.tag.localeCompare(b.tag));
}

/**
 * Group the gaps by descriptor, so the worklist is one line per rule to write
 * rather than one line per row to review. A descriptor is listed when any of
 * its rows is missing a required facet it is addressable for.
 */
function buildGaps(rows: ScannedRow[]): DescriptorGap[] {
  const byDescription = new Map<string, { transactions: number; missing: Set<ClosedTagFacet> }>();

  for (const row of rows) {
    let entry = byDescription.get(row.description);
    if (!entry) {
      entry = { transactions: 0, missing: new Set<ClosedTagFacet>() };
      byDescription.set(row.description, entry);
    }
    entry.transactions += 1;
    for (const expectation of FACET_EXPECTATIONS) {
      if (!expectation.required) continue;
      if (!isAddressable(expectation, row)) continue;
      if (valuesOnFacet(row.tags, expectation.facet) === 0) entry.missing.add(expectation.facet);
    }
  }

  return [...byDescription.entries()]
    .filter(([, entry]) => entry.missing.size > 0)
    .map(([description, entry]) => ({
      description,
      transactions: entry.transactions,
      missingFacets: [...entry.missing].toSorted((a, b) => a.localeCompare(b)),
    }))
    .toSorted(
      (a, b) => b.transactions - a.transactions || a.description.localeCompare(b.description)
    );
}

/**
 * Measure facet coverage over every transaction in the ledger.
 *
 * `activeVocabulary` is passed in rather than read here so the caller decides
 * what "active" means — the audit script reads the live table, a test supplies
 * a fixture — and so this stays a pure count over two inputs.
 */
export function measureTagCoverage(db: FinanceDb, activeVocabulary: string[]): TagCoverage {
  const rows: ScannedRow[] = db
    .select({
      description: transactions.description,
      type: transactions.type,
      tags: transactions.tags,
    })
    .from(transactions)
    .all()
    .map((row) => ({
      description: row.description,
      type: row.type,
      tags: parseStoredTags(row.tags),
    }));

  const singleByFacet = new Map<string, boolean>(
    CLOSED_TAG_FACETS.map((closed) => [closed.facet, closed.single])
  );

  return {
    transactions: rows.length,
    facets: FACET_EXPECTATIONS.map((expectation) =>
      measureFacet(expectation, rows, singleByFacet.get(expectation.facet) === true)
    ),
    tagCountHistogram: buildHistogram(rows),
    outsideVocabulary: buildUnknownTagUsage(rows, new Set(activeVocabulary)),
    gaps: buildGaps(rows),
  };
}

/**
 * True when every acceptance criterion POPS-2607 states as a count is met:
 * no required facet missing, no stored cardinality violation, no tag outside
 * the active vocabulary. Lets the audit script gate rather than only report.
 */
export function isCoverageComplete(coverage: TagCoverage): boolean {
  if (coverage.outsideVocabulary.length > 0) return false;
  return coverage.facets.every(
    (facet) => facet.cardinalityViolations === 0 && (!facet.required || facet.missing === 0)
  );
}
