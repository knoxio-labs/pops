/**
 * `codes.*` sub-router — model-backed sticker-code suggestions for the
 * inventory pillar's `codes/suggest`.
 *
 * `POST /codes/suggest` takes the new item, where it is going, and the codes
 * already in use, and asks a model for codes that continue the owner's own
 * conventions. The response is advisory: inventory re-checks every code
 * against its database before offering it, because only inventory knows
 * which codes are held. Gated by the service-account scope `ai.codes.suggest`
 * (`api/middleware/service-account-scope.ts`).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';

const c = initContract();

/** Upper bound on the existing codes one request may carry. */
export const MAX_EXISTING_CODES = 500;

/** Upper bound on how many suggestions one request may ask for. */
export const MAX_SUGGESTION_COUNT = 5;

const ExistingCodeSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  typeKey: z.string().min(1).max(64).optional(),
  place: z.string().min(1).max(300).optional(),
});

const CodesSuggestRequestSchema = z.object({
  item: z.object({
    name: z.string().min(1).max(200),
    typeKey: z.string().min(1).max(64).optional(),
    typeLabel: z.string().min(1).max(100).optional(),
    isContainer: z.boolean().optional(),
  }),
  destination: z
    .object({
      path: z.array(z.string().min(1).max(100)).max(12),
      container: z
        .object({ name: z.string().min(1).max(200), code: z.string().min(1).max(64).optional() })
        .optional(),
    })
    .optional(),
  existing: z.array(ExistingCodeSchema).max(MAX_EXISTING_CODES),
  stem: z.string().min(1).max(16).optional(),
  count: z.number().int().min(1).max(MAX_SUGGESTION_COUNT),
});

const CodeSuggestionSchema = z.object({
  code: z.string().min(1).max(64),
  reason: z.string().max(200),
});

const CodesSuggestResponseSchema = z.object({
  suggestions: z.array(CodeSuggestionSchema),
});

/** One existing code and the item that carries it. */
export type ExistingCode = z.infer<typeof ExistingCodeSchema>;

/** Everything the model is told about the code it is suggesting. */
export type CodesSuggestRequest = z.infer<typeof CodesSuggestRequestSchema>;

/** One suggested code and a short explanation of the convention it follows. */
export type CodeSuggestion = z.infer<typeof CodeSuggestionSchema>;

export const aiCodesContract = c.router({
  suggest: {
    method: 'POST',
    path: '/codes/suggest',
    body: CodesSuggestRequestSchema,
    responses: {
      200: CodesSuggestResponseSchema,
      400: ErrorBodySchema,
      403: z.object({ message: z.string() }),
      503: ErrorBodySchema,
    },
    summary: 'Suggest sticker codes for a new inventory item from the codes already in use',
  },
});
