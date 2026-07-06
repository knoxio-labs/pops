# Deduplication & CSV Parsing

> Status: Partial. Checksum dedup and the generic CSV column-mapping flow are shipped. Per-bank parsers (Amex/ANZ/ING sign + account logic, ANZ PDF) and Up Bank API import are NOT built — see `docs/ideas/per-bank-parsers.md` and `docs/ideas/up-bank-api-import.md`.

Prepare uploaded transactions for the matching engine: parse a CSV into a common shape and drop rows already in the database. Dedup makes re-importing the same file idempotent.

## CSV parsing (frontend)

The importer is bank-agnostic in its parsing. The browser parses the CSV (Papa Parse, `header: true`), the user maps columns, and each row is normalised to a `ParsedTransaction`. There are no per-bank backend parsers, but the bank selected in step 1 now sets each row's `account` (#3608); per-bank sign/column logic is still deferred to the ideas file.

Flow: upload step parses the file to `{ headers, rows }` → column-map step auto-detects columns and lets the user override → validation builds `ParsedTransaction[]` → the array is POSTed to `/imports/process`.

**Column mapping** (`column-map/parsers.ts`):

- `autoDetectColumns(headers)` matches headers case-insensitively: date ← `date`/`transaction date`/`posting date`; description ← `description`/`merchant`/`payee`; amount ← `amount`/`debit`/`credit`/`value`; location ← `town`/`city`/`location` (optional).
- Required fields: Date, Description, Amount. Location is optional.

**Transformations** (one generic set, applied to every row):

- `parseDate(s)`: `DD/MM/YYYY` → `YYYY-MM-DD`, zero-padding day/month; returns `null` on anything that is not three slash-separated parts.
- `parseAmount(s)`: strip everything except digits/`.`/`-`, `parseFloat`, then **negate** (`-amount`); returns `null` on `NaN`.
- `extractLocation(s)`: first line of a multiline value, trimmed and title-cased; `undefined` when empty.

**Per-row validation** (`column-map/validation.ts`) builds:

```
ParsedTransaction = {
  date, description, amount, account,
  location?, rawRow, checksum
}
```

- `rawRow` = `JSON.stringify(row)` (the full original CSV row, preserved for audit/AI context).
- `checksum` = `SHA256` (`crypto-js`) of the **canonical dedup key** — `date` + `amount` + `normalizeDedupDescription(description)` + the bank reference/id column (`buildImportDedupKey` / `findReferenceHeader`, `@pops/finance`) — NOT the raw row, so a re-export differing only in a free-text column still dedupes (#3611). The dedup normalizer lowercases and collapses whitespace but **preserves digits** — it is deliberately NOT the fuzzy entity-matching normalizer (see edge cases).
- `account` = the bank selected in step 1 (`bankType`: ANZ / Amex / ING / Up), threaded through `validateAllRows` and the `/imports/process` body (#3608) — no longer the hardcoded `"Amex"`.

## Deduplication (backend)

The wire receives already-parsed `ParsedTransaction[]`; the pillar owns no CSV/PDF transformers. `/imports/process` partitions the batch by checksum before any entity matching.

- `findExistingChecksums(db, checksums)` (`db/services/imports.ts`): batches the checksum list in groups of **500** (`SQLITE_MAX_VARIABLE_NUMBER` headroom) and runs `SELECT checksum FROM transactions WHERE checksum IN (...)` per batch, returning the set of checksums that already exist. Empty input short-circuits with no query.
- Duplicates → `skipped` bucket with `entity.matchType: 'none'`, `status: 'skipped'`, `skipReason: 'Duplicate transaction (checksum match)'`.
- New rows → proceed to entity matching.

### Data model

`transactions.checksum text` with `index('idx_transactions_checksum')` (non-unique). Uniqueness was removed with the canonical re-key (#3611): two exports of one charge now collapse to the same checksum and must coexist until the Phase-D duplicate cleanup, so dedup is enforced in-process by `findExistingChecksums`, never by the index. `rawRow` is persisted alongside for audit/AI context. Location lives as a normal value on the transaction — there is no online/in-person field; online-vs-in-person, when wanted, is a tag via `transaction_tag_rules`.

Migration `0059_recompute_canonical_checksum` re-keys existing rows: it drops the old unique index, recomputes every non-null checksum via the `finance_canonical_checksum` SQLite function (which derives the same key the browser hashes), and re-creates `idx_transactions_checksum` as a plain index. It does NOT delete duplicate rows — that prod cleanup is a separate Phase-D task.

### Why the canonical key works

The dedup identity is the stable, bank-agnostic tuple — date, amount, `normalizeDedupDescription(description)` (lowercase + collapse whitespace, **digits preserved**), and the bank's own reference/id — so two exports of the same charge that differ only in a free-text column (e.g. a cardholder Address) hash identically and dedupe. Hashing the whole raw row (the pre-#3611 behaviour) let such exports produce different checksums and double-insert.

**Why digits are preserved (deliberate, for a money path).** The dedup normalizer is intentionally minimal and does NOT reuse `normalizeDescription`, the fuzzy entity-matching normalizer, which strips all digits. Excluding the free-text columns is already what defeats the re-export double-count; digit stripping is unnecessary and unsafe here. For reference-less banks (ANZ/ING typically have no per-transaction reference column) the description is the only distinguishing field, so two genuinely distinct same-day, same-amount charges differing only in embedded numbers (`EFTPOS 4821 COLES` vs `EFTPOS 7734 COLES`) must keep distinct checksums — collapsing them would silently drop a real charge as a duplicate (under-counting spend), the inverse of the bug #3611 fixes. When a reference column exists it is the authoritative signal; digit preservation only matters for the reference-less case.

## REST surface

- `POST /imports/process` — body `{ transactions: ParsedTransaction[], account }`; dedups by checksum, runs entity matching on the survivors, returns `{ sessionId }` to poll. Background work; FE polls `GET /imports/progress?sessionId`.
- `POST /webhooks/up` / `POST /webhooks/up/ping` — Up Bank webhook endpoints (raw Express, HMAC-signature-verified). Currently log-only; persistence is deferred (ideas file).

## Business rules

- Dedup is enforced in-process by `findExistingChecksums` (a checksum-`IN` probe); `idx_transactions_checksum` is a non-unique index that only accelerates that probe (the canonical re-key means known duplicates legitimately share a checksum).
- Re-importing the same CSV skips every row — import is idempotent.
- Rows that fail to parse (bad date/amount, or unmapped required columns) are reported as validation errors in the column-map step; the first 10 are surfaced.
- `rawRow` is preserved verbatim for audit and AI context.

## Edge cases

| Case                                                               | Behaviour                                                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Bank changes CSV format                                            | Auto-detect may miss columns; user remaps manually, or rows fail validation and show as errors in step 2 |
| Manual CSV edit (amount changed)                                   | Amount is part of the canonical key → different checksum → treated as a new transaction                  |
| Reference-less bank, two charges differing only in embedded digits | Digits are preserved in the dedup key → different checksums → both kept (no silent under-count)          |
| Same amount + day, different merchant                              | Different normalized descriptions → different checksums → no false dedup                                 |
| Re-export differing only in a free-text column                     | Canonical key ignores non-key columns → same checksum → deduped (#3611)                                  |
| Transaction with a null checksum already in DB                     | Ignored by `findExistingChecksums` (only non-null checksums match)                                       |
| > 500 transactions in one import                                   | Checksum probe batches at 500 to stay under the SQLite variable limit                                    |

## Acceptance criteria

- [x] Each `ParsedTransaction` carries `SHA256` of the canonical dedup key (`buildImportDedupKey`: date + amount + normalized description + bank reference), NOT the raw row, so a re-export differing only in a free-text column dedupes (#3611).
- [x] The parsed `account` is the bank selected in step 1 (`bankType`), threaded through `validateAllRows` and the `/imports/process` body — never the hardcoded "Amex" (#3608).
- [x] `findExistingChecksums` batches the IN-list at 500 and returns only checksums already present; empty input returns an empty set without querying; null-checksum rows are ignored.
- [x] Duplicate rows land in the `skipped` bucket with reason `"Duplicate transaction (checksum match)"`; new rows continue to entity matching.
- [x] `transactions.checksum` has a non-unique index (`idx_transactions_checksum`); migration `0059_recompute_canonical_checksum` drops the old unique index, recomputes every stored checksum to the canonical key via `finance_canonical_checksum`, and re-creates the index non-unique (duplicate rows are re-keyed, not deleted — Phase-D cleanup is separate).
- [x] CSV is parsed client-side (Papa Parse) into `{ headers, rows }`; columns auto-detect with manual override; required = Date/Description/Amount.
- [x] `parseDate` converts `DD/MM/YYYY` → `YYYY-MM-DD`; `parseAmount` strips currency symbols and negates; `extractLocation` title-cases the first line.
- [x] Validation rejects rows with an invalid date or amount and surfaces the first 10 errors.
- [x] `rawRow` (full original row JSON) is stored for audit/AI context.
- [x] Tests cover `findExistingChecksums` (existing/missing/null/over-500-batch), plus `buildEntityMaps`, `buildDefaultTagsByEntity`, and `insertImportTransaction` (`src/db/__tests__/imports.test.ts`).
- [x] The canonical key + re-key migration are tested: `buildImportDedupKey`/`findReferenceHeader`/`buildImportDedupKeyFromStoredRow` (`src/contract/__tests__/import-dedup.test.ts`), the migration re-keys a sample row and collapses a duplicate pair to a non-unique index (`src/db/__tests__/recompute-canonical-checksum.test.ts`), and `validateAllRows` account+checksum behaviour (`app/.../column-map/validation.test.ts`).
- [ ] The pure column-map transforms `parseDate`/`parseAmount`/`extractLocation`/`autoDetectColumns` are shipped but still have no direct unit tests — open test gap, not a missing feature.

## Out of scope

- Per-bank parsers and ANZ PDF (Amex sign inversion, ANZ correct-sign, ING credit/debit, PDF statements) → `docs/ideas/per-bank-parsers.md`.
- Up Bank API batch import and webhook persistence → `docs/ideas/up-bank-api-import.md`.
- Entity matching, import wizard UI (separate PRDs).
