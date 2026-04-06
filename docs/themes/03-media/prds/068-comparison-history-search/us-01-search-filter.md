# US-01: Comparison history search by movie title

> PRD: [068 — Comparison History Search & Filter](README.md)
> Status: In progress

## Description

As a user, I want to search my comparison history by movie title so that I can quickly find all comparisons involving a specific film.

## Acceptance Criteria

- [ ] Search input renders beside the dimension dropdown on the comparison history page
- [ ] Typing in the search input filters the list to comparisons where either movie's title matches (case-insensitive, substring)
- [ ] Search is debounced (300 ms) to avoid spamming the API on each keystroke
- [ ] Changing the search term resets pagination to page 1
- [ ] The "N comparisons" count reflects the filtered total, not the global total
- [ ] Search and dimension filter compose: both may be active simultaneously
- [ ] Empty search string returns the unfiltered list (no active search)
- [ ] `search` param validated: max 100 characters
- [ ] Tests cover: search renders, search triggers filtered query, empty search clears filter
