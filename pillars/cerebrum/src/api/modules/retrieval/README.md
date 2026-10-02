# retrieval

Search over the embedded corpus: `search`, `context` and `similar` on the REST
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

`score` on a result depends on the path that produced it:

| Path             | `score`                               |
| ---------------- | ------------------------------------- |
| `semanticSearch` | cosine similarity to the query        |
| `similar`        | cosine similarity to the given engram |
| `hybrid`         | cosine similarity to the query        |
| `structuredOnly` | always 1                              |

`distance` is the raw L2 value.

## Hybrid has one leg

`hybrid` runs the semantic leg alone and fuses nothing. There is no lexical
leg: nothing matches the words of a query against engram text (POPS-5345). So with no embedding client, no sqlite-vec, or
a failing provider, `hybrid` returns an empty list, and every caller treats
that as "nothing found" rather than falling back to something else.

`StructuredQueryService` lists engrams by filter, newest first. It never sees
the query, so it is not a leg. It serves `mode: 'structured'` and the emit
modes that have no topic to rank against.

## Filters

A `RetrievalFilters` object constrains the candidate set; it never contributes
rank. Engram hits are checked with the SQL conditions in
`structured-query-conditions.ts` on both the semantic and the structured path.
The check runs after k-NN has picked the nearest `3 x limit` rows, so a filter
that excludes most of the corpus can leave fewer hits than `limit` even when
more matching engrams exist further away.

Cross-pillar hits (`transaction`, `movie`, `tv_show`, `inventory`) have no
engram row, so only `sourceTypes` applies to them.
