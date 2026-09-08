# @pops/date

Local-day derivation and calendar-boundary helpers, for any frontend that
needs to answer "what day is it, for this viewer, right now" or "what are
this viewer's day/week/month boundaries" — `toISOString()` cannot answer
either correctly, because it converts to UTC first. `src/local-date.ts`'s
header is the full account of why, and of which functions here are
local-anchored (read the viewer's own calendar fields) versus UTC-anchored
(fixed-width day arithmetic once a local starting day is known) — mixing the
two is the defect this module exists to prevent.

## Consumers

- `finance/app` — `today()` (the "add checkpoint" date field), and the
  dashboard's current-month range.

## Constraints

- **No build step, browser only.** `main` and `exports` point straight at
  `src/index.ts` and there is no `build` task — consumers transpile the
  source through their own bundler, the same as `@pops/ui` and
  `@pops/navigation`.
- **No dependencies.** Every function operates on a plain `Date`; nothing
  here needs a timezone library, and nothing here should start needing one
  without first asking why the platform `Date` stopped being enough.
