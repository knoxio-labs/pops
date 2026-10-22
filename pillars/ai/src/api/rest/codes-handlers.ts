/**
 * Handler for `POST /codes/suggest` — see `../modules/ai-codes/prompt.ts` for
 * the instructions and filtering, and `../../contract/rest-codes.ts` for the
 * wire contract.
 *
 * Every failure is a 503: no API key, a refused or truncated reply, a reply
 * that is not the demanded JSON, or no usable code left after filtering.
 * Inventory treats any non-2xx as "fall back to deterministic numbering".
 */
import { createAnthropicCodeModel, type CodeModel } from '../modules/ai-codes/model.js';
import { buildCodePrompt, parseCodeReply } from '../modules/ai-codes/prompt.js';
import { ServiceUnavailableError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { aiCodesContract } from '../../contract/rest-codes.js';
import type { AiDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof aiCodesContract>;

/**
 * @param model Injected by tests; production builds the Anthropic-backed model
 *   once, or null when no API key is configured.
 */
export function makeAiCodesHandlers(
  db: AiDb,
  model: CodeModel | null = createAnthropicCodeModel(db)
) {
  return {
    suggest: ({ body }: Req['suggest']) =>
      runHttp(async () => {
        if (model === null) throw new ServiceUnavailableError('No model API key is configured');
        const reply = await model(buildCodePrompt(body));
        if (reply.kind !== 'text') {
          throw new ServiceUnavailableError(`The model reply was ${reply.kind}`);
        }
        const suggestions = parseCodeReply(reply.text, body);
        if (suggestions === null) {
          throw new ServiceUnavailableError('The model reply was not the expected JSON');
        }
        if (suggestions.length === 0) {
          throw new ServiceUnavailableError('The model suggested no usable code');
        }
        return { status: 200 as const, body: { suggestions } };
      }),
  };
}
