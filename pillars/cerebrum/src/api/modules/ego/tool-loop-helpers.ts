import { runAllowedWrite } from './tool-loop-write.js';

import type { EgoActionsPart, EgoMessagePart } from '../../../contract/rest-ego-parts.js';
import type { EgoMessage, EgoLlm, EgoStreamDone, EgoToolUse, EgoTurnRequest } from './llm.js';
import type {
  AutoExecutedAction,
  LoopEvent,
  LoopToolResult,
  ProposedAction,
} from './tool-loop-types.js';
import type { EgoToolDefinition, EgoToolbox, ToolOutcome } from './toolbox.js';

interface ToolCallOutput {
  outcome: ToolOutcome;
  parts: EgoMessagePart[];
  started: boolean;
}

export interface ToolRoundOutput {
  actions: ProposedAction[];
  autoExecuted: AutoExecutedAction[];
  results: LoopToolResult[];
  parts: EgoMessagePart[];
}

/** Build the per-call model request, omitting tool fields when no tools exist. */
export function makeRequest(
  system: string,
  messages: EgoMessage[],
  definitions: EgoToolDefinition[],
  forceNoTools: boolean
): EgoTurnRequest {
  return {
    system,
    messages,
    ...(definitions.length > 0 ? { tools: definitions } : {}),
    ...(forceNoTools ? { toolChoice: 'none' as const } : {}),
  };
}

/** Stream one model call, forwarding tokens and accumulating usage totals. */
export async function* streamTurn(
  llm: EgoLlm,
  request: EgoTurnRequest,
  totals: { fullText: string; tokensIn: number; tokensOut: number }
): AsyncGenerator<LoopEvent, EgoStreamDone | undefined> {
  let response: EgoStreamDone | undefined;
  for await (const event of llm.stream(request)) {
    if (event.type === 'token') {
      totals.fullText += event.text;
      yield event;
    } else {
      response = event;
      totals.tokensIn += event.tokensIn;
      totals.tokensOut += event.tokensOut;
    }
  }
  return response;
}

/** Return whether a completed model turn can be dispatched to the toolbox. */
export function isToolTurn(response: EgoStreamDone): boolean {
  return response.stopReason === 'tool_use' && response.toolUses.length > 0;
}

/** Dispatch one model tool round and retain one result for every tool block. */
export async function* runToolRound(params: {
  toolbox: EgoToolbox | undefined;
  definitions: EgoToolDefinition[];
  response: EgoStreamDone;
  newActionId: () => string;
  allowedTools?: ReadonlySet<string>;
  runWrite?: (
    tool: string,
    args: Record<string, unknown>
  ) => Promise<{ text: string; isError: boolean }>;
}): AsyncGenerator<LoopEvent, ToolRoundOutput> {
  const output: ToolRoundOutput = { actions: [], autoExecuted: [], results: [], parts: [] };
  const handledIds = new Set<string>();

  for (const toolUse of params.response.toolUses) {
    handledIds.add(toolUse.id);
    const definition = params.definitions.find((item) => item.name === toolUse.name);
    const call = yield* runToolCall(params.toolbox, definition, toolUse);
    output.parts.push(...call.parts);
    if (call.outcome.kind === 'write') {
      const action = toProposedAction(call.outcome, toolUse.id, params.newActionId());
      if (params.allowedTools?.has(action.tool) && params.runWrite !== undefined) {
        const name = definition?.label ?? toolUse.name;
        const result = yield* runAllowedWrite(params.runWrite, name, action, call.started);
        output.autoExecuted.push({ ...action, result: result.text, isError: result.isError });
        output.results.push({
          toolUseId: toolUse.id,
          content: result.text,
          isError: result.isError,
        });
      } else {
        output.actions.push(action);
        output.results.push({ toolUseId: toolUse.id, actionId: action.actionId });
      }
    } else {
      output.results.push({
        toolUseId: toolUse.id,
        content: call.outcome.text,
        isError: call.outcome.isError,
      });
    }
  }

  for (const block of params.response.assistantContent) {
    if (block.type === 'tool_use' && !handledIds.has(block.id)) {
      output.results.push({
        toolUseId: block.id,
        content: 'The tool input was not valid.',
        isError: true,
      });
    }
  }
  return output;
}

async function* runToolCall(
  toolbox: EgoToolbox | undefined,
  definition: EgoToolDefinition | undefined,
  toolUse: EgoToolUse
): AsyncGenerator<LoopEvent, ToolCallOutput> {
  const name = definition?.label ?? toolUse.name;
  const started = definition?.write !== true;
  if (started) yield { type: 'tool', name, status: 'started' };
  const outcome = await dispatch(toolbox, toolUse);
  const parts = outcome.kind === 'result' ? (outcome.parts ?? []) : [];
  if (outcome.kind === 'result') {
    yield { type: 'tool', name, status: outcome.isError ? 'failed' : 'finished' };
    for (const part of parts) yield { type: 'part', part };
    if (outcome.navigate !== undefined) yield { type: 'navigate', uri: outcome.navigate };
  }
  return { outcome, parts, started };
}

function toProposedAction(
  outcome: Extract<ToolOutcome, { kind: 'write' }>,
  toolUseId: string,
  actionId: string
): ProposedAction {
  return {
    actionId,
    toolUseId,
    tool: outcome.tool,
    args: outcome.args,
    summary: outcome.summary,
  };
}

/** Create the typed pending-action part emitted for a proposed batch. */
export function toActionsPart(batchId: string, actions: ProposedAction[]): EgoActionsPart {
  return {
    type: 'actions',
    batchId,
    actions: actions.map(({ actionId, tool, summary }) => ({
      actionId,
      tool,
      summary,
      status: 'pending',
    })),
  };
}

/** Build one user message containing all tool result blocks for the turn. */
export function resultMessage(results: LoopToolResult[]): EgoMessage {
  return {
    role: 'user',
    content: results.flatMap((result) =>
      'content' in result
        ? [
            {
              type: 'tool_result' as const,
              tool_use_id: result.toolUseId,
              content: result.content,
              is_error: result.isError,
            },
          ]
        : []
    ),
  };
}

async function dispatch(
  toolbox: EgoToolbox | undefined,
  toolUse: EgoToolUse
): Promise<ToolOutcome> {
  try {
    if (toolbox === undefined) {
      return { kind: 'result', text: 'Toolbox is unavailable.', isError: true };
    }
    return await toolbox.dispatch(toolUse.name, toolUse.input);
  } catch (error) {
    return {
      kind: 'result',
      text: error instanceof Error ? error.message : String(error),
      isError: true,
    };
  }
}
