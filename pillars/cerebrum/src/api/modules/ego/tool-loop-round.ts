import { toActionsPart } from './tool-loop-helpers.js';

import type { EgoActionsPart, EgoMessagePart } from '../../../contract/rest-ego-parts.js';
import type { EgoMessage } from './llm.js';
import type { ToolRoundOutput } from './tool-loop-helpers.js';
import type { AutoExecutedGroup, LoopEvent, ProposedBatch } from './tool-loop-types.js';

interface ToolRoundParts {
  parts: EgoMessagePart[];
  autoExecuted: AutoExecutedGroup[];
  batch: ProposedBatch | null;
}

/** Turn dispatched writes into action parts, pausing only when proposals remain. */
export async function* emitToolRoundParts(params: {
  output: ToolRoundOutput;
  system: string;
  messages: EgoMessage[];
  round: number;
  newBatchId: () => string;
}): AsyncGenerator<LoopEvent, ToolRoundParts> {
  const parts: EgoMessagePart[] = [];
  const autoExecuted: AutoExecutedGroup[] = [];

  if (params.output.autoExecuted.length > 0) {
    const batchId = params.newBatchId();
    const group = { batchId, actions: params.output.autoExecuted };
    const part: EgoActionsPart = {
      type: 'actions',
      batchId,
      actions: params.output.autoExecuted.map((action) => ({
        actionId: action.actionId,
        tool: action.tool,
        summary: action.summary,
        status: action.isError ? 'failed' : 'executed',
      })),
    };
    autoExecuted.push(group);
    parts.push(part);
    yield { type: 'part', part };
  }

  if (params.output.actions.length === 0) return { parts, autoExecuted, batch: null };

  const batchId = params.newBatchId();
  const actionPart = toActionsPart(batchId, params.output.actions);
  parts.push(actionPart);
  yield { type: 'part', part: actionPart };
  return {
    parts,
    autoExecuted,
    batch: {
      batchId,
      actions: params.output.actions,
      state: {
        system: params.system,
        messages: params.messages,
        round: params.round,
        results: params.output.results,
      },
    },
  };
}
