import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';

import type { EgoLlm, EgoMessage, EgoStreamDone, EgoToolUse, EgoTurnRequest } from '../llm.js';
import type { EgoToolbox, ToolOutcome } from '../toolbox.js';

/** One canned final model turn for a scripted EgoLlm fake. */
export interface ScriptedTurn {
  text?: string;
  toolUses?: EgoToolUse[];
  stopReason?: EgoStreamDone['stopReason'];
  assistantContent?: ContentBlockParam[];
}

/** A scripted model and the requests it received, for offline tool-loop tests. */
export function scriptedLlm(turns: ScriptedTurn[]): {
  llm: EgoLlm;
  requests: EgoTurnRequest[];
} {
  const script = turns.length > 0 ? turns : [{}];
  const requests: EgoTurnRequest[] = [];
  let index = 0;
  const llm: EgoLlm = {
    model: () => 'scripted-model',
    async *stream(request) {
      requests.push(request);
      const turn = script[Math.min(index, script.length - 1)] ?? {};
      index += 1;
      const text = turn.text ?? '';
      if (text !== '') yield { type: 'token', text };
      const toolUses = turn.toolUses ?? [];
      const assistantContent = turn.assistantContent ?? [
        ...(text === '' ? [] : [{ type: 'text' as const, text }]),
        ...toolUses.map((toolUse) => ({
          type: 'tool_use' as const,
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
        })),
      ];
      yield {
        type: 'done',
        fullText: text,
        tokensIn: 1,
        tokensOut: 1,
        assistantContent,
        toolUses,
        stopReason: turn.stopReason ?? (toolUses.length > 0 ? 'tool_use' : 'end'),
      };
    },
  };
  return { llm, requests };
}

/** A toolbox fake with call recording and optional write-marked definitions. */
export function fakeToolbox(
  tools: Record<string, (input: Record<string, unknown>) => ToolOutcome | Promise<ToolOutcome>>,
  options?: { writes?: readonly string[] }
): { toolbox: EgoToolbox; calls: Array<{ name: string; input: Record<string, unknown> }> } {
  const writes = new Set(options?.writes ?? []);
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const toolbox: EgoToolbox = {
    async definitions() {
      return Object.keys(tools).map((name) => ({
        name,
        label: name,
        description: 'Description for ' + name,
        inputSchema: { type: 'object', properties: {} },
        ...(writes.has(name) ? { write: true } : {}),
      }));
    },
    async dispatch(name, input) {
      calls.push({ name, input });
      const handler = tools[name];
      if (handler !== undefined) return handler(input);
      if (writes.has(name)) {
        return {
          kind: 'write',
          tool: name,
          args: input,
          summary: name + ' ' + JSON.stringify(input),
        };
      }
      return { kind: 'result', text: 'Unknown tool: ' + name, isError: true };
    },
  };
  return { toolbox, calls };
}

/** Build a minimal user request for a scripted EgoLlm. */
export function userMessage(content: string): EgoMessage {
  return { role: 'user', content };
}
