# Theme: Finance — Product Spec (Retroactive)

> Document what finance does, not how it's built. Insurance against a rewrite.

## Purpose

This is not a feature theme. No new features are designed here. The goal is to capture the finance app's product behaviour — what it does, how the user interacts with it, what the data model represents — in enough detail that the system could be rebuilt from this spec alone, without reading the current codebase.

The finance app already exists and works. But it was built iteratively without product specs. If the codebase ever needs a clean rewrite (tech debt, architectural shift, platform changes), the spec is the source of truth for *what to build*, independent of *how it was built*.

## What This Covers

The finance app has 7 distinct product areas:

| # | Area | What it does |
|---|------|-------------|
| 1 | Transactions | Ledger of all financial transactions across accounts. CRUD, filtering, sorting, inline tag editing |
| 2 | Import Pipeline | Multi-step wizard for importing bank CSVs. Entity matching, deduplication, tag suggestion, review flow |
| 3 | Entities | Merchant/payee registry. Names, types, aliases, default tags. Central reference for transaction matching |
| 4 | Corrections | Learned tagging rules. Pattern matching (exact/contains/regex) with confidence scoring. The system learns from user edits |
| 5 | Budgets | Spending categories with period limits (monthly/yearly). Active/inactive toggle |
| 6 | Wishlist | Savings goals with target amounts and progress tracking |
| 7 | AI Categorisation | Claude Haiku-powered entity matching and tag suggestion. Disk-cached, cost-tracked, used as fallback when rule-based matching fails |

## Spec Structure

Each area gets a standalone spec document. These are NOT epics or PRDs — they're product descriptions. They document:

- **What the user can do** (features and flows)
- **What data exists** (schema, relationships, constraints)
- **What the business rules are** (matching strategies, dedup logic, confidence thresholds)
- **What edge cases exist** (and how they're currently handled)

They do NOT document:
- File paths, function names, or implementation details
- Framework choices (React, tRPC, Zustand)
- UI component architecture
- Test coverage

## Specs

| Spec | Area | Status |
|------|------|--------|
| [FS-001: Transactions](specs/fs-001-transactions.md) | Transaction ledger, CRUD, tagging | Not started |
| [FS-002: Import Pipeline](specs/fs-002-import-pipeline.md) | Bank import wizard, entity matching, dedup, review flow | Not started |
| [FS-003: Entities](specs/fs-003-entities.md) | Merchant registry, aliases, default tags | Not started |
| [FS-004: Corrections](specs/fs-004-corrections.md) | Learned tagging rules, confidence scoring, pattern matching | Not started |
| [FS-005: Budgets](specs/fs-005-budgets.md) | Budget categories, period limits | Not started |
| [FS-006: Wishlist](specs/fs-006-wishlist.md) | Savings goals, progress tracking | Not started |
| [FS-007: AI Categorisation](specs/fs-007-ai-categorisation.md) | Claude Haiku integration, caching, cost tracking | Not started |

## Why Not Epics + PRDs?

Epics and PRDs are forward-looking — they describe what to build next. These specs are backward-looking — they describe what already exists. The format is different:

- No user stories (the features are live, not planned)
- No acceptance criteria (the system already passes — it works)
- No dependencies (everything is already built)
- Focus on *behaviour and rules*, not *implementation tasks*

If finance ever gets a "Polish" theme with new features, those would get proper epics and PRDs. The retroactive spec is the baseline those features would build on.

## When to Update

- When a finance feature is changed, update the spec to match
- When a bug reveals a behaviour that wasn't documented, add it
- When a rewrite is planned, this is the starting point
