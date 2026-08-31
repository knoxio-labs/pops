/**
 * The removal ranking: which movies rotation sheds first.
 *
 * Pure — no db, no HTTP. The engine used to order by `movies.created_at`
 * ascending, and a bulk import made that column near-constant, so SQLite broke
 * the tie by rowid and the library was deleted in alphabetical order
 * (POPS-2578). This replaces it with a continuous **removal pressure** scored
 * over the whole eligible set.
 *
 * ```
 * pressure = effectiveAgeDays^ALPHA × RATING_SPREAD^(1−2q) / keepWeight(watches)
 * ```
 *
 * Multiplicative rather than additive, and deliberately so. An additive bonus
 * is a fixed offset: a good movie and a mediocre one then accrue pressure at
 * the same rate and their relative order never changes, it is only displaced by
 * a constant number of days. Multiplying makes quality set the *rate*, so a
 * good movie ages slower and the gap widens. Because the age term is unbounded,
 * nothing is permanently safe — a beloved movie simply takes years to climb.
 *
 * **No arbitrary fixed attribute may enter this ranking.** Not the title, not
 * the file size, not the row id, not a stable per-movie hash: anything that
 * pins a movie at one end of the order for reasons unrelated to whether it is
 * wanted recreates the original defect in a new costume. Ratings are the
 * deliberate exception — a rating is static but *scales* rather than pins,
 * being a bounded multiplier on an unbounded age term that any watch resets,
 * and a signal that does not consistently order is not a rating signal.
 */

/**
 * The four terms of the pressure formula the operator can tune.
 *
 * They are settings rather than constants because the values that shipped were
 * fitted against a snapshot in which two of the three signals were broken —
 * ages came from the wrong Radarr field and every movie read as unwatched with
 * no Elo — so the numbers were never worth the confidence a constant implies
 * (POPS-2730). The grace window travels separately, in `RankingInput`, because
 * it excludes rather than scales.
 */
export interface RotationTuning {
  /** Mild superlinearity, so pressure accelerates instead of plateauing. */
  ageExponent: number;
  /**
   * A top-rated movie ages this many times slower than an average one, and a
   * bottom-rated one this many times faster — the square of it, end to end.
   * At 1 the rating stops mattering at all.
   */
  ratingSpread: number;
  /** Keep-weight for a movie that has never been watched to completion. */
  keepUnwatched: number;
  /**
   * How fast rewatching earns protection: `watches^keepExponent` for one watch
   * or more, giving 1.0 / 2.6 / 4.7 / 7.0 at 1.4 for one through four.
   *
   * A curve rather than a lookup table because no movie in the library has
   * been watched four times — a table's top band would be unreachable. The
   * shape is non-monotonic on purpose: unwatched is a debt not yet paid,
   * watched once is consumed, watched repeatedly is a classic.
   */
  keepExponent: number;
}

/** What the formula scored with before any of it was tunable. */
export const DEFAULT_TUNING: RotationTuning = {
  ageExponent: 1.2,
  ratingSpread: 3,
  keepUnwatched: 2.5,
  keepExponent: 1.4,
};

/**
 * Vote count at which a TMDB rating is trusted on its own terms. Below it the
 * rating is pulled toward the library mean, so a 9.4 from forty votes cannot
 * outrank an 8.1 from forty thousand.
 */
const VOTE_CONFIDENCE = 500;

/** Comparisons at which a movie's own Elo fully displaces the TMDB rating. */
const ELO_CONFIDENCE = 20;

/** Quality assumed for a movie with neither an Elo nor a TMDB rating. */
const NEUTRAL_QUALITY = 0.5;

const MS_PER_DAY = 86_400_000;

/** Everything the ranking needs to know about one eligible movie. */
export interface RemovalCandidate {
  id: number;
  tmdbId: number;
  title: string;
  /** Watches counted to completion. A partial play is not a watch. */
  watchCount: number;
  lastWatchedAt: string | null;
  elo: number | null;
  eloComparisons: number;
  voteAverage: number | null;
  voteCount: number | null;
}

/** A candidate with its computed pressure and the parts that produced it. */
export interface RankedCandidate extends RemovalCandidate {
  pressure: number;
  ageDays: number;
  /** Which date the age clock was anchored to. */
  ageAnchor: 'acquired' | 'watched' | 'unknown';
  quality: number;
  qualitySource: 'elo' | 'tmdb' | 'blended' | 'none';
  keepWeight: number;
}

export interface RankingInput {
  candidates: readonly RemovalCandidate[];
  /** TMDB id → ISO acquisition timestamp, from Radarr. */
  acquiredAt: ReadonlyMap<number, string>;
  /** Movies acquired within this many days carry no pressure at all. */
  graceDays: number;
  /** Defaults to {@link DEFAULT_TUNING} when the caller has no stored values. */
  tuning?: RotationTuning;
  now?: Date;
  /**
   * Tiebreak source. Re-rolled per cycle rather than seeded per movie: a stable
   * jitter is previewable but is a fixed metric by another name, and an unlucky
   * draw would pin a movie at the top of its cohort permanently.
   */
  random?: () => number;
}

/** Keep-weight for a completed-watch count. Higher keeps the movie longer. */
export function keepWeight(watchCount: number, tuning: RotationTuning): number {
  if (watchCount <= 0) return tuning.keepUnwatched;
  return Math.pow(watchCount, tuning.keepExponent);
}

/**
 * TMDB rating on a 0–1 scale, shrunk toward `libraryMean` by its vote count.
 * Returns null when the movie carries no rating at all.
 */
function tmdbQuality(
  voteAverage: number | null,
  voteCount: number | null,
  libraryMean: number
): number | null {
  if (voteAverage === null || voteAverage <= 0) return null;
  const votes = voteCount ?? 0;
  const weight = votes / (votes + VOTE_CONFIDENCE);
  return (weight * voteAverage + (1 - weight) * libraryMean) / 10;
}

/**
 * Percentile rank of `elo` within the compared set, rather than the raw score.
 * Elo's scale drifts with how many comparisons have been run, so the absolute
 * number is not comparable across libraries or across time; its position is.
 */
function eloPercentile(elo: number, sortedElos: readonly number[]): number {
  if (sortedElos.length <= 1) return NEUTRAL_QUALITY;
  let below = 0;
  for (const other of sortedElos) {
    if (other < elo) below++;
    else break;
  }
  return below / (sortedElos.length - 1);
}

function meanVoteAverage(candidates: readonly RemovalCandidate[]): number {
  const rated = candidates.filter((c) => c.voteAverage !== null && c.voteAverage > 0);
  if (rated.length === 0) return 5;
  return rated.reduce((sum, c) => sum + (c.voteAverage ?? 0), 0) / rated.length;
}

interface Quality {
  value: number;
  source: RankedCandidate['qualitySource'];
}

function resolveQuality(
  candidate: RemovalCandidate,
  sortedElos: readonly number[],
  libraryMean: number
): Quality {
  const tmdb = tmdbQuality(candidate.voteAverage, candidate.voteCount, libraryMean);
  if (candidate.elo === null) {
    return tmdb === null
      ? { value: NEUTRAL_QUALITY, source: 'none' }
      : { value: tmdb, source: 'tmdb' };
  }

  const elo = eloPercentile(candidate.elo, sortedElos);
  const confidence = Math.min(1, candidate.eloComparisons / ELO_CONFIDENCE);
  if (tmdb === null) return { value: elo, source: 'elo' };
  if (confidence >= 1) return { value: elo, source: 'elo' };
  return { value: confidence * elo + (1 - confidence) * tmdb, source: 'blended' };
}

interface Age {
  days: number;
  anchor: RankedCandidate['ageAnchor'];
}

/**
 * Days since the later of acquisition and the last completed watch.
 *
 * Anchoring to the watch is what lets a rewatch reset the clock, which removes
 * the need for a separate watch-recency term. A movie with no known acquisition
 * date and no watch has no age the ranking can trust, and is reported as such
 * rather than silently treated as brand new or ancient.
 */
function effectiveAge(candidate: RemovalCandidate, acquired: string | undefined, now: number): Age {
  const acquiredMs = acquired ? Date.parse(acquired) : Number.NaN;
  const watchedMs = candidate.lastWatchedAt ? Date.parse(candidate.lastWatchedAt) : Number.NaN;
  const hasAcquired = Number.isFinite(acquiredMs);
  const hasWatched = Number.isFinite(watchedMs);
  if (!hasAcquired && !hasWatched) return { days: 0, anchor: 'unknown' };

  const anchorMs = Math.max(
    hasAcquired ? acquiredMs : -Infinity,
    hasWatched ? watchedMs : -Infinity
  );
  const anchor: Age['anchor'] =
    hasWatched && watchedMs >= (hasAcquired ? acquiredMs : -Infinity) ? 'watched' : 'acquired';
  return { days: Math.max(0, (now - anchorMs) / MS_PER_DAY), anchor };
}

/**
 * The pressure formula itself, over the three components the log persists.
 *
 * Exported so a stored breakdown can be checked against the arithmetic that
 * produced it: a component set that cannot reproduce its own pressure is not a
 * record of a decision, it is a decoration.
 */
export function pressureFrom(
  parts: { ageDays: number; quality: number; keepWeight: number },
  tuning: RotationTuning
): number {
  return (
    (Math.pow(parts.ageDays, tuning.ageExponent) *
      Math.pow(tuning.ratingSpread, 1 - 2 * parts.quality)) /
    parts.keepWeight
  );
}

/**
 * Rank every candidate by removal pressure, highest first.
 *
 * A movie inside the grace window, or with no age the ranking can trust, scores
 * zero and sinks to the bottom — the engine must not eat a download it has only
 * just made, nor act confidently on a date it does not have.
 */
export function rankForRemoval(input: RankingInput): RankedCandidate[] {
  const { candidates, acquiredAt, graceDays } = input;
  const tuning = input.tuning ?? DEFAULT_TUNING;
  const now = (input.now ?? new Date()).getTime();
  const random = input.random ?? Math.random;

  const libraryMean = meanVoteAverage(candidates);
  const sortedElos = candidates
    .map((c) => c.elo)
    .filter((elo): elo is number => elo !== null)
    .toSorted((a, b) => a - b);

  const ranked = candidates.map((candidate) => {
    const age = effectiveAge(candidate, acquiredAt.get(candidate.tmdbId), now);
    const quality = resolveQuality(candidate, sortedElos, libraryMean);
    const keep = keepWeight(candidate.watchCount, tuning);
    const withinGrace = age.anchor !== 'unknown' && age.days < graceDays;
    const pressure =
      age.anchor === 'unknown' || withinGrace
        ? 0
        : pressureFrom({ ageDays: age.days, quality: quality.value, keepWeight: keep }, tuning);

    return {
      ...candidate,
      pressure,
      ageDays: age.days,
      ageAnchor: age.anchor,
      quality: quality.value,
      qualitySource: quality.source,
      keepWeight: keep,
    };
  });

  // Shuffle before a stable sort so exact ties come out in a fresh order each
  // cycle. Without it the input order — which is the database's, which is the
  // insertion order — would decide, and that is the original defect.
  for (let i = ranked.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = ranked[i];
    const b = ranked[j];
    if (a !== undefined && b !== undefined) {
      ranked[i] = b;
      ranked[j] = a;
    }
  }

  return ranked.toSorted((a, b) => b.pressure - a.pressure);
}

/**
 * The subset of a ranking the engine is allowed to remove.
 *
 * Zero pressure is not "last in line", it is "not a candidate": it marks a
 * movie inside its grace window or one whose acquisition date is unknown, and
 * neither may be eaten. Sorting alone does not enforce that — a deficit larger
 * than everything above the zero-pressure tail would walk straight into it and
 * delete a download made yesterday, so the tail has to be cut off rather than
 * merely sorted last.
 */
export function removableOnly(ranked: readonly RankedCandidate[]): RankedCandidate[] {
  return ranked.filter((candidate) => candidate.pressure > 0);
}
