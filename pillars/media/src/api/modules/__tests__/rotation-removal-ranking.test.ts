/**
 * The removal ranking. Each test pins one term of the pressure formula at the
 * boundary where it changes the answer, plus the properties the ranking must
 * hold whatever the constants are tuned to.
 */
import { describe, expect, it } from 'vitest';

import { selectForDeficit } from '../rotation-cycle-types.js';
import {
  abandonWeightFor,
  DEFAULT_TUNING,
  keepWeight,
  pressureFrom,
  rankForRemoval,
  type RemovalCandidate,
  removableOnly,
} from '../rotation-removal-ranking.js';

const NOW = new Date('2026-08-31T00:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

let seq = 0;

function candidate(title: string, over: Partial<RemovalCandidate> = {}): RemovalCandidate {
  seq++;
  return {
    id: seq,
    tmdbId: 1000 + seq,
    title,
    watchCount: 0,
    lastWatchedAt: null,
    elo: null,
    eloComparisons: 0,
    voteAverage: 7,
    voteCount: 5000,
    ...over,
  };
}

interface RankOptions {
  graceDays?: number;
  acquired?: Map<number, string>;
  abandonedProgress?: Map<number, number>;
}

function rank(candidates: RemovalCandidate[], options: RankOptions = {}) {
  const acquiredAt = options.acquired ?? new Map(candidates.map((c) => [c.tmdbId, daysAgo(400)]));
  return rankForRemoval({
    candidates,
    acquiredAt,
    abandonedProgress: options.abandonedProgress,
    graceDays: options.graceDays ?? 30,
    now: NOW,
    // Fixed draw so a tie resolves deterministically here; the production
    // default re-rolls per cycle.
    random: () => 0,
  });
}

const order = (ranked: { title: string }[]): string[] => ranked.map((r) => r.title);

describe('age', () => {
  it('ranks the movie held longest above one acquired recently', () => {
    const old = candidate('Old');
    const recent = candidate('Recent');
    const acquired = new Map([
      [old.tmdbId, daysAgo(600)],
      [recent.tmdbId, daysAgo(100)],
    ]);

    expect(order(rank([recent, old], { acquired }))).toEqual(['Old', 'Recent']);
  });

  it('does not order by insertion — the defect this replaces', () => {
    // Inserted alphabetically, acquired in the opposite order. The old query
    // ordered by a near-constant `created_at` and fell through to rowid.
    const a = candidate('Alien');
    const b = candidate('Barbie');
    const c = candidate('Casino Royale');
    const acquired = new Map([
      [a.tmdbId, daysAgo(100)],
      [b.tmdbId, daysAgo(300)],
      [c.tmdbId, daysAgo(600)],
    ]);

    expect(order(rank([a, b, c], { acquired }))).toEqual(['Casino Royale', 'Barbie', 'Alien']);
  });

  it('anchors the clock to a rewatch, not to acquisition', () => {
    const rewatched = candidate('Rewatched', { watchCount: 1, lastWatchedAt: daysAgo(10) });
    const untouched = candidate('Untouched', { watchCount: 1, lastWatchedAt: daysAgo(500) });
    const acquired = new Map([
      [rewatched.tmdbId, daysAgo(600)],
      [untouched.tmdbId, daysAgo(600)],
    ]);

    const ranked = rank([rewatched, untouched], { acquired });
    expect(order(ranked)).toEqual(['Untouched', 'Rewatched']);
    expect(ranked.find((r) => r.title === 'Rewatched')?.ageAnchor).toBe('watched');
  });

  it('scores a movie inside the grace window at zero', () => {
    const fresh = candidate('Fresh');
    const acquired = new Map([[fresh.tmdbId, daysAgo(5)]]);

    const [ranked] = rank([fresh], { acquired, graceDays: 30 });
    expect(ranked?.pressure).toBe(0);
  });

  it('scores a movie with no acquisition date and no watch at zero rather than guessing', () => {
    const unknown = candidate('Unknown');

    const [ranked] = rank([unknown], { acquired: new Map() });
    expect(ranked?.pressure).toBe(0);
    expect(ranked?.ageAnchor).toBe('unknown');
  });
});

describe('watch count', () => {
  it('sheds a movie watched once before one never watched, at equal age', () => {
    const once = candidate('Seen once', { watchCount: 1, lastWatchedAt: daysAgo(400) });
    const never = candidate('Never seen');

    expect(order(rank([never, once]))).toEqual(['Seen once', 'Never seen']);
  });

  it('protects a rewatched movie above one never watched', () => {
    const classic = candidate('Classic', { watchCount: 3, lastWatchedAt: daysAgo(400) });
    const never = candidate('Never seen');

    expect(order(rank([classic, never]))).toEqual(['Never seen', 'Classic']);
  });

  it('is non-monotonic in watch count — unwatched sits between once and twice', () => {
    expect(keepWeight(1, DEFAULT_TUNING)).toBeLessThan(keepWeight(0, DEFAULT_TUNING));
    expect(keepWeight(0, DEFAULT_TUNING)).toBeLessThan(keepWeight(2, DEFAULT_TUNING));
    expect(keepWeight(2, DEFAULT_TUNING)).toBeLessThan(keepWeight(3, DEFAULT_TUNING));
  });

  it('keeps rising past the fourth watch rather than topping out', () => {
    // No movie in the library has four completed watches, so a lookup table
    // would have an unreachable top band.
    expect(keepWeight(5, DEFAULT_TUNING)).toBeGreaterThan(keepWeight(4, DEFAULT_TUNING));
    expect(keepWeight(9, DEFAULT_TUNING)).toBeGreaterThan(keepWeight(5, DEFAULT_TUNING));
  });
});

describe('quality', () => {
  it('sheds a poorly-rated movie before a well-rated one of the same age', () => {
    const bad = candidate('Bad', { voteAverage: 3.5 });
    const good = candidate('Good', { voteAverage: 8.5 });

    expect(order(rank([good, bad]))).toEqual(['Bad', 'Good']);
  });

  it('does not let a high rating from few votes outrank a solid one from many', () => {
    const hyped = candidate('Hyped', { voteAverage: 9.6, voteCount: 12 });
    const proven = candidate('Proven', { voteAverage: 8.2, voteCount: 40_000 });
    // Shrinkage pulls toward the library mean, so the library has to exist:
    // with only these two films the hyped one is half of the mean it is being
    // shrunk toward.
    const ordinary = Array.from({ length: 20 }, (_unused, i) =>
      candidate(`Ordinary ${i}`, { voteAverage: 6.4, voteCount: 4000 })
    );

    const ranked = rank([hyped, proven, ...ordinary]);
    const hypedQuality = ranked.find((r) => r.title === 'Hyped')?.quality ?? 0;
    const provenQuality = ranked.find((r) => r.title === 'Proven')?.quality ?? 0;
    expect(provenQuality).toBeGreaterThan(hypedQuality);
  });

  it('lets a thoroughly compared Elo displace the TMDB rating', () => {
    // Crowd-loved, personally disliked, and compared enough to be believed.
    const disliked = candidate('Overrated', {
      voteAverage: 8.6,
      voteCount: 40_000,
      elo: 1200,
      eloComparisons: 40,
    });
    const liked = candidate('Underrated', {
      voteAverage: 5.5,
      voteCount: 40_000,
      elo: 1800,
      eloComparisons: 40,
    });

    const ranked = rank([liked, disliked]);
    expect(order(ranked)).toEqual(['Overrated', 'Underrated']);
    expect(ranked[0]?.qualitySource).toBe('elo');
  });

  it('blends a barely-compared Elo with the crowd rating rather than trusting it', () => {
    const barely = candidate('Barely compared', {
      voteAverage: 8.0,
      voteCount: 40_000,
      elo: 1200,
      eloComparisons: 1,
    });

    const [ranked] = rank([barely]);
    expect(ranked?.qualitySource).toBe('blended');
  });

  it('falls back to a neutral quality when the movie has no rating at all', () => {
    const unrated = candidate('Unrated', { voteAverage: null, voteCount: null });

    const [ranked] = rank([unrated]);
    expect(ranked?.qualitySource).toBe('none');
    expect(ranked?.quality).toBe(0.5);
  });

  it('ranks the featureless cohort by age and crowd rating alone', () => {
    // Three quarters of the live library has neither a watch nor an Elo. The
    // ordering there must still be total and meaningful.
    const dull = candidate('Dull', { voteAverage: 4.0 });
    const decent = candidate('Decent', { voteAverage: 7.5 });
    const acquired = new Map([
      [dull.tmdbId, daysAgo(300)],
      [decent.tmdbId, daysAgo(300)],
    ]);

    const ranked = rank([decent, dull], { acquired });
    expect(order(ranked)).toEqual(['Dull', 'Decent']);
    expect(ranked.every((r) => r.pressure > 0)).toBe(true);
  });
});

describe('abandoned play', () => {
  it('ranks an abandoned film strictly above an otherwise identical never-opened one', () => {
    const abandoned = candidate('Abandoned');
    const neverOpened = candidate('Never opened');
    const acquired = new Map([
      [abandoned.tmdbId, daysAgo(400)],
      [neverOpened.tmdbId, daysAgo(400)],
    ]);
    const abandonedProgress = new Map([[abandoned.id, 0.08]]);

    expect(order(rank([neverOpened, abandoned], { acquired, abandonedProgress }))).toEqual([
      'Abandoned',
      'Never opened',
    ]);
  });

  it('ranks an abandoned film above one abandoned much later into the play', () => {
    const rejected = candidate('Rejected at 8%');
    const interrupted = candidate('Interrupted at 90%');
    const acquired = new Map([
      [rejected.tmdbId, daysAgo(400)],
      [interrupted.tmdbId, daysAgo(400)],
    ]);
    const abandonedProgress = new Map([
      [rejected.id, 0.08],
      [interrupted.id, 0.9],
    ]);

    expect(order(rank([interrupted, rejected], { acquired, abandonedProgress }))).toEqual([
      'Rejected at 8%',
      'Interrupted at 90%',
    ]);
  });

  it('still ranks a late-abandoned film above a never-opened one', () => {
    // Even an interruption near the end is stronger evidence than never
    // starting at all — the multiplier must never decay all the way to 1.
    const interrupted = candidate('Interrupted at 99%');
    const neverOpened = candidate('Never opened');
    const acquired = new Map([
      [interrupted.tmdbId, daysAgo(400)],
      [neverOpened.tmdbId, daysAgo(400)],
    ]);
    const abandonedProgress = new Map([[interrupted.id, 0.99]]);

    expect(order(rank([neverOpened, interrupted], { acquired, abandonedProgress }))).toEqual([
      'Interrupted at 99%',
      'Never opened',
    ]);
  });

  it('does not count a partial play that was later watched to completion', () => {
    // Same movie: a completed watch (watchCount > 0) must win over a stray
    // in-progress row — the mirror of Plex's state can lag or reflect a fresh
    // rewatch not yet finished.
    const completedAfterAbandon = candidate('Completed after abandon', { watchCount: 1 });
    const neverOpened = candidate('Never opened');
    const acquired = new Map([
      [completedAfterAbandon.tmdbId, daysAgo(400)],
      [neverOpened.tmdbId, daysAgo(400)],
    ]);
    const abandonedProgress = new Map([[completedAfterAbandon.id, 0.08]]);

    const ranked = rank([neverOpened, completedAfterAbandon], { acquired, abandonedProgress });
    const completed = ranked.find((r) => r.title === 'Completed after abandon');
    expect(completed?.abandonWeight).toBe(1);
    expect(completed?.abandonedProgress).toBeNull();
  });

  it('leaves an untouched movie with no abandon signal at all', () => {
    const [ranked] = rank([candidate('Untouched')]);
    expect(ranked?.abandonWeight).toBe(1);
    expect(ranked?.abandonedProgress).toBeNull();
  });

  describe('abandonWeightFor', () => {
    it('is 1 when there is no progress to score', () => {
      expect(abandonWeightFor(0, null)).toBe(1);
    });

    it('is 1 when a completed watch exists, regardless of progress', () => {
      expect(abandonWeightFor(1, 0.05)).toBe(1);
      expect(abandonWeightFor(3, 0.95)).toBe(1);
    });

    it('is strictly greater than 1 across the whole progress range', () => {
      for (const progress of [0, 0.01, 0.5, 0.99, 1]) {
        expect(abandonWeightFor(0, progress)).toBeGreaterThan(1);
      }
    });

    it('decreases monotonically as progress runs toward completion', () => {
      const weights = [0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => abandonWeightFor(0, p));
      for (let i = 1; i < weights.length; i++) {
        expect(weights[i]).toBeLessThan(weights[i - 1] as number);
      }
    });
  });
});

describe('ranking properties', () => {
  it('never lets a highly-rated movie become permanently unremovable', () => {
    // No hard floor: given enough time a loved movie outranks a mediocre one
    // that arrived recently, so the engine can always reach its target.
    const loved = candidate('Loved', {
      voteAverage: 9.0,
      watchCount: 2,
      lastWatchedAt: daysAgo(2000),
    });
    const meh = candidate('Meh', { voteAverage: 5.0 });
    const acquired = new Map([
      [loved.tmdbId, daysAgo(2000)],
      [meh.tmdbId, daysAgo(45)],
    ]);

    expect(order(rank([meh, loved], { acquired }))).toEqual(['Loved', 'Meh']);
  });

  it('re-rolls the tiebreak instead of pinning identical movies by input order', () => {
    const twins = [candidate('First'), candidate('Second'), candidate('Third')];
    const acquired = new Map(twins.map((t) => [t.tmdbId, daysAgo(400)]));
    const base = { candidates: twins, acquiredAt: acquired, graceDays: 30, now: NOW };

    const seen = new Set<string>();
    for (const draw of [0, 0.5, 0.99]) {
      seen.add(order(rankForRemoval({ ...base, random: () => draw })).join(','));
    }
    // All three have identical pressure; a fixed metric would give one order.
    expect(seen.size).toBeGreaterThan(1);
  });

  it('returns every candidate exactly once', () => {
    const films = [candidate('A'), candidate('B'), candidate('C')];

    const ranked = rank(films);
    expect(ranked).toHaveLength(3);
    expect(new Set(ranked.map((r) => r.id)).size).toBe(3);
  });

  it('reports the components that produced the pressure', () => {
    const film = candidate('Explained', { watchCount: 2, lastWatchedAt: daysAgo(200) });

    const [ranked] = rank([film]);
    expect(ranked?.ageDays).toBeCloseTo(200, 0);
    expect(ranked?.ageAnchor).toBe('watched');
    expect(ranked?.keepWeight).toBeCloseTo(keepWeight(2, DEFAULT_TUNING), 5);
    expect(ranked?.quality).toBeGreaterThan(0);
  });

  it('reproduces a stored pressure from its components alone, abandon term included', () => {
    const abandonedFilm = candidate('Abandoned');
    const acquired = new Map([[abandonedFilm.tmdbId, daysAgo(400)]]);
    const abandonedProgress = new Map([[abandonedFilm.id, 0.08]]);

    const [ranked] = rank([abandonedFilm], { acquired, abandonedProgress });
    expect(ranked?.abandonWeight).toBeGreaterThan(1);
    expect(
      pressureFrom(
        {
          ageDays: ranked?.ageDays ?? 0,
          quality: ranked?.quality ?? 0,
          keepWeight: ranked?.keepWeight ?? 1,
          abandonWeight: ranked?.abandonWeight ?? 1,
        },
        DEFAULT_TUNING
      )
    ).toBeCloseTo(ranked?.pressure ?? -1, 10);
  });

  it('handles an empty candidate list', () => {
    expect(rank([])).toEqual([]);
  });
});

describe('removableOnly', () => {
  it('drops the grace-window and unknown-age tail', () => {
    const fresh = candidate('Fresh');
    const unknown = candidate('Unknown');
    const old = candidate('Old');
    const acquired = new Map([
      [fresh.tmdbId, daysAgo(2)],
      [old.tmdbId, daysAgo(400)],
    ]);

    const removable = removableOnly(rank([fresh, unknown, old], { acquired }));

    expect(removable.map((c) => c.title)).toEqual(['Old']);
  });

  /**
   * The defect this exists to stop: a deficit bigger than everything with real
   * pressure used to walk on into the zero-pressure tail and mark a download
   * made two days ago.
   */
  it('leaves a deficit unmet rather than eating a movie inside its grace window', () => {
    const fresh = candidate('Fresh');
    const old = candidate('Old');
    const acquired = new Map([
      [fresh.tmdbId, daysAgo(2)],
      [old.tmdbId, daysAgo(400)],
    ]);
    const sizes = new Map([
      [fresh.tmdbId, 40],
      [old.tmdbId, 5],
    ]);

    const { selected } = selectForDeficit(
      removableOnly(rank([fresh, old], { acquired })),
      (movie) => sizes.get(movie.tmdbId) ?? 0,
      30
    );

    expect(selected.map((c) => c.title)).toEqual(['Old']);
  });
});
