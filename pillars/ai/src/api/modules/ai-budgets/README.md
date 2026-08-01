# AI budgets

Monthly token and cost ceilings over the inference log. A budget row in
`ai_budgets` is keyed by its `id`; `scopeType` is `global`, `provider`, or
`operation`, with the scoped id in `scopeValue`.

## What is wired, and what is not

The REST surface (`GET /ai-budgets`, `POST /ai-budgets`, `GET /ai-budgets/status`)
is declared in `../../../contract/rest-ai-budgets.ts` and served by
`../../rest/ai-budgets-handlers.ts`, which wraps `service.ts`. The alert
evaluator reads `ai_budgets` directly to fire `budget-threshold` alerts — see
`../ai-alerts/evaluators/budget.ts`. That is the whole of budgets' present
effect: **budgets are observed and alerted on, but never enforced.**

`enforcement.ts` is the exception, and its name overpromises. Its three exports
— `evaluateBudgetsForCall`, `findFallbackProvider`, `migrateLegacyBudgetSettings`
— are re-exported from `service.ts` and called only from
`__tests__/service.test.ts`; no handler and no server startup path invokes them.

The consequence: the `action` column (`block` / `warn` / `fallback`) is stored,
returned, and rendered in the usage page, but decides nothing.
