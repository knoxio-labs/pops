/**
 * Canonical dedup identity for imported bank transactions.
 *
 * The dedup key is built from stable, bank-agnostic fields — the account,
 * date, amount, normalized description, and the bank's own reference/id —
 * NOT the raw CSV row. Hashing the raw row (the pre-#3611 behaviour) let two
 * exports of the same charge that differ only in a free-text column (e.g. a
 * cardholder Address) produce different checksums and both insert,
 * double-counting the charge. Deriving the key from canonical fields
 * collapses those exports to a single identity.
 *
 * `accountId` scopes that identity to the REAL account the row was imported
 * for. Without it, two accounts could never legitimately hold an identical
 * row (the same subscription billed to two cards on the same day collapses
 * to one), and a bank that lands counterpart legs on the same date/amount but
 * a different account (e.g. an internal transfer) could collide with the leg
 * it is paired with.
 *
 * POPS-2773 first scoped this key, but to the bank/dialect label
 * (`BankType`, e.g. `"Amex"`) rather than the real `accounts.id` — the wizard
 * had no real account at parse time, only the dialect picked to select a CSV
 * parser, so the id was not available to this pure, network-free function.
 * That was wrong the moment two real accounts could share one dialect (two
 * ANZ cards): identical rows on both would incorrectly collide as
 * duplicates. POPS-2840 gives the wizard a real `accountId` before parsing
 * even starts (the account-step is now step 1), which is what let POPS-2852
 * key this on the id directly instead.
 *
 * This module is the SINGLE source of truth for that key: the browser parser
 * (`column-map/validation.ts`) hashes it for new imports, and the re-key
 * migration (`migrations/0089_scope_dedup_key_to_account_id.sql`, via the
 * `finance_account_id_scoped_checksum` SQLite function) hashes it to
 * re-derive the checksum of every existing row from its stored `account_id`.
 * Both sides MUST agree byte-for-byte, so the key-building logic lives here
 * and nowhere else. It is pure (no crypto) and browser-safe; each side
 * applies its own SHA-256 (crypto-js in the browser, `node:crypto` in the
 * migration function), which produce identical digests for identical input
 * strings.
 *
 * `buildLegacyDedupKeyFromStoredRow` is a frozen copy of the pre-account key
 * (date + amount + normalized description + reference, no account), kept
 * solely so migration `0059_recompute_canonical_checksum` — which calls it
 * via the still-registered 4-argument `finance_canonical_checksum` SQLite
 * function — continues to produce byte-identical output when it replays on a
 * fresh install. Its output is immediately superseded by `0087`'s and then
 * `0089`'s recompute, so it is never the current canonical key; do not use it
 * for anything new. `0087`'s own dialect-scoped key is likewise frozen once
 * `0089` supersedes it — nothing new should build that shape either.
 *
 * Dedup normalization is intentionally minimal (case + whitespace only) and
 * preserves digits and punctuation. It must NOT reuse the fuzzy entity-matching
 * normalizer, which strips all digits: for reference-less banks (ANZ/ING) the
 * description is the only distinguishing field, so two genuinely distinct
 * same-day, same-amount charges that differ only in embedded numbers (terminal
 * id, card suffix — e.g. `EFTPOS 4821 COLES` vs `EFTPOS 7734 COLES`) must keep
 * distinct keys, or a real charge is silently dropped as a duplicate. Excluding
 * the free-text columns (Address) — which is what deriving from canonical
 * fields already does — is what defeats the re-export double-count; digit
 * stripping is not needed and is unsafe for a ledger.
 */

/**
 * Minimal, digit-preserving normalization for the dedup key: lowercase and
 * collapse runs of whitespace. Distinct embedded numbers stay distinct.
 */
export function normalizeDedupDescription(description: string): string {
  return description.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Header substrings (lowercased) that identify the bank's own reference/id
 * column, in priority order. A stable per-transaction reference is the
 * strongest dedup signal; a bare per-export row number is deliberately NOT
 * matched, as it varies between exports of the same charge and would defeat
 * dedup.
 */
const REFERENCE_HEADER_PATTERNS = [
  'reference',
  'transaction id',
  'receipt',
  'ref no',
  'ref number',
] as const;

/**
 * A NUL byte separates the dedup key's fields. Bank CSV values never contain
 * one, so it is an unambiguous, collision-free field boundary (a printable
 * separator like `|` could appear inside a description and shift boundaries).
 */
const DEDUP_KEY_SEPARATOR = String.fromCharCode(0);

/** Find the reference/id header among a row's headers, or `undefined`. */
export function findReferenceHeader(headers: string[]): string | undefined {
  for (const pattern of REFERENCE_HEADER_PATTERNS) {
    const match = headers.find((header) => header.toLowerCase().includes(pattern));
    if (match) return match;
  }
  return undefined;
}

/** Read the reference/id value from a parsed CSV row; `''` when absent. */
export function extractReferenceValue(row: Record<string, unknown>): string {
  const header = findReferenceHeader(Object.keys(row));
  if (header === undefined) return '';
  const value = row[header];
  return (typeof value === 'string' ? value : String(value ?? '')).trim();
}

/** Canonical fields that identify an imported transaction for dedup. */
export interface ImportDedupFields {
  /** The real `accounts.id` the row was imported for (see module docs). */
  accountId: string;
  date: string;
  amount: number;
  description: string;
  reference?: string;
}

/** Build the canonical dedup key from already-parsed transaction fields. */
export function buildImportDedupKey(fields: ImportDedupFields): string {
  return [
    fields.accountId,
    fields.date,
    String(fields.amount),
    normalizeDedupDescription(fields.description),
    (fields.reference ?? '').trim(),
  ].join(DEDUP_KEY_SEPARATOR);
}

function parseReferenceFromRawRow(rawRow: string | null): string {
  if (!rawRow) return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawRow);
  } catch {
    return '';
  }
  if (parsed === null || typeof parsed !== 'object') return '';
  const row: Record<string, unknown> = { ...parsed };
  return extractReferenceValue(row);
}

/**
 * Build the canonical dedup key for a persisted transaction, extracting the
 * reference from its stored `raw_row` JSON. Used by the `0089` re-key
 * migration to recompute checksums from the same fields a fresh import would
 * hash, now scoped to `accountId` (`transactions.account_id`).
 */
export function buildImportDedupKeyFromStoredRow(input: {
  accountId: string;
  date: string;
  amount: number;
  description: string;
  rawRow: string | null;
}): string {
  return buildImportDedupKey({
    accountId: input.accountId,
    date: input.date,
    amount: input.amount,
    description: input.description,
    reference: parseReferenceFromRawRow(input.rawRow),
  });
}

/**
 * Frozen pre-account dedup key (date + amount + normalized description +
 * reference). See the module doc comment: this exists ONLY so migration
 * `0059_recompute_canonical_checksum`, replayed via the 4-argument
 * `finance_canonical_checksum` SQLite function, keeps producing the exact
 * output it always has on a fresh install. Never call this for anything new —
 * use {@link buildImportDedupKeyFromStoredRow}.
 */
export function buildLegacyDedupKeyFromStoredRow(input: {
  date: string;
  amount: number;
  description: string;
  rawRow: string | null;
}): string {
  return [
    input.date,
    String(input.amount),
    normalizeDedupDescription(input.description),
    parseReferenceFromRawRow(input.rawRow),
  ].join(DEDUP_KEY_SEPARATOR);
}
