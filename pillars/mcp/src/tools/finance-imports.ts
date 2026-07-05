import { finance } from './finance-client.js';
import { mapCallResult, reqStr, toolError } from './utils.js';

import type { ToolDef } from './index.js';

const importsGetProgress: ToolDef = {
  name: 'finance.imports.getImportProgress',
  description:
    'Poll an in-progress transaction import session for status (dedup + entity-matching progress). Returns null when the session is unknown or expired.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Import session ID (UUID) returned by the import' },
    },
    required: ['sessionId'],
  },
  handler: async (args) => {
    const sessionId = reqStr(args, 'sessionId');
    if (!sessionId) return toolError('Missing required field: sessionId');
    return mapCallResult(await finance().imports.getImportProgress({ sessionId }));
  },
};

export const importsTools: readonly ToolDef[] = [importsGetProgress];
