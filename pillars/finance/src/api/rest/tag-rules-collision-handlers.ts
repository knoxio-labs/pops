/**
 * Handler for `tagRules.resolveAddCollisions` (POPS-2955). Split out of
 * `tag-rules-handlers.ts` so that file stays under the per-file line cap.
 */
import { resolveTagRuleAddCollisions } from '../modules/tag-rules/collision-check.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeTagRulesContract } from '../../contract/rest-tag-rules.js';
import type { FinanceDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof financeTagRulesContract>;

export function makeTagRuleCollisionHandlers(db: FinanceDb) {
  return {
    resolveAddCollisions: ({ body }: Req['resolveAddCollisions']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          collisions: body.changeSets.map((changeSet) =>
            resolveTagRuleAddCollisions(db, changeSet)
          ),
        },
      })),
  };
}
