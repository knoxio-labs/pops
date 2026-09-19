/**
 * Handler for `POST /codes/rank` — see `../modules/ai-codes/ranker.ts` for
 * the heuristic and `../../contract/rest-codes.ts` for the wire contract.
 *
 * Stateless: no DB, no model call. Every response is a permutation of the
 * request's `candidates`, by construction of `rankCandidates`.
 */
import { rankCandidates } from '../modules/ai-codes/ranker.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { aiCodesContract } from '../../contract/rest-codes.js';

type Req = ServerInferRequest<typeof aiCodesContract>;

export function makeAiCodesHandlers() {
  return {
    rank: ({ body }: Req['rank']) =>
      runHttp(() => {
        const ranked = rankCandidates(body);
        return { status: 200 as const, body: { ranked } };
      }),
  };
}
