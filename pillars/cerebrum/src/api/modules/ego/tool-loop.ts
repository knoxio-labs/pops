import {
  isToolTurn,
  makeRequest,
  resultMessage,
  runToolRound,
  streamTurn,
  toActionsPart,
} from './tool-loop-helpers.js';

import type { EgoMessagePart } from '../../../contract/rest-ego-parts.js';
import type { EgoMessage, EgoLlm } from './llm.js';

/** Runaway backstop for a model that never stops calling tools, not a product limit. */
export const MAX_TOOL_ROUNDS = 40;

/** A write proposed by the model and held for a person's decision. */
export interface ProposedAction {
  actionId: string;
  toolUseId: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
}

/** A tool result, or a write proposal still waiting for the person's decision. */
export type LoopToolResult =
  | { toolUseId: string; content: string; isError: boolean }
  | { toolUseId: string; actionId: string };

/** State required to resume after the proposed batch is decided. */
export interface PausedLoopState {
  system: string;
  messages: EgoMessage[];
  round: number;
  results: LoopToolResult[];
}

/** A batch of proposed writes and the paused model turn that produced it. */
export interface ProposedBatch {
  batchId: string;
  actions: ProposedAction[];
  state: PausedLoopState;
}

/** Events yielded while the model and tools run one conversation turn. */
export type LoopEvent =
  | { type: 'token'; text: string }
  | { type: 'tool'; name: string; status: 'started' | 'finished' | 'failed' }
  | { type: 'part'; part: EgoMessagePart }
  | { type: 'navigate'; uri: string }
  | {
      type: 'done';
      fullText: string;
      parts: EgoMessagePart[];
      batch: ProposedBatch | null;
      tokensIn: number;
      tokensOut: number;
    };

/**
 * Alternate model turns with toolbox dispatch. Read calls run immediately;
 * writes are returned as a pending batch without another model call.
 */
export async function* runToolLoop(params: {
  llm: EgoLlm;
  toolbox?: import('./toolbox.js').EgoToolbox;
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
