# Epic 04: Ratings & Comparisons

> Theme: [Media](../README.md)

## Scope

Build the pairwise comparison system (per ADR-010). Two movies presented side by side across taste dimensions, user picks a winner, ELO scores update. Rankings page shows the leaderboard. Radar charts on detail pages visualise per-dimension scores.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 037 | [Ratings & Comparisons](../prds/037-ratings-comparisons/README.md) | Compare arena page, dimension management, ELO scoring algorithm, rankings page, radar charts on detail pages, quick-pick flow | Partial |
| 062 | [Comparison Intelligence](../prds/062-comparison-intelligence/README.md) | Probabilistic pair selection, staleness model, dimension exclusion, watch blacklist, skip cooloff, score confidence, freshness indicators | Not started |

## Dependencies

- **Requires:** Epic 03 (only watched movies can be compared)
- **Unlocks:** Epic 05 (recommendations use comparison scores)

## Out of Scope

- TV show comparisons (hard UX problem — see ideas/media-ideas.md)
- Post-watch debrief / rapid-fire review mode (PRD-063, future)
- Batch comparison / tier list drag-and-drop (PRD-064, future)
- AI-driven comparison prompts (future enhancement)
