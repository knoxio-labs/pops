/**
 * Pre-call budget enforcement glue between `trackInference()` and the
 * `core.aiBudgets` enforcement service (PRD-092 US-04).
 *
 * Returns the (possibly swapped) call params under which the live provider
 * call should execute, or throws `BudgetExceededError` for hard blocks.
 * Cached calls bypass this entirely — the middleware short-circuits before
 * calling `enforceBudgets()`.
 *
 * Split out of `inference-middleware.ts` so both files stay under the
 * project's max-lines lint budget.
 */
import {
  evaluateBudgetsForCall,
  findFallbackProvider,
  type BudgetBreach,
} from '../modules/core/ai-budgets/service.js';
import { BudgetExceededError } from '../shared/errors.js';
import { logger } from './logger.js';

import type {
  InferenceLogInsert,
  ResolvedInferenceParams,
  TrackInferenceParams,
} from './inference-middleware-types.js';

function blockedLogValues(
  params: TrackInferenceParams,
  resolved: ResolvedInferenceParams,
  breach: BudgetBreach
): InferenceLogInsert {
  return {
    provider: params.provider,
    model: params.model,
    operation: params.operation,
    domain: resolved.domain,
    contextId: resolved.contextId,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    latencyMs: 0,
    status: 'budget-blocked',
    cached: 0,
    errorMessage: `budget '${breach.budget.id}' exceeded (${breach.limitType})`,
  };
}

function throwBlocked(breach: BudgetBreach): never {
  throw new BudgetExceededError({
    budgetId: breach.budget.id,
    limitType: breach.limitType,
    currentUsage: breach.currentUsage,
    limit: breach.limit,
  });
}

function handleBlock(
  params: TrackInferenceParams,
  resolved: ResolvedInferenceParams,
  breach: BudgetBreach,
  insertLog: (values: InferenceLogInsert) => void
): never {
  insertLog(blockedLogValues(params, resolved, breach));
  throwBlocked(breach);
}

function handleFallback(
  params: TrackInferenceParams,
  resolved: ResolvedInferenceParams,
  breach: BudgetBreach,
  insertLog: (values: InferenceLogInsert) => void
): TrackInferenceParams {
  const target = findFallbackProvider();
  if (!target) {
    logger.warn(
      { budgetId: breach.budget.id, limitType: breach.limitType },
      '[inference] Budget fallback with no active local provider — blocking call'
    );
    handleBlock(params, resolved, breach, insertLog);
  }
  logger.warn(
    {
      budgetId: breach.budget.id,
      limitType: breach.limitType,
      originalProvider: params.provider,
      originalModel: params.model,
      fallbackProvider: target.provider,
      fallbackModel: target.model,
    },
    '[inference] Budget exceeded — routing to local fallback provider'
  );
  return { ...params, provider: target.provider, model: target.model };
}

export function enforceBudgets(
  params: TrackInferenceParams,
  resolved: ResolvedInferenceParams,
  insertLog: (values: InferenceLogInsert) => void
): TrackInferenceParams {
  let breaches: BudgetBreach[];
  try {
    ({ breaches } = evaluateBudgetsForCall(params.provider, params.operation));
  } catch (err) {
    // Fail open: a broken budget query (e.g. ai_budgets table missing in a
    // partially-mocked test context) must not stop legitimate AI calls.
    logger.warn(
      { err, provider: params.provider, operation: params.operation },
      '[inference] Budget evaluation failed — proceeding without enforcement'
    );
    return params;
  }
  if (breaches.length === 0) return params;

  const block = breaches.find((b) => b.budget.action === 'block');
  if (block) handleBlock(params, resolved, block, insertLog);

  const fallback = breaches.find((b) => b.budget.action === 'fallback');
  if (fallback) return handleFallback(params, resolved, fallback, insertLog);

  for (const warn of breaches.filter((b) => b.budget.action === 'warn')) {
    logger.warn(
      {
        budgetId: warn.budget.id,
        limitType: warn.limitType,
        currentUsage: warn.currentUsage,
        limit: warn.limit,
      },
      '[inference] Budget warning — proceeding with call'
    );
  }
  return params;
}
