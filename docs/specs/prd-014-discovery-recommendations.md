# PRD-014: Discovery & Recommendations

**Epic:** [05 — Discovery & Recommendations](../themes/media/epics/05-discovery-recommendations.md)
**Theme:** Media
**Status:** Draft
**ADRs:** [008 — Pairwise ELO Ratings](../architecture/adr-008-pairwise-elo-ratings.md)

## Problem Statement

The user has watched movies, compared them across dimensions, and built a preference profile. Now the system needs to use that data to recommend what to watch next. Without recommendations, the comparison system generates data that goes nowhere — violating the "output > input" principle.

## Goal

A discovery page that surfaces personalised movie recommendations based on the user's comparison scores and watch history. A "what should I watch tonight?" quick-pick flow. Trending and "similar to" suggestions from TMDB fill in the gaps. The system improves as more comparisons accumulate.

## Requirements

### R1: Preference Profile

Derived from comparison data — not user-configured.

**Computed attributes:**
- **Genre affinity scores:** For each genre, average the ELO scores of watched movies in that genre across all dimensions. Genres with high-scoring movies = genres the user likes.
- **Dimension weights:** Which dimensions the user has compared most frequently. More comparisons on "cinematography" than "entertainment" implies cinematography matters more.
- **Watched genre distribution:** How many movies per genre. Reveals genre preferences independent of ratings.

**Computation:** Run on-demand when the discovery page loads, or cached and refreshed when new comparisons are recorded. At the expected data volume (<2,500 movies, <10,000 comparisons), computing on-demand is fast enough — no background job needed.

### R2: Candidate Sourcing from TMDB

Fetch candidates that the user might enjoy:

| Source | TMDB endpoint | Purpose |
|--------|--------------|---------|
| Similar | `GET /3/movie/{id}/similar` | Movies similar to the user's highest-rated titles |
| Popular | `GET /3/movie/popular` | Broadly popular movies as a baseline |
| Top Rated | `GET /3/movie/top_rated` | Highly-rated movies the user may have missed |
| Trending | `GET /3/trending/movie/week` | Currently trending for recency |

**Candidate selection:**
- Fetch "similar" for the top 10 highest-scored movies in the library (by overall ELO)
- Fetch 1 page each of popular, top-rated, and trending
- Deduplicate across all sources
- Filter out movies already in the library or already dismissed
- Cache candidates locally (store TMDB metadata in a `recommendation_candidates` table or in-memory cache with TTL)

**Refresh schedule:** Re-fetch candidates when the discovery page loads if the cache is >24 hours old. No background cron — the data isn't that time-sensitive.

### R3: Scoring Algorithm (v1)

Simple weighted scoring:

```
score = (genre_affinity_match × 0.5) + (tmdb_vote_average × 0.3) + (source_boost × 0.2)
```

**Components:**
- `genre_affinity_match` (0–1): How well the candidate's genres align with the user's genre affinity scores. Average of the user's affinity for each of the candidate's genres, normalised to 0–1.
- `tmdb_vote_average` (0–1): TMDB community rating normalised (vote_average / 10).
- `source_boost` (0–1): Bonus for how the candidate was sourced. "Similar to a top-rated movie" scores higher than "generic popular."

| Source | Boost |
|--------|-------|
| Similar to top-5 rated | 1.0 |
| Similar to top-10 rated | 0.7 |
| Top rated | 0.5 |
| Trending | 0.3 |
| Popular | 0.2 |

This is deliberately simple. The algorithm evolves as data accumulates (see [media ideas](../ideas/media-ideas.md) for advanced approaches).

### R4: Discovery Page (`/media/discover`)

**Layout:**

**"Recommended for You" section:**
- Top 10-20 scored candidates in a horizontal scroll row
- Each card shows: poster, title, year, genre tags, match indicator (percentage or "Strong match" / "Good match"), TMDB rating
- Brief explanation: "Because you rated [X] highly" or "Similar to [Y]"
- Actions: "Add to Library" / "Add to Watchlist" / "Not Interested"

**"Trending This Week" section:**
- Horizontal scroll row of TMDB trending movies
- Filtered to exclude already-in-library items
- Same card format, no match indicator (these aren't personalised)

**"Because You Liked [Movie]" sections:**
- 2-3 rows, one per highly-rated library movie
- Each row shows similar movies from TMDB
- Row header: "Because you liked [Movie Title]" with poster thumbnail

**Cold start state (< 5 comparisons):**
- Hide "Recommended for You" section
- Show a prompt: "Do 10+ comparisons to unlock personalised recommendations"
- Link to the comparison arena
- Still show trending and popular sections

### R5: "What Should I Watch Tonight?" Flow

Quick-pick entry point — prominent button on the media home page or discovery page.

**Behaviour:**
1. User taps "What should I watch tonight?"
2. System picks from: (a) top-scored unwatched candidate, (b) highest-priority watchlist item, (c) random highly-matched candidate
3. Display a single recommendation card: large poster, title, year, overview, genres, match indicator, TMDB rating
4. Actions: "Watch This" (adds to library if needed, marks as watching), "Show Another" (next pick), "Not Tonight" (dismiss and close)

**Optional filters (stretch):**
- "I have 90 minutes" → filter by runtime ≤ 90
- "Something light" / "Something intense" → filter by genre mood mapping (comedy/animation = light, thriller/drama = intense)

### R6: Dismissed Suggestions

Track "Not Interested" choices so dismissed items don't resurface.

**Schema addition:**
```typescript
export const dismissedSuggestions = sqliteTable('dismissed_suggestions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tmdbId: integer('tmdb_id').notNull(),
  dismissedAt: text('dismissed_at').notNull().default(sql`(datetime('now'))`),
});
```

- "Not Interested" on any recommendation card → insert into `dismissed_suggestions`
- Candidate sourcing filters out dismissed TMDB IDs
- No undo UI in v1 — dismissed items can be un-dismissed via a future "Dismissed" management page

### R7: Recommendation Explanations

Each recommendation includes a brief explanation of why it was suggested:

| Scenario | Explanation |
|----------|-------------|
| Similar to top-rated | "Similar to [Movie Title]" |
| Genre match | "Because you enjoy [Genre]" |
| Trending | "Trending this week" |
| Popular + genre match | "Popular in [Genre]" |

Keep explanations honest and simple. Don't fabricate sophisticated reasoning — the algorithm is a weighted score, not deep analysis.

### R8: Route Addition

Add to `@pops/app-media/routes`:
```typescript
{ path: 'discover', element: <DiscoverPage /> },
```

Add "Discover" to the media app's secondary navigation — this is a high-visibility feature, position it prominently.

## Out of Scope

- TV show recommendations (comparisons are movies-only in v1)
- Collaborative filtering
- Content-based filtering on cast/crew/keywords
- Mood-based or temporal recommendations
- AI-powered recommendations
- Notification-driven suggestions
- "Year in review" or statistics

## Acceptance Criteria

1. Preference profile computed from comparison scores and watch history
2. TMDB candidates fetched (similar, popular, top-rated, trending) and cached
3. Candidates scored against preference profile
4. Discovery page shows personalised recommendations with explanations
5. "Trending This Week" section shows current TMDB trending
6. "Because You Liked [X]" sections show similar movies
7. Cold start state shown when < 5 comparisons, with arena CTA
8. "What should I watch tonight?" returns a single recommendation
9. "Not Interested" dismisses a suggestion and prevents it from resurfacing
10. All recommendation cards have "Add to Library" and "Add to Watchlist" actions
11. Match indicator (percentage or label) shown on personalised recommendations
12. Candidates filtered to exclude already-in-library and dismissed items
13. Page responsive at 375px, 768px, 1024px
14. `mise db:seed` updated with dismissed suggestions data
15. Unit tests for scoring algorithm
16. `pnpm typecheck` and `pnpm test` pass

## User Stories

> **Standard verification — applies to every US below.**

### US-1: Preference profile
**As a** developer, **I want** a preference profile derived from comparisons **so that** recommendations are personalised.

**Acceptance criteria:**
- Genre affinity scores computed from ELO data
- Dimension weights computed from comparison frequency
- Profile updates when new comparisons are recorded
- Unit tests for profile computation

### US-2: Candidate sourcing and scoring
**As a** developer, **I want** TMDB candidates scored against the user's profile **so that** recommendations are ranked by relevance.

**Acceptance criteria:**
- Candidates fetched from TMDB (similar, popular, trending, top-rated)
- Filtered to exclude library items and dismissed suggestions
- Scored using weighted algorithm
- Cached for 24 hours
- Unit tests for scoring algorithm

### US-3: Discovery page
**As a** user, **I want** a page showing movies I might enjoy **so that** I discover new things to watch.

**Acceptance criteria:**
- "Recommended for You" with match indicators and explanations
- "Trending This Week" section
- "Because You Liked [X]" sections
- Cold start state with comparison CTA
- Horizontal scroll rows

### US-4: "What should I watch tonight?"
**As a** user, **I want** a quick recommendation **so that** I don't spend 30 minutes deciding.

**Acceptance criteria:**
- Single recommendation card with full details
- "Show Another" for next pick
- "Not Tonight" to dismiss and close
- Draws from candidates + watchlist

### US-5: Dismiss suggestions
**As a** user, **I want** to dismiss suggestions I'm not interested in **so that** they don't keep appearing.

**Acceptance criteria:**
- "Not Interested" button on recommendation cards
- Dismissed movies don't reappear in future recommendations
- Persisted in `dismissed_suggestions` table
