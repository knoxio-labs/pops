# US-07: Freshness indicator

> PRD: [062 — Comparison Intelligence](README.md)
> Status: Not started

## Description

As a user, I want to see a freshness badge on movies so I know at a glance how recent my watch was and whether I've marked something as stale.

## Acceptance Criteria

- [ ] Freshness badge shows on movie cards in the compare arena (both cards)
- [ ] Freshness badge shows on the movie detail page
- [ ] Badge derived from `daysSinceLastWatch` (most recent non-blacklisted watch event):
  - 0–30 days: "Fresh" (green)
  - 31–90 days: "Recent" (blue)
  - 91–365 days: "Fading" (yellow)
  - 365+ days: "Stale" (red)
- [ ] If the movie has a `comparison_staleness` row with `staleness < 1.0`, badge shows "Stale" (red) regardless of watch recency
- [ ] Badge is a small pill/chip near the movie title or poster corner — not intrusive
- [ ] Library page optionally shows freshness (e.g. as a sort option or filter, not on every card by default)
- [ ] Tests: correct badge for each time range, stale override, no badge for unwatched movies

## Notes

The freshness badge is informational — it helps the user decide whether to mark something stale in the arena. The pair selection algorithm (US-05) uses `daysSinceLastWatch` for weighting independently, so the badge is the visual representation of the same signal.
