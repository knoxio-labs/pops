# US-07: Dimension weights for overall ranking

> PRD: [037 — Ratings & Comparisons](README.md)
> Status: Not started

## Description

As a user, I want to assign a weight to each comparison dimension so that the overall ranking reflects which dimensions matter most to me (e.g., Entertainment matters more than Cinematography).

## Acceptance Criteria

- [ ] `weight` column added to `comparison_dimensions` table (REAL, DEFAULT 1.0)
- [ ] Weights are positive numbers (minimum 0.1, no upper cap — but UI slider goes 0.1 to 3.0)
- [ ] `updateDimension` procedure accepts optional `weight` parameter
- [ ] `listDimensions` response includes `weight` for each dimension
- [ ] Overall ranking calculation changes from simple average to weighted average: `SUM(score × weight) / SUM(weight)` across active dimensions
- [ ] Inactive dimensions are excluded from weighted average (same as before)
- [ ] Rankings page "Overall" view reflects weighted scores
- [ ] Dimension management UI shows weight slider (or number input) per dimension
- [ ] Weight changes take effect immediately on the rankings page (no recalculation needed — it's a query-time computation)
- [ ] Default weight is 1.0 for all dimensions (backward compatible — existing behaviour unchanged)
- [ ] If all weights are equal, result is identical to the current simple average
- [ ] Tests cover: weighted overall ranking, equal weights = simple average, zero-comparison movies still sort last, inactive dimensions excluded from weighted calc

## Notes

The weight is applied at **query time** in the overall ranking SQL, not stored per-movie. This means changing a weight instantly re-ranks all movies without replaying comparisons or updating scores. The per-dimension Elo scores are unchanged — only how they combine into "overall" changes.

Example: if Entertainment has weight 2.0 and Cinematography has weight 1.0, a movie that scores 1600 in Entertainment and 1400 in Cinematography gets overall = (1600×2 + 1400×1) / (2+1) = 1533, not the simple average of 1500.

The UI should make it clear that weights affect "Overall" ranking only — per-dimension rankings are unaffected.
