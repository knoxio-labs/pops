# US-06: Budgets search adapter (backend)

> PRD: [057 — Search Engine](README.md)
> Status: Done

## Description

As the system, I search budgets by category and return typed `SearchHit` results with period and amount.

## Acceptance Criteria

- [x] Adapter registered with `domain: "budgets"`, icon: `"PiggyBank"`, color: `"green"`
- [x] Searches budgets by `category` column (case-insensitive LIKE)
- [x] Relevance scoring: exact match (1.0) > prefix (0.8) > contains (0.5)
- [x] `matchField: "category"` and `matchType` set correctly per hit
- [x] Hit data shape: `{ category, period, amount }`
- [x] Respects `options.limit` parameter
- [x] Tests: search returns correct hits, scoring correct

## Notes

Only `category` is searched.
