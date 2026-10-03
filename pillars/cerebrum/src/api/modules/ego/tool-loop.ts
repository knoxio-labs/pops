import {
  isToolTurn,
  makeRequest,
  resultMessage,
  runToolRound,
  streamTurn,
} from './tool-loop-helpers.js';
import { emitToolRoundParts } from './tool-loop-round.js';
import { MAX_TOOL_ROUNDS } from './tool-loop-types.js';

import type { EgoMessagePart } from '../../../contract/rest-ego-parts.js';
import type { EgoMessage, EgoLlm } from './llm.js';
import type { AutoExecutedGroup, LoopEvent, ProposedBatch } from './tool-loop-types.js';
import type { EgoToolbox } from './toolbox.js';

/** Public tool-loop contracts and the 40-round runaway backstop. */
export { MAX_TOOL_ROUNDS };
export type {
  AutoExecutedAction,
  AutoExecutedGroup,
  LoopEvent,
  LoopToolResult,
  PausedLoopState,
  ProposedAction,
  ProposedBatch,
} from './tool-loop-types.js';

/**
 * Alternate model turns with toolbox dispatch. Reads and explicitly allowed
 * writes run immediately; other writes are returned as a pending batch.
 */
export async function* runToolLoop(params: {
  llm: EgoLlm;
  toolbox?: EgoToolbox;
  system: string;
  messages: EgoMessage[];
  newActionId: () => string;
  newBatchId: () => string;
  startRound?: number;
  allowedTools?: ReadonlySet<string>;
  runWrite?: (
    tool: string,
    args: Record<string, unknown>
  ) => Promise<{ text: string; isError: boolean }>;
}): AsyncGenerator<LoopEvent> {
  const definitions = (await params.toolbox?.definitions()) ?? [];
  const workingMessages = [...params.messages];
  const totals = { fullText: '', tokensIn: 0, tokensOut: 0 };
  const parts: EgoMessagePart[] = [];
  let round = params.startRound ?? 0;
  let batch: ProposedBatch | null = null;
  const autoExecuted: AutoExecutedGroup[] = [];

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
      allowedTools: params.allowedTools,
      runWrite: params.runWrite,
    });
    const roundParts = yield* emitToolRoundParts({
      output,
      system: params.system,
      messages: workingMessages,
      round,
      newBatchId: params.newBatchId,
    });
    parts.push(...output.parts, ...roundParts.parts);
    autoExecuted.push(...roundParts.autoExecuted);
    if (roundParts.batch === null) {
      workingMessages.push(resultMessage(output.results));
      continue;
    }
    batch = roundParts.batch;
    break;
  }

  yield toDoneEvent(totals, parts, batch, autoExecuted);
}

function toDoneEvent(
  totals: { fullText: string; tokensIn: number; tokensOut: number },
  parts: EgoMessagePart[],
  batch: ProposedBatch | null,
  autoExecuted: AutoExecutedGroup[]
): Extract<LoopEvent, { type: 'done' }> {
  return {
    type: 'done',
    fullText: totals.fullText,
    parts,
    batch,
    autoExecuted,
    tokensIn: totals.tokensIn,
    tokensOut: totals.tokensOut,
  };
}
