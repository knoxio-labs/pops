# retrieval

Search over the engram corpus: `search`, `context` and `similar` on the REST
surface, and the in-process `HybridSearchService` that query, emit, ego, the
consolidation nudge and the Glia consolidator and linker all call.

## Thresholds are cosine, storage is L2

`embeddings_vec` is a `vec0` table declared with no `distance_metric`
(`../../../db/vec-loader.ts`), so sqlite-vec returns Euclidean distance. Every
threshold in the pillar is written as a **minimum cosine similarity** and is
converted to an L2 ceiling in one place, `SemanticSearchService`, using
`cosine.ts`. Nothing outside this directory should compare against `distance`.

The conversion is exact only for unit-length vectors. OpenAI's and Voyage's
embedding models return normalised vectors and nothing here renormalises, so
pointing `EMBEDDING_MODEL` at one that does not silently shifts every threshold.

## Hybrid has two legs

`hybrid` runs both legs and fuses them with reciprocal rank fusion (k = 60,
`rank-fusion.ts`).

- **Lexical** (`lexical-search.ts`): FTS5 over engram title and body, ranked by
  `bm25()`. The query's words are quoted and joined with OR, function words
  dropped (`lexical-query.ts`). It needs no embedding client and no sqlite-vec.
- **Semantic** (`semantic-search.ts`): k-NN over `embeddings_vec`. Best-effort:
  no embedding client, no sqlite-vec or a failing provider collapse it to an
  empty list.

With the semantic leg empty, `hybrid` returns the lexical hits alone. That is
the normal state of a deployment with no `EMBEDDING_API_KEY`, not a degraded
one. Only engrams are in the lexical index, so cross-pillar sources
(`transaction`, `movie`, `tv_show`, `inventory`) are reachable through the
semantic leg only.

`StructuredQueryService` lists engrams by filter, newest first. It never sees
the query, so it is not a leg. It serves `mode: 'structured'` and the emit
modes that have no topic to rank against.

## What `score` means

Fusion decides order only. `score` is always a similarity in [0, 1], never the
RRF value, because the UIs print it as a percentage and citations expose it as
`relevance`.

| Path / `matchType`             | `score`                                              |
| ------------------------------ | ---------------------------------------------------- |
| `semanticSearch`               | cosine similarity to the query                       |
| `similar`                      | cosine similarity to the given engram                |
| `hybrid`, `semantic` or `both` | cosine similarity to the query                       |
| `hybrid`, `lexical`            | the hit's `bm25()` divided by the best lexical hit's |
| `structuredOnly`               | always 1                                             |

A `lexical` score is relative to the other lexical hits of the same query. The
best one is always 1, however weak the match, and the rest fall in (0, 1].
"Best" is the top BM25 hit after filters, whether or not the semantic leg also
found it. It is not comparable to a cosine, and not comparable across queries.

`distance` is the raw L2 value, present on hits the semantic leg found.

The query confidence badge (`../query/confidence.ts`) counts a cited source as
strongly matched when the semantic leg found it, or when it is a `lexical` hit
scoring at least 0.5.

## The lexical index

`engram_search_docs` holds each engram's title and body; `engram_fts` is an
FTS5 index over it, kept in step by triggers (`../../../../migrations/0058_engram_search.sql`).
The tokenizer is `porter unicode61 remove_diacritics 2`.

The engram files are the source of truth. The engram handlers and the thalamus
sync write the search row in the same transaction as the index row, and
`reconcileEngramSearchIndex` (`../thalamus/search-index.ts`) runs at API boot
to index engrams whose search row is missing or stale and to drop rows whose
engram is gone. It reads only the files that need it.

## Filters

A `RetrievalFilters` object constrains the candidate set; it never contributes
rank. Engram hits are checked with the SQL conditions in
`structured-query-conditions.ts` on the lexical, semantic and structured paths.
The lexical leg applies them in the same statement as the match. The semantic
leg checks after k-NN has picked the nearest `3 x limit` rows, so a filter that
excludes most of the corpus can leave fewer semantic hits than `limit` even
when more matching engrams exist further away.

Cross-pillar hits (`transaction`, `movie`, `tv_show`, `inventory`) have no
engram row, so only `sourceTypes` applies to them.
