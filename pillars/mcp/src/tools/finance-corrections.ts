import { MATCH_TYPES, finance, type MatchType } from './finance-client.js';
import { mapCallResult, optNum } from './utils.js';

import type { ToolDef } from './index.js';

const correctionsList: ToolDef = {
  name: 'finance.corrections.list',
  description:
    'List learned transaction-correction rules (patterns applied to auto-fill entity/tags on import). Filter by minimum confidence or match type.',
  inputSchema: {
    type: 'object',
    properties: {
      minConfidence: { type: 'number', description: 'Minimum confidence, 0-1' },
      matchType: {
        type: 'string',
        enum: [...MATCH_TYPES],
        description: 'Filter by match type',
      },
      limit: { type: 'number', description: 'Max results (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
    const result = await finance().corrections.list({
      minConfidence: optNum(args, 'minConfidence'),
      matchType: (MATCH_TYPES as readonly string[]).includes(args['matchType'] as string)
        ? (args['matchType'] as MatchType)
        : undefined,
      limit: optNum(args, 'limit'),
      offset: optNum(args, 'offset'),
    });
    return mapCallResult(result);
  },
};

const tagRulesVocabulary: ToolDef = {
  name: 'finance.tagRules.vocabulary',
  description: 'List the user tag vocabulary — every tag ever applied to a transaction.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => {
    return mapCallResult(await finance().tagRules.vocabulary());
  },
};

export const correctionsTools: readonly ToolDef[] = [correctionsList, tagRulesVocabulary];
