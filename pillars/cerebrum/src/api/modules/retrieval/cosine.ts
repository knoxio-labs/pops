/**
 * Unit conversion between what `embeddings_vec` reports and what every
 * threshold in the pillar is written in.
 *
 * `embeddings_vec` is a `vec0` table declared without a `distance_metric`, so
 * sqlite-vec reports Euclidean (L2) distance. For unit-length vectors
 * |a - b|^2 = 2 - 2 * cos(a, b), which is the only reason these two functions
 * are inverses of the truth: an embedding provider that returns unnormalised
 * vectors makes both wrong.
 */

/** Default minimum cosine for a text query against the corpus. */
export const DEFAULT_SEARCH_MIN_COSINE = 0.3;

/** Default minimum cosine for an engram against its neighbours. */
export const DEFAULT_SIMILAR_MIN_COSINE = 0.7;

/** Cosine similarity of two unit vectors that sqlite-vec reports as `distance` apart. */
export function l2ToCosine(distance: number): number {
  return 1 - (distance * distance) / 2;
}

/**
 * Largest L2 distance two unit vectors can be apart while keeping a cosine
 * similarity of at least `minCosine`. A `minCosine` above 1 admits nothing
 * further than distance 0.
 */
export function cosineToMaxL2(minCosine: number): number {
  return Math.sqrt(Math.max(0, 2 * (1 - minCosine)));
}
