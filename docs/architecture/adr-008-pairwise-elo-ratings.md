# ADR-008: Pairwise ELO Comparisons Over Star Ratings

## Status

Accepted (2026-03-20)

## Context

The media app needs a preference capture mechanism — a way to record how the user feels about what they've watched, so the recommendation engine can learn their taste. The system needs to be low-friction (output > input), produce rich preference data, and scale across multiple taste dimensions (cinematography, fun, rewatchability, etc.).

### Options Considered

**A. Star ratings (1–5 or 1–10)**

The standard approach. User assigns a numeric score to each title.

- Pros: Familiar UX, fast (one input per title), directly comparable scores, widely understood
- Cons: Scores are inconsistent over time (was that a 7 or an 8?), central tendency bias (everything clusters around 3–4 stars), no relative ranking (a 4-star comedy and a 4-star thriller tell you nothing about how they compare), multi-dimensional ratings (rate cinematography 1–5, fun 1–5, etc.) become tedious quickly — nobody wants to fill out a form per movie

**B. Thumbs up/down (binary)**

User marks each title as liked or disliked.

- Pros: Fastest possible input, zero cognitive load
- Cons: Loses all nuance — everything is either good or bad. No relative ranking. Can't distinguish "decent" from "masterpiece." Multi-dimensional binary ratings are meaningless ("was the cinematography good? yes/no").

**C. Pairwise comparison with ELO scoring**

Two titles presented side by side with a dimension prompt ("Which has better cinematography?"). User picks a winner. An ELO algorithm updates scores for both items. Repeat across dimensions.

- Pros: Binary decision (tap one of two) is fast and low-friction. Relative ranking is more natural than absolute scoring — humans are better at "A vs B" than "rate A on a scale of 1–10." ELO self-calibrates — scores are relative to the pool, not arbitrary. Multi-dimensional comparisons stay lightweight (one tap per dimension per pair). Richer data per interaction — one comparison tells you about two items simultaneously. The comparison flow can feel like a game, not a form.
- Cons: Requires a watched library of sufficient size before comparisons are meaningful (cold start). Scores are relative, not absolute — a score only means something in the context of the pool. More comparisons needed to fully rank N items (O(N log N) vs O(N) for star ratings).

**D. Ranked lists (drag to reorder)**

User maintains an ordered list of all watched titles.

- Pros: Produces a complete ranking, no ambiguity
- Cons: Doesn't scale — reordering a list of 100+ items is unusable on mobile. Adding a new title means deciding its exact position relative to everything else. Multi-dimensional ranked lists (one per dimension) would be nightmarish UX.

## Decision

**Option C: Pairwise ELO comparisons.**

Three reasons:

1. **Output > Input.** A pairwise comparison is two taps. Star ratings are one tap per title but produce worse data. The comparison flow can be surfaced contextually (after watching something, on the home screen) and feels more like play than data entry.

2. **Multi-dimensional without tedium.** Rating a movie on 5 dimensions with star ratings means filling in 5 fields. Rating it via comparisons means 5 quick "A or B?" taps — and each comparison scores two items, not one.

3. **Better preference signal.** "Titanic has better cinematography than Avatar" is a more actionable signal for the recommendation engine than "Titanic: cinematography 4/5, Avatar: cinematography 4/5." Relative preferences reveal taste gradients that absolute scores flatten.

### ELO specifics

- Starting score: 1500 per item per dimension
- K-factor: 32 initially (standard for new players in chess ELO — responsive to new data)
- Score update is symmetric: winner gains what loser loses
- Scores stored in `media_scores` table with `comparison_count` for confidence weighting
- The recommendation engine (Epic 5) can weight scores by comparison_count to discount low-confidence scores

## Consequences

- The comparison flow is the primary preference input — not a secondary feature
- No star ratings anywhere in the UI. Scores are ELO-derived, displayed as relative rankings or radar charts — not user-facing numbers
- Cold start is real: with <10 watched titles, comparisons are repetitive. Mitigated by seeding recommendations from community ratings until personal data accumulates
- Comparison dimensions are stored as data (`comparison_dimensions` table), not code — adding/removing dimensions is a data operation
- The recommendation engine operates on relative scores and genre affinity, not absolute ratings
- **Movies only in v1.** TV show comparisons are deferred — seasons within a show vary too dramatically in quality to compare at the show level, and season-level comparisons create an unwieldy cross-show comparison space (GoT S2 vs Modern Family S7 vs Outlander S1). The schema supports TV comparisons via `media_type` columns, but the UI and pair selection are scoped to movies until the TV comparison UX is properly designed
