import {
  isToolTurn,
  makeRequest,
  resultMessage,
  runToolRound,
  streamTurn,
  toActionsPart,
} from './tool-loop-helpers.js';
import { MAX_TOOL_ROUNDS } from './tool-loop-types.js';

import type { EgoMessagePart } from '../../../contract/rest-ego-parts.js';
import type { EgoMessage, EgoLlm } from './llm.js';
import type { LoopEvent, ProposedBatch } from './tool-loop-types.js';
import type { EgoToolbox } from './toolbox.js';

/** Public tool-loop contracts and the 40-round runaway backstop. */
export { MAX_TOOL_ROUNDS };
export type {
  LoopEvent,
  LoopToolResult,
  PausedLoopState,
  ProposedAction,
  ProposedBatch,
} from './tool-loop-types.js';

/**
 * Alternate model turns with toolbox dispatch. Read calls run immediately;
 * writes are returned as a pending batch without another model call.
 */
export async function* runToolLoop(params: {
  llm: EgoLlm;
  toolbox?: EgoToolbox;
  system: string;
  messages: EgoMessage[];
  newActionId: () => string;
  newBatchId: () => string;
  startRound?: number;
}): AsyncGenerator<LoopEvent> {
  const definitions = (await params.toolbox?.definitions()) ?? [];
  const workingMessages = [...params.messages];
  const totals = { fullText: '', tokensIn: 0, tokensOut: 0 };
  const parts: EgoMessagePart[] = [];
  let round = params.startRound ?? 0;
  let batch: ProposedBatch | null = null;

  while (true) {
    const forceNoTools = round >= MAX_TOOL_ROUNDS;
    const response = yield* streamTurn(
      params.llm,
      makeRequest(params.system, workingMessages, definitions, forceNoTools),
      totals
    );
    if (response === undefined || forceNoTools || !isToolTurn(response)) break;

    round += 1;
    workingMessages.push({ role: 'assistant', content: response.assistantContent });
    const output = yield* runToolRound({
      toolbox: params.toolbox,
      definitions,
      response,
      newActionId: params.newActionId,
    });
    parts.push(...output.parts);

    if (output.actions.length === 0) {
      workingMessages.push(resultMessage(output.results));
      continue;
    }

    const batchId = params.newBatchId();
    const actionPart = toActionsPart(batchId, output.actions);
    parts.push(actionPart);
    yield { type: 'part', part: actionPart };
    batch = {
      batchId,
      actions: output.actions,
      state: { system: params.system, messages: workingMessages, round, results: output.results },
    };
    break;
  }

  yield {
    type: 'done',
    fullText: totals.fullText,
    parts,
    batch,
    tokensIn: totals.tokensIn,
    tokensOut: totals.tokensOut,
  };
}
